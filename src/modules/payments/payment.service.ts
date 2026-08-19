import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../../common/errors/app-error.js';
import { AuditService } from '../../common/services/audit.service.js';
import { RealtimeService } from '../../common/services/realtime.service.js';
import { ManagerAuthService } from '../auth/manager-auth.service.js';
import { CreatePaymentInput, CreateRefundInput, ListPaymentsQuery } from './payment.schema.js';
import { AuthenticatedUserContext } from '../../common/types/index.js';

export class PaymentService {
  /**
   * Helper to serialize Decimal fields to numbers for clean API responses.
   */
  public static serializePayment(payment: Record<string, unknown>): Record<string, unknown> {
    const rawRefunds = Array.isArray(payment.refunds)
      ? (payment.refunds as Record<string, unknown>[])
      : [];

    return {
      ...payment,
      amount:
        payment.amount instanceof Prisma.Decimal
          ? payment.amount.toNumber()
          : Number(payment.amount || 0),
      amountTendered:
        payment.amountTendered instanceof Prisma.Decimal
          ? payment.amountTendered.toNumber()
          : payment.amountTendered !== null && payment.amountTendered !== undefined
            ? Number(payment.amountTendered)
            : null,
      changeAmount:
        payment.changeAmount instanceof Prisma.Decimal
          ? payment.changeAmount.toNumber()
          : payment.changeAmount !== null && payment.changeAmount !== undefined
            ? Number(payment.changeAmount)
            : null,
      refundedAmount:
        payment.refundedAmount instanceof Prisma.Decimal
          ? payment.refundedAmount.toNumber()
          : Number(payment.refundedAmount || 0),
      refunds: payment.refunds
        ? rawRefunds.map((ref) => ({
            ...ref,
            amount:
              ref.amount instanceof Prisma.Decimal
                ? ref.amount.toNumber()
                : Number(ref.amount || 0),
          }))
        : undefined,
      order:
        payment.order && typeof payment.order === 'object'
          ? {
              ...(payment.order as Record<string, unknown>),
              grandTotal:
                (payment.order as Record<string, unknown>).grandTotal instanceof Prisma.Decimal
                  ? (
                      (payment.order as Record<string, unknown>).grandTotal as Prisma.Decimal
                    ).toNumber()
                  : Number((payment.order as Record<string, unknown>).grandTotal || 0),
              paidAmount:
                (payment.order as Record<string, unknown>).paidAmount instanceof Prisma.Decimal
                  ? (
                      (payment.order as Record<string, unknown>).paidAmount as Prisma.Decimal
                    ).toNumber()
                  : Number((payment.order as Record<string, unknown>).paidAmount || 0),
              changeAmount:
                (payment.order as Record<string, unknown>).changeAmount instanceof Prisma.Decimal
                  ? (
                      (payment.order as Record<string, unknown>).changeAmount as Prisma.Decimal
                    ).toNumber()
                  : Number((payment.order as Record<string, unknown>).changeAmount || 0),
            }
          : undefined,
    };
  }

  /**
   * Helper to serialize Refund fields.
   */
  public static serializeRefund(refund: Record<string, unknown>): Record<string, unknown> {
    return {
      ...refund,
      amount:
        refund.amount instanceof Prisma.Decimal
          ? refund.amount.toNumber()
          : Number(refund.amount || 0),
    };
  }

  /**
   * 1. Process and record a payment against an active order.
   */
  public static async processPayment(
    restaurantId: string,
    input: CreatePaymentInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ): Promise<Record<string, unknown>> {
    // 1. Locate Order
    const order = await prisma.order.findFirst({
      where: {
        id: input.orderId,
        restaurantId,
      },
    });

    if (!order) {
      throw new NotFoundError(`Order with ID ${input.orderId} not found`);
    }

    // 2. Validate Order Status (Never allow payments on CANCELLED or VOIDED orders)
    if (order.status === 'CANCELLED' || order.status === 'VOIDED') {
      throw new BadRequestError(`Cannot accept payments on an order that is ${order.status}`);
    }

    // 3. Validate Payment Status (Never accept payments on fully PAID orders)
    if (order.paymentStatus === 'PAID') {
      throw new BadRequestError('Order is already fully paid');
    }

    // 4. Duplicate Reference Protection
    if (input.reference && input.reference.trim() !== '') {
      const existingRef = await prisma.payment.findFirst({
        where: {
          restaurantId,
          reference: input.reference.trim(),
          status: { not: 'VOIDED' },
        },
      });

      if (existingRef) {
        throw new ConflictError(
          `A payment with reference "${input.reference.trim()}" has already been processed`,
        );
      }
    }

    // 5. Balance Validation
    const paymentDecimal = new Prisma.Decimal(input.amount);
    const outstandingBalance = order.grandTotal.minus(order.paidAmount);

    if (paymentDecimal.greaterThan(outstandingBalance)) {
      throw new BadRequestError(
        `Payment amount (${paymentDecimal.toFixed(2)}) exceeds outstanding balance (${outstandingBalance.toFixed(2)})`,
      );
    }

    // 6. Cash Change Calculation (strictly calculated, not manually trusted from client)
    let changeAmountDecimal = new Prisma.Decimal(0);
    let amountTenderedDecimal: Prisma.Decimal | null = null;

    if (input.paymentMethod === 'CASH') {
      if (input.amountTendered !== undefined) {
        amountTenderedDecimal = new Prisma.Decimal(input.amountTendered);
        if (amountTenderedDecimal.lessThan(paymentDecimal)) {
          throw new BadRequestError('Amount tendered cannot be less than payment amount');
        }
        changeAmountDecimal = amountTenderedDecimal.minus(paymentDecimal);
      } else {
        amountTenderedDecimal = paymentDecimal;
      }
    }

    // 7. Locate Active Cashier Shift (if any)
    const activeShift = await prisma.cashierShift.findFirst({
      where: {
        restaurantId,
        cashierId: actor.id,
        status: 'OPEN',
      },
    });

    // 8. Calculate new order totals and payment status
    const newPaidAmount = order.paidAmount.add(paymentDecimal);
    const newOrderChange = order.changeAmount.add(changeAmountDecimal);
    const isFullyPaid = newPaidAmount.greaterThanOrEqualTo(order.grandTotal);
    const newPaymentStatus = isFullyPaid ? 'PAID' : 'PARTIALLY_PAID';

    // 9. Execute Transactional Mutations
    const result = await prisma.$transaction(async (tx) => {
      // Create Payment
      const payment = await tx.payment.create({
        data: {
          restaurantId,
          orderId: order.id,
          shiftId: activeShift?.id ?? null,
          paymentMethod: input.paymentMethod,
          amount: paymentDecimal,
          amountTendered: amountTenderedDecimal,
          changeAmount: changeAmountDecimal,
          reference: input.reference?.trim() ?? null,
          cardLast4: input.cardLast4 ?? null,
          cardBrand: input.cardBrand ?? null,
          status: 'COMPLETED',
          notes: input.notes?.trim() ?? null,
          createdById: actor.id,
        },
      });

      // If CASH payment and active shift, record CashTransaction and update shift cashSales
      if (input.paymentMethod === 'CASH' && activeShift) {
        await tx.cashTransaction.create({
          data: {
            restaurantId,
            shiftId: activeShift.id,
            type: 'CASH_SALE',
            amount: paymentDecimal,
            reason: `Order Payment: ${order.orderCode}`,
            paymentId: payment.id,
            createdById: actor.id,
          },
        });

        await tx.cashierShift.update({
          where: { id: activeShift.id },
          data: {
            cashSales: {
              increment: paymentDecimal,
            },
          },
        });
      }

      // Update Order Payment Status and Totals
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          paidAmount: newPaidAmount,
          changeAmount: newOrderChange,
          paymentStatus: newPaymentStatus,
          paymentMethod: input.paymentMethod,
        },
      });

      return { payment, updatedOrder };
    });

    // 10. Audit Logging
    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'PAYMENT_RECORDED',
      entityType: 'PAYMENT',
      entityId: result.payment.id,
      metadata: {
        orderId: order.id,
        orderCode: order.orderCode,
        amount: paymentDecimal.toNumber(),
        paymentMethod: input.paymentMethod,
        paymentStatus: newPaymentStatus,
        isFullyPaid,
        reference: input.reference,
        shiftId: activeShift?.id,
      },
      ipAddress,
    });

    // 11. Real-time Synchronization
    RealtimeService.emitToRestaurant(restaurantId, 'payment:created', {
      payment: this.serializePayment(result.payment as unknown as Record<string, unknown>),
      orderId: order.id,
      paymentStatus: newPaymentStatus,
      isFullyPaid,
    });

    RealtimeService.emitToRestaurant(restaurantId, 'order:payment_updated', {
      orderId: order.id,
      orderCode: order.orderCode,
      paidAmount: newPaidAmount.toNumber(),
      paymentStatus: newPaymentStatus,
    });

    return this.serializePayment({
      ...result.payment,
      order: result.updatedOrder,
    } as unknown as Record<string, unknown>);
  }

  /**
   * 2. Refund a payment (partial or full) with mandatory reason and manager authorization.
   */
  public static async refundPayment(
    restaurantId: string,
    paymentId: string,
    input: CreateRefundInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ): Promise<Record<string, unknown>> {
    // 1. Locate Payment
    const payment = await prisma.payment.findFirst({
      where: {
        id: paymentId,
        restaurantId,
      },
      include: {
        order: true,
      },
    });

    if (!payment) {
      throw new NotFoundError(`Payment with ID ${paymentId} not found`);
    }

    // 2. Validate Payment Status (Cannot refund voided or already fully refunded payments)
    if (payment.status === 'VOIDED' || payment.status === 'REFUNDED') {
      throw new BadRequestError(`Cannot refund a payment that is ${payment.status}`);
    }

    // 3. Manager Authorization Check
    const hasDirectPermission = actor.permissions.includes('payments.refund');
    let managerPinVerified = false;

    if (!hasDirectPermission) {
      if (input.managerPin) {
        await ManagerAuthService.verifyManagerPin({
          restaurantId,
          pin: input.managerPin,
          requiredPermission: 'payments.refund',
        });
        managerPinVerified = true;
      } else {
        throw new ForbiddenError(
          'Processing refunds requires payments.refund permission or manager PIN authorization',
        );
      }
    }

    // 4. Validate Refund Amount against remaining refundable balance
    const refundDecimal = new Prisma.Decimal(input.amount);
    const maxRefundable = payment.amount.minus(payment.refundedAmount);

    if (refundDecimal.greaterThan(maxRefundable)) {
      throw new BadRequestError(
        `Refund amount (${refundDecimal.toFixed(2)}) exceeds remaining refundable balance (${maxRefundable.toFixed(2)})`,
      );
    }

    // 5. Locate Active Cashier Shift (if cash refund)
    const effectiveRefundMethod = input.refundMethod ?? payment.paymentMethod;
    const activeShift = await prisma.cashierShift.findFirst({
      where: {
        restaurantId,
        cashierId: actor.id,
        status: 'OPEN',
      },
    });

    // 6. Calculate New Payment & Order Payment Status
    const newPaymentRefunded = payment.refundedAmount.add(refundDecimal);
    const isPaymentFullyRefunded = newPaymentRefunded.greaterThanOrEqualTo(payment.amount);
    const newPaymentStatus = isPaymentFullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

    const order = payment.order;
    const newOrderPaidAmount = order.paidAmount.minus(refundDecimal);
    let newOrderPaymentStatus:
      'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED' | 'PARTIALLY_REFUNDED';

    if (newOrderPaidAmount.lessThanOrEqualTo(0)) {
      newOrderPaymentStatus = 'REFUNDED';
    } else if (newOrderPaidAmount.lessThan(order.grandTotal)) {
      newOrderPaymentStatus = 'PARTIALLY_REFUNDED';
    } else {
      newOrderPaymentStatus = 'PAID';
    }

    // 7. Transactional Mutations
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create PaymentRefund
      const refund = await tx.paymentRefund.create({
        data: {
          restaurantId,
          paymentId: payment.id,
          orderId: payment.orderId,
          shiftId: activeShift?.id ?? null,
          amount: refundDecimal,
          reason: input.reason.trim(),
          refundMethod: effectiveRefundMethod,
          reference: input.reference?.trim() ?? null,
          managerPinVerified,
          createdById: actor.id,
        },
      });

      // 2. If CASH refund and active shift, record CashTransaction and update shift cashRefunds
      if (effectiveRefundMethod === 'CASH' && activeShift) {
        await tx.cashTransaction.create({
          data: {
            restaurantId,
            shiftId: activeShift.id,
            type: 'CASH_REFUND',
            amount: refundDecimal,
            reason: `Refund for Order ${order.orderCode}: ${input.reason.trim()}`,
            refundId: refund.id,
            createdById: actor.id,
          },
        });

        await tx.cashierShift.update({
          where: { id: activeShift.id },
          data: {
            cashRefunds: {
              increment: refundDecimal,
            },
          },
        });
      }

      // 3. Update Payment
      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          refundedAmount: newPaymentRefunded,
          status: newPaymentStatus,
        },
      });

      // 4. Update Order
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          paidAmount: newOrderPaidAmount.lessThan(0) ? 0 : newOrderPaidAmount,
          paymentStatus: newOrderPaymentStatus,
        },
      });

      return { refund, updatedPayment, updatedOrder };
    });

    // 8. Audit Logging
    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'PAYMENT_REFUNDED',
      entityType: 'PAYMENT_REFUND',
      entityId: result.refund.id,
      metadata: {
        paymentId: payment.id,
        orderId: order.id,
        orderCode: order.orderCode,
        refundAmount: refundDecimal.toNumber(),
        reason: input.reason.trim(),
        refundMethod: effectiveRefundMethod,
        isPaymentFullyRefunded,
        newPaymentStatus,
        newOrderPaymentStatus,
        managerPinVerified,
      },
      ipAddress,
    });

    // 9. Real-time Synchronization
    RealtimeService.emitToRestaurant(restaurantId, 'payment:refunded', {
      refund: this.serializeRefund(result.refund as unknown as Record<string, unknown>),
      paymentId: payment.id,
      orderId: order.id,
      newPaymentStatus,
      newOrderPaymentStatus,
    });

    RealtimeService.emitToRestaurant(restaurantId, 'order:payment_updated', {
      orderId: order.id,
      orderCode: order.orderCode,
      paidAmount: newOrderPaidAmount.toNumber(),
      paymentStatus: newOrderPaymentStatus,
    });

    return {
      refund: this.serializeRefund(result.refund as unknown as Record<string, unknown>),
      payment: this.serializePayment(result.updatedPayment as unknown as Record<string, unknown>),
      order: {
        id: result.updatedOrder.id,
        orderCode: result.updatedOrder.orderCode,
        paidAmount: result.updatedOrder.paidAmount.toNumber(),
        paymentStatus: result.updatedOrder.paymentStatus,
      },
    };
  }

  /**
   * 3. Get payment details by ID.
   */
  public static async getPaymentById(
    restaurantId: string,
    id: string,
  ): Promise<Record<string, unknown>> {
    const payment = await prisma.payment.findFirst({
      where: {
        id,
        restaurantId,
      },
      include: {
        order: {
          select: {
            id: true,
            orderCode: true,
            orderType: true,
            status: true,
            paymentStatus: true,
            grandTotal: true,
            paidAmount: true,
            changeAmount: true,
            businessDate: true,
          },
        },
        refunds: {
          include: {
            createdByUser: {
              select: { id: true, name: true, username: true },
            },
          },
        },
        createdByUser: {
          select: { id: true, name: true, username: true },
        },
      },
    });

    if (!payment) {
      throw new NotFoundError(`Payment with ID ${id} not found`);
    }

    return this.serializePayment(payment as unknown as Record<string, unknown>);
  }

  /**
   * 4. List and filter payments with pagination.
   */
  public static async listPayments(
    restaurantId: string,
    query: ListPaymentsQuery,
  ): Promise<{
    payments: Record<string, unknown>[];
    pagination: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {
      restaurantId,
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.shiftId ? { shiftId: query.shiftId } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.startDate || query.endDate
        ? {
            createdAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    };

    const [total, payments] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          order: {
            select: {
              id: true,
              orderCode: true,
              orderType: true,
              grandTotal: true,
              paymentStatus: true,
            },
          },
          createdByUser: {
            select: { id: true, name: true, username: true },
          },
        },
      }),
    ]);

    return {
      payments: payments.map((p) => this.serializePayment(p as unknown as Record<string, unknown>)),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 5. Get all payments and refunds for a specific order.
   */
  public static async getOrderPayments(
    restaurantId: string,
    orderId: string,
  ): Promise<{
    orderId: string;
    payments: Record<string, unknown>[];
    refunds: Record<string, unknown>[];
    summary: {
      grandTotal: number;
      totalPaid: number;
      totalRefunded: number;
      netPaid: number;
      outstandingBalance: number;
      paymentStatus: string;
    };
  }> {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: {
        payments: {
          include: {
            createdByUser: { select: { id: true, name: true, username: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        refunds: {
          include: {
            createdByUser: { select: { id: true, name: true, username: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundError(`Order with ID ${orderId} not found`);
    }

    const totalPaid = order.payments
      .filter((p) => p.status !== 'VOIDED')
      .reduce((acc, p) => acc.add(p.amount), new Prisma.Decimal(0));

    const totalRefunded = order.refunds.reduce(
      (acc, r) => acc.add(r.amount),
      new Prisma.Decimal(0),
    );

    const netPaid = totalPaid.minus(totalRefunded);
    const outstandingBalance = order.grandTotal.minus(netPaid);

    return {
      orderId: order.id,
      payments: order.payments.map((p) =>
        this.serializePayment(p as unknown as Record<string, unknown>),
      ),
      refunds: order.refunds.map((r) =>
        this.serializeRefund(r as unknown as Record<string, unknown>),
      ),
      summary: {
        grandTotal: order.grandTotal.toNumber(),
        totalPaid: totalPaid.toNumber(),
        totalRefunded: totalRefunded.toNumber(),
        netPaid: netPaid.toNumber(),
        outstandingBalance: outstandingBalance.lessThan(0) ? 0 : outstandingBalance.toNumber(),
        paymentStatus: order.paymentStatus,
      },
    };
  }
}
