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
import {
  OpenShiftInput,
  CloseShiftInput,
  CashDropInput,
  CashAdjustmentInput,
  ListShiftsQuery,
} from './shift.schema.js';
import { AuthenticatedUserContext } from '../../common/types/index.js';

export class ShiftService {
  /**
   * Helper to format Date into YYYY-MM-DD business date string.
   */
  private static getBusinessDateString(date = new Date()): string {
    return date.toISOString().split('T')[0] ?? '';
  }

  /**
   * Helper to serialize Decimal fields to numbers for API responses.
   */
  public static serializeShift(shift: Record<string, unknown>): Record<string, unknown> {
    const rawTx = Array.isArray(shift.cashTransactions)
      ? (shift.cashTransactions as Record<string, unknown>[])
      : [];

    return {
      ...shift,
      openingCash:
        shift.openingCash instanceof Prisma.Decimal
          ? shift.openingCash.toNumber()
          : Number(shift.openingCash || 0),
      cashSales:
        shift.cashSales instanceof Prisma.Decimal
          ? shift.cashSales.toNumber()
          : Number(shift.cashSales || 0),
      cashRefunds:
        shift.cashRefunds instanceof Prisma.Decimal
          ? shift.cashRefunds.toNumber()
          : Number(shift.cashRefunds || 0),
      cashDrops:
        shift.cashDrops instanceof Prisma.Decimal
          ? shift.cashDrops.toNumber()
          : Number(shift.cashDrops || 0),
      cashAdjustments:
        shift.cashAdjustments instanceof Prisma.Decimal
          ? shift.cashAdjustments.toNumber()
          : Number(shift.cashAdjustments || 0),
      cashExpenses:
        shift.cashExpenses instanceof Prisma.Decimal
          ? shift.cashExpenses.toNumber()
          : Number(shift.cashExpenses || 0),
      expectedClosingCash:
        shift.expectedClosingCash instanceof Prisma.Decimal
          ? shift.expectedClosingCash.toNumber()
          : shift.expectedClosingCash !== null && shift.expectedClosingCash !== undefined
            ? Number(shift.expectedClosingCash)
            : null,
      actualClosingCash:
        shift.actualClosingCash instanceof Prisma.Decimal
          ? shift.actualClosingCash.toNumber()
          : shift.actualClosingCash !== null && shift.actualClosingCash !== undefined
            ? Number(shift.actualClosingCash)
            : null,
      variance:
        shift.variance instanceof Prisma.Decimal
          ? shift.variance.toNumber()
          : shift.variance !== null && shift.variance !== undefined
            ? Number(shift.variance)
            : null,
      currentDrawerCash:
        shift.currentDrawerCash instanceof Prisma.Decimal
          ? shift.currentDrawerCash.toNumber()
          : shift.currentDrawerCash !== null && shift.currentDrawerCash !== undefined
            ? Number(shift.currentDrawerCash)
            : undefined,
      cashTransactions: shift.cashTransactions
        ? rawTx.map((tx) => ({
            ...tx,
            amount:
              tx.amount instanceof Prisma.Decimal ? tx.amount.toNumber() : Number(tx.amount || 0),
          }))
        : undefined,
    };
  }

  /**
   * 1. Open a new register shift for a cashier.
   */
  public static async openShift(
    restaurantId: string,
    input: OpenShiftInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ): Promise<Record<string, unknown>> {
    // Check if cashier already has an active open shift
    const existingOpenShift = await prisma.cashierShift.findFirst({
      where: {
        restaurantId,
        cashierId: actor.id,
        status: 'OPEN',
      },
    });

    if (existingOpenShift) {
      throw new ConflictError('Cashier already has an active open shift in this restaurant');
    }

    const businessDate = this.getBusinessDateString();
    const openingCashDecimal = new Prisma.Decimal(input.openingCash ?? 0);

    const shift = await prisma.$transaction(async (tx) => {
      const newShift = await tx.cashierShift.create({
        data: {
          restaurantId,
          cashierId: actor.id,
          registerName: input.registerName ?? 'Main Register',
          businessDate,
          status: 'OPEN',
          openingCash: openingCashDecimal,
          notes: input.notes?.trim() ?? null,
        },
      });

      if (openingCashDecimal.greaterThan(0)) {
        await tx.cashTransaction.create({
          data: {
            restaurantId,
            shiftId: newShift.id,
            type: 'OPENING_FLOAT',
            amount: openingCashDecimal,
            reason: 'Opening Register Float',
            createdById: actor.id,
          },
        });
      }

      return newShift;
    });

    // Audit Logging
    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'SHIFT_OPENED',
      entityType: 'CASHIER_SHIFT',
      entityId: shift.id,
      metadata: {
        registerName: shift.registerName,
        openingCash: openingCashDecimal.toNumber(),
        businessDate,
      },
      ipAddress,
    });

    // Real-time broadcast
    RealtimeService.emitToRestaurant(restaurantId, 'shift:opened', {
      shift: this.serializeShift(shift as unknown as Record<string, unknown>),
    });

    return this.serializeShift({
      ...shift,
      currentDrawerCash: openingCashDecimal,
    } as unknown as Record<string, unknown>);
  }

  /**
   * 2. Get active open shift for the logged-in cashier.
   */
  public static async getCurrentShift(
    restaurantId: string,
    cashierId: string,
  ): Promise<Record<string, unknown>> {
    const shift = await prisma.cashierShift.findFirst({
      where: {
        restaurantId,
        cashierId,
        status: 'OPEN',
      },
      include: {
        cashier: {
          select: { id: true, name: true, username: true },
        },
        cashTransactions: {
          orderBy: { createdAt: 'desc' },
          include: {
            createdByUser: { select: { id: true, name: true, username: true } },
          },
        },
      },
    });

    if (!shift) {
      throw new NotFoundError('No active open shift found for this cashier');
    }

    const currentDrawerCash = shift.openingCash
      .add(shift.cashSales)
      .minus(shift.cashRefunds)
      .minus(shift.cashDrops)
      .add(shift.cashAdjustments)
      .minus(shift.cashExpenses);

    return this.serializeShift({
      ...shift,
      currentDrawerCash,
    } as unknown as Record<string, unknown>);
  }

  /**
   * 3. Perform a Cash Drop / Safe Transfer.
   */
  public static async recordCashDrop(
    restaurantId: string,
    input: CashDropInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ): Promise<Record<string, unknown>> {
    const shift = await prisma.cashierShift.findFirst({
      where: {
        restaurantId,
        cashierId: actor.id,
        status: 'OPEN',
      },
    });

    if (!shift) {
      throw new NotFoundError('No active open shift found to perform cash drop');
    }

    // Authorization
    const hasPermission = actor.permissions.includes('shifts.cash_drop');
    let managerPinVerified = false;

    if (!hasPermission) {
      if (input.managerPin) {
        await ManagerAuthService.verifyManagerPin({
          restaurantId,
          pin: input.managerPin,
          requiredPermission: 'shifts.cash_drop',
        });
        managerPinVerified = true;
      } else {
        throw new ForbiddenError(
          'Cash drops require shifts.cash_drop permission or manager PIN authorization',
        );
      }
    }

    const dropAmountDecimal = new Prisma.Decimal(input.amount);
    const currentDrawerCash = shift.openingCash
      .add(shift.cashSales)
      .minus(shift.cashRefunds)
      .minus(shift.cashDrops)
      .add(shift.cashAdjustments);

    if (dropAmountDecimal.greaterThan(currentDrawerCash)) {
      throw new BadRequestError(
        `Cash drop amount (${dropAmountDecimal.toFixed(2)}) exceeds available drawer balance (${currentDrawerCash.toFixed(2)})`,
      );
    }

    const updatedShift = await prisma.$transaction(async (tx) => {
      await tx.cashTransaction.create({
        data: {
          restaurantId,
          shiftId: shift.id,
          type: 'CASH_DROP',
          amount: dropAmountDecimal,
          reason: input.reason.trim(),
          createdById: actor.id,
        },
      });

      return tx.cashierShift.update({
        where: { id: shift.id },
        data: {
          cashDrops: {
            increment: dropAmountDecimal,
          },
        },
      });
    });

    // Audit Logging
    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'SHIFT_CASH_DROP',
      entityType: 'CASHIER_SHIFT',
      entityId: shift.id,
      metadata: {
        amount: dropAmountDecimal.toNumber(),
        reason: input.reason.trim(),
        managerPinVerified,
      },
      ipAddress,
    });

    // Real-time broadcast
    RealtimeService.emitToRestaurant(restaurantId, 'shift:cash_drop', {
      shiftId: shift.id,
      amount: dropAmountDecimal.toNumber(),
      reason: input.reason.trim(),
    });

    const newDrawerCash = currentDrawerCash.minus(dropAmountDecimal);

    return this.serializeShift({
      ...updatedShift,
      currentDrawerCash: newDrawerCash,
    } as unknown as Record<string, unknown>);
  }

  /**
   * 4. Record a Cash Adjustment (Pay In / Pay Out / Petty Cash).
   */
  public static async recordCashAdjustment(
    restaurantId: string,
    input: CashAdjustmentInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ): Promise<Record<string, unknown>> {
    const shift = await prisma.cashierShift.findFirst({
      where: {
        restaurantId,
        cashierId: actor.id,
        status: 'OPEN',
      },
    });

    if (!shift) {
      throw new NotFoundError('No active open shift found to perform cash adjustment');
    }

    // Authorization
    const hasPermission = actor.permissions.includes('shifts.cash_drop');
    let managerPinVerified = false;

    if (!hasPermission) {
      if (input.managerPin) {
        await ManagerAuthService.verifyManagerPin({
          restaurantId,
          pin: input.managerPin,
          requiredPermission: 'shifts.cash_drop',
        });
        managerPinVerified = true;
      } else {
        throw new ForbiddenError(
          'Cash adjustments require shifts.cash_drop permission or manager PIN authorization',
        );
      }
    }

    const adjustmentAmount = new Prisma.Decimal(input.amount);
    const currentDrawerCash = shift.openingCash
      .add(shift.cashSales)
      .minus(shift.cashRefunds)
      .minus(shift.cashDrops)
      .add(shift.cashAdjustments)
      .minus(shift.cashExpenses);

    if (input.type === 'PAY_OUT' && adjustmentAmount.greaterThan(currentDrawerCash)) {
      throw new BadRequestError(
        `Pay-out amount (${adjustmentAmount.toFixed(2)}) exceeds available drawer balance (${currentDrawerCash.toFixed(2)})`,
      );
    }

    const updatedShift = await prisma.$transaction(async (tx) => {
      await tx.cashTransaction.create({
        data: {
          restaurantId,
          shiftId: shift.id,
          type: input.type,
          amount: adjustmentAmount,
          reason: input.reason.trim(),
          createdById: actor.id,
        },
      });

      return tx.cashierShift.update({
        where: { id: shift.id },
        data: {
          cashAdjustments: {
            [input.type === 'PAY_IN' ? 'increment' : 'decrement']: adjustmentAmount,
          },
        },
      });
    });

    // Audit Logging
    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'SHIFT_CASH_ADJUSTMENT',
      entityType: 'CASHIER_SHIFT',
      entityId: shift.id,
      metadata: {
        type: input.type,
        amount: adjustmentAmount.toNumber(),
        reason: input.reason.trim(),
        managerPinVerified,
      },
      ipAddress,
    });

    // Real-time broadcast
    RealtimeService.emitToRestaurant(restaurantId, 'shift:cash_adjustment', {
      shiftId: shift.id,
      type: input.type,
      amount: adjustmentAmount.toNumber(),
      reason: input.reason.trim(),
    });

    const newDrawerCash =
      input.type === 'PAY_IN'
        ? currentDrawerCash.add(adjustmentAmount)
        : currentDrawerCash.minus(adjustmentAmount);

    return this.serializeShift({
      ...updatedShift,
      currentDrawerCash: newDrawerCash,
    } as unknown as Record<string, unknown>);
  }

  /**
   * 5. Close active shift with counted cash, expected cash calculation, and variance.
   */
  public static async closeShift(
    restaurantId: string,
    input: CloseShiftInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ): Promise<Record<string, unknown>> {
    const shift = await prisma.cashierShift.findFirst({
      where: {
        restaurantId,
        cashierId: actor.id,
        status: 'OPEN',
      },
      include: {
        payments: true,
        refunds: true,
      },
    });

    if (!shift) {
      throw new NotFoundError('No active open shift found to close');
    }

    // Ledger Calculation: Expected cash calculated strictly from database transactions
    const expectedClosingCash = shift.openingCash
      .add(shift.cashSales)
      .minus(shift.cashRefunds)
      .minus(shift.cashDrops)
      .add(shift.cashAdjustments)
      .minus(shift.cashExpenses);

    const actualClosingCash = new Prisma.Decimal(input.actualClosingCash);
    const variance = actualClosingCash.minus(expectedClosingCash);

    const closedShift = await prisma.cashierShift.update({
      where: { id: shift.id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        expectedClosingCash,
        actualClosingCash,
        variance,
        closingNotes: input.closingNotes?.trim() ?? null,
        closedById: actor.id,
      },
      include: {
        cashier: { select: { id: true, name: true, username: true } },
        closedByUser: { select: { id: true, name: true, username: true } },
      },
    });

    // Generate Settlement Summary Breakdown
    const summary = await this.getShiftSummary(restaurantId, shift.id);

    // Audit Logging
    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'SHIFT_CLOSED',
      entityType: 'CASHIER_SHIFT',
      entityId: shift.id,
      metadata: {
        expectedClosingCash: expectedClosingCash.toNumber(),
        actualClosingCash: actualClosingCash.toNumber(),
        variance: variance.toNumber(),
        closingNotes: input.closingNotes,
      },
      ipAddress,
    });

    // Real-time broadcast
    RealtimeService.emitToRestaurant(restaurantId, 'shift:closed', {
      shiftId: shift.id,
      variance: variance.toNumber(),
    });

    return {
      shift: this.serializeShift(closedShift as unknown as Record<string, unknown>),
      summary,
    };
  }

  /**
   * 6. Generate comprehensive settlement summary report for a shift.
   */
  public static async getShiftSummary(
    restaurantId: string,
    shiftId: string,
  ): Promise<{
    shiftId: string;
    businessDate: string;
    registerName: string;
    status: string;
    openedAt: string;
    closedAt: string | null;
    cashier: { id: string; name: string; username: string };
    cashDrawer: {
      openingCash: number;
      cashSales: number;
      cashRefunds: number;
      cashDrops: number;
      cashAdjustments: number;
      cashExpenses: number;
      expectedClosingCash: number;
      actualClosingCash: number | null;
      variance: number | null;
    };
    paymentsByMethod: Record<string, { count: number; totalAmount: number }>;
    refundsByMethod: Record<string, { count: number; totalAmount: number }>;
    totals: {
      totalSales: number;
      totalRefunds: number;
      netSales: number;
      transactionsCount: number;
    };
  }> {
    const shift = await prisma.cashierShift.findFirst({
      where: { id: shiftId, restaurantId },
      include: {
        cashier: { select: { id: true, name: true, username: true } },
        payments: { where: { status: { not: 'VOIDED' } } },
        refunds: true,
      },
    });

    if (!shift) {
      throw new NotFoundError(`Shift with ID ${shiftId} not found`);
    }

    const expectedCash = shift.openingCash
      .add(shift.cashSales)
      .minus(shift.cashRefunds)
      .minus(shift.cashDrops)
      .add(shift.cashAdjustments)
      .minus(shift.cashExpenses);

    const paymentsByMethod: Record<string, { count: number; totalAmount: number }> = {};
    let totalSales = new Prisma.Decimal(0);

    for (const p of shift.payments) {
      const current = paymentsByMethod[p.paymentMethod] ?? { count: 0, totalAmount: 0 };
      current.count += 1;
      current.totalAmount = new Prisma.Decimal(current.totalAmount).add(p.amount).toNumber();
      paymentsByMethod[p.paymentMethod] = current;
      totalSales = totalSales.add(p.amount);
    }

    const refundsByMethod: Record<string, { count: number; totalAmount: number }> = {};
    let totalRefunds = new Prisma.Decimal(0);

    for (const r of shift.refunds) {
      const current = refundsByMethod[r.refundMethod] ?? { count: 0, totalAmount: 0 };
      current.count += 1;
      current.totalAmount = new Prisma.Decimal(current.totalAmount).add(r.amount).toNumber();
      refundsByMethod[r.refundMethod] = current;
      totalRefunds = totalRefunds.add(r.amount);
    }

    const netSales = totalSales.minus(totalRefunds);

    return {
      shiftId: shift.id,
      businessDate: shift.businessDate,
      registerName: shift.registerName,
      status: shift.status,
      openedAt: shift.openedAt.toISOString(),
      closedAt: shift.closedAt?.toISOString() ?? null,
      cashier: shift.cashier,
      cashDrawer: {
        openingCash: shift.openingCash.toNumber(),
        cashSales: shift.cashSales.toNumber(),
        cashRefunds: shift.cashRefunds.toNumber(),
        cashDrops: shift.cashDrops.toNumber(),
        cashAdjustments: shift.cashAdjustments.toNumber(),
        cashExpenses: shift.cashExpenses.toNumber(),
        expectedClosingCash: expectedCash.toNumber(),
        actualClosingCash: shift.actualClosingCash ? shift.actualClosingCash.toNumber() : null,
        variance: shift.variance ? shift.variance.toNumber() : null,
      },
      paymentsByMethod,
      refundsByMethod,
      totals: {
        totalSales: totalSales.toNumber(),
        totalRefunds: totalRefunds.toNumber(),
        netSales: netSales.toNumber(),
        transactionsCount: shift.payments.length + shift.refunds.length,
      },
    };
  }

  /**
   * 7. Get shift details by ID.
   */
  public static async getShiftById(
    restaurantId: string,
    id: string,
  ): Promise<Record<string, unknown>> {
    const shift = await prisma.cashierShift.findFirst({
      where: { id, restaurantId },
      include: {
        cashier: { select: { id: true, name: true, username: true } },
        closedByUser: { select: { id: true, name: true, username: true } },
        cashTransactions: {
          orderBy: { createdAt: 'asc' },
          include: {
            createdByUser: { select: { id: true, name: true, username: true } },
          },
        },
      },
    });

    if (!shift) {
      throw new NotFoundError(`Shift with ID ${id} not found`);
    }

    return this.serializeShift(shift as unknown as Record<string, unknown>);
  }

  /**
   * 8. List shifts with pagination and filters.
   */
  public static async listShifts(
    restaurantId: string,
    query: ListShiftsQuery,
  ): Promise<{
    shifts: Record<string, unknown>[];
    pagination: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.CashierShiftWhereInput = {
      restaurantId,
      ...(query.cashierId ? { cashierId: query.cashierId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.businessDate ? { businessDate: query.businessDate } : {}),
      ...(query.startDate || query.endDate
        ? {
            openedAt: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    };

    const [total, shifts] = await Promise.all([
      prisma.cashierShift.count({ where }),
      prisma.cashierShift.findMany({
        where,
        skip,
        take: limit,
        orderBy: { openedAt: 'desc' },
        include: {
          cashier: { select: { id: true, name: true, username: true } },
          closedByUser: { select: { id: true, name: true, username: true } },
        },
      }),
    ]);

    return {
      shifts: shifts.map((s) => this.serializeShift(s as unknown as Record<string, unknown>)),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
