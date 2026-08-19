import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { BadRequestError, NotFoundError } from '../../../common/errors/app-error.js';
import { AuditService } from '../../../common/services/audit.service.js';
import { RealtimeService } from '../../../common/services/realtime.service.js';
import type { CreateRiderSettlementInput } from '../delivery.schema.js';
import type { AuthenticatedUserContext } from '../../../common/types/express.js';

export class RiderService {
  private static getBusinessDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Lists eligible delivery riders for the restaurant.
   */
  public static async listEligibleRiders(restaurantId: string) {
    const riders = await prisma.user.findMany({
      where: {
        restaurantId,
        isActive: true,
        userRoles: {
          some: {
            role: {
              name: { in: ['DELIVERY', 'MANAGER', 'CASHIER', 'OWNER'] },
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        username: true,
        phone: true,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });

    return riders;
  }

  /**
   * Assigns or reassigns a delivery order to a rider.
   */
  public static async assignRider(
    restaurantId: string,
    orderId: string,
    riderId: string,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const rider = await prisma.user.findFirst({
      where: { id: riderId, restaurantId, isActive: true },
    });

    if (!rider) {
      throw new BadRequestError('Invalid or inactive rider specified');
    }

    const order = await prisma.deliveryOrder.findFirst({
      where: { id: orderId, restaurantId },
      include: { rider: true },
    });

    if (!order) {
      throw new NotFoundError('Delivery order not found in this restaurant');
    }

    if (order.status === 'CANCELLED' || order.status === 'DELIVERED') {
      throw new BadRequestError(`Cannot assign rider to an order that is already ${order.status}`);
    }

    const isReassignment = !!order.riderId && order.riderId !== riderId;
    const previousRiderName = order.rider?.name;

    const updated = await prisma.deliveryOrder.update({
      where: { id: orderId },
      data: {
        riderId,
        assignedAt: new Date(),
      },
      include: {
        rider: {
          select: { id: true, name: true, username: true, phone: true },
        },
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: isReassignment ? 'DELIVERY_RIDER_REASSIGNED' : 'DELIVERY_RIDER_ASSIGNED',
      entityType: 'DELIVERY_ORDER',
      entityId: orderId,
      metadata: {
        orderCode: order.orderCode,
        riderId,
        riderName: rider.name,
        ...(isReassignment ? { previousRider: previousRiderName } : {}),
      },
      ipAddress: ipAddress ?? null,
    });

    RealtimeService.emitToRestaurant(restaurantId, 'delivery:rider_assigned', {
      orderId,
      orderCode: order.orderCode,
      riderId,
      riderName: rider.name,
      isReassignment,
    });

    return updated;
  }

  /**
   * Retrieves active assigned deliveries for a specific rider.
   */
  public static async getRiderActiveDeliveries(restaurantId: string, riderId: string) {
    const deliveries = await prisma.deliveryOrder.findMany({
      where: {
        restaurantId,
        riderId,
        status: { in: ['READY', 'DISPATCHED'] },
      },
      include: {
        items: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return deliveries.map((d) => ({
      ...d,
      subtotal: d.subtotal.toNumber(),
      deliveryCharge: d.deliveryCharge.toNumber(),
      packagingCharge: d.packagingCharge.toNumber(),
      taxAmount: d.taxAmount.toNumber(),
      totalAmount: d.totalAmount.toNumber(),
      items: d.items.map((it) => ({
        ...it,
        unitPrice: it.unitPrice.toNumber(),
        subtotal: it.subtotal.toNumber(),
      })),
    }));
  }

  /**
   * Retrieves outstanding cash summary for delivered but un-settled orders for a rider.
   */
  public static async getRiderOutstandingSummary(restaurantId: string, riderId: string) {
    const rider = await prisma.user.findFirst({
      where: { id: riderId, restaurantId },
    });

    if (!rider) {
      throw new NotFoundError('Rider not found in this restaurant');
    }

    const unSettledOrders = await prisma.deliveryOrder.findMany({
      where: {
        restaurantId,
        riderId,
        status: 'DELIVERED',
        isSettled: false,
      },
      orderBy: { deliveredAt: 'desc' },
    });

    let expectedCash = new Prisma.Decimal(0);
    let digitalPrepaid = new Prisma.Decimal(0);

    const ordersSummary = unSettledOrders.map((o) => {
      const total = o.totalAmount;
      if (o.paymentMethod.toUpperCase() === 'CASH') {
        expectedCash = expectedCash.plus(total);
      } else {
        digitalPrepaid = digitalPrepaid.plus(total);
      }

      return {
        id: o.id,
        orderCode: o.orderCode,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        deliveryAddress: o.deliveryAddress,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        totalAmount: total.toNumber(),
        deliveredAt: o.deliveredAt,
      };
    });

    return {
      rider: {
        id: rider.id,
        name: rider.name,
        username: rider.username,
        phone: rider.phone,
      },
      expectedCash: expectedCash.toNumber(),
      digitalPrepaid: digitalPrepaid.toNumber(),
      totalOutstandingOrders: unSettledOrders.length,
      orders: ordersSummary,
    };
  }

  /**
   * Records rider remittance and settles delivered delivery orders in an atomic transaction.
   */
  public static async recordRiderSettlement(
    restaurantId: string,
    input: CreateRiderSettlementInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const rider = await prisma.user.findFirst({
      where: { id: input.riderId, restaurantId },
    });

    if (!rider) {
      throw new NotFoundError('Rider not found in this restaurant');
    }

    const businessDate = this.getBusinessDate();

    // Atomic transaction ensures duplicate/concurrent settlements cannot occur
    const settlement = await prisma.$transaction(async (tx) => {
      const orders = await tx.deliveryOrder.findMany({
        where: {
          id: { in: input.orderIds },
          restaurantId,
          riderId: input.riderId,
          status: 'DELIVERED',
          isSettled: false,
        },
      });

      if (orders.length !== input.orderIds.length) {
        throw new BadRequestError(
          'One or more selected orders are invalid, already settled, not in DELIVERED status, or not assigned to this rider',
        );
      }

      let expectedCash = new Prisma.Decimal(0);
      for (const ord of orders) {
        if (ord.paymentMethod.toUpperCase() === 'CASH') {
          expectedCash = expectedCash.plus(ord.totalAmount);
        }
      }

      const collectedAmount = new Prisma.Decimal(input.collectedAmount);
      const remittedAmount = new Prisma.Decimal(input.remittedAmount);
      const varianceAmount = remittedAmount.minus(collectedAmount);

      // Mark orders as settled
      await tx.deliveryOrder.updateMany({
        where: {
          id: { in: input.orderIds },
        },
        data: {
          isSettled: true,
          settledAt: new Date(),
          paymentStatus: 'PAID',
        },
      });

      const newSettlement = await tx.riderSettlement.create({
        data: {
          restaurantId,
          riderId: input.riderId,
          receivedById: actor.id,
          businessDate,
          expectedAmount: expectedCash,
          collectedAmount,
          remittedAmount,
          varianceAmount,
          ordersCount: orders.length,
          orderIds: input.orderIds,
          notes: input.notes ?? null,
        },
        include: {
          rider: {
            select: { id: true, name: true, username: true },
          },
          receivedByUser: {
            select: { id: true, name: true, username: true },
          },
        },
      });

      return newSettlement;
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'DELIVERY_RIDER_SETTLEMENT_CLOSED',
      entityType: 'RIDER_SETTLEMENT',
      entityId: settlement.id,
      metadata: {
        riderId: input.riderId,
        riderName: rider.name,
        ordersSettled: input.orderIds.length,
        remittedAmount: settlement.remittedAmount.toNumber(),
        variance: settlement.varianceAmount.toNumber(),
      },
      ipAddress: ipAddress ?? null,
    });

    RealtimeService.emitToRestaurant(restaurantId, 'delivery:rider_settled', {
      settlementId: settlement.id,
      riderId: input.riderId,
      riderName: rider.name,
      ordersCount: input.orderIds.length,
      remittedAmount: settlement.remittedAmount.toNumber(),
    });

    return {
      ...settlement,
      expectedAmount: settlement.expectedAmount.toNumber(),
      collectedAmount: settlement.collectedAmount.toNumber(),
      remittedAmount: settlement.remittedAmount.toNumber(),
      varianceAmount: settlement.varianceAmount.toNumber(),
    };
  }

  /**
   * Retrieves past settlements history for the restaurant.
   */
  public static async listSettlements(restaurantId: string, riderId?: string) {
    const settlements = await prisma.riderSettlement.findMany({
      where: {
        restaurantId,
        ...(riderId ? { riderId } : {}),
      },
      include: {
        rider: { select: { id: true, name: true, username: true } },
        receivedByUser: { select: { id: true, name: true, username: true } },
      },
      orderBy: { settledAt: 'desc' },
      take: 50,
    });

    return settlements.map((s) => ({
      ...s,
      expectedAmount: s.expectedAmount.toNumber(),
      collectedAmount: s.collectedAmount.toNumber(),
      remittedAmount: s.remittedAmount.toNumber(),
      varianceAmount: s.varianceAmount.toNumber(),
    }));
  }
}
