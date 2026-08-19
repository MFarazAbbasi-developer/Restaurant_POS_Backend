import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../common/errors/app-error.js';
import { AuditService } from '../../common/services/audit.service.js';
import { RealtimeService } from '../../common/services/realtime.service.js';
import type {
  CancelTakeawayOrderInput,
  CreateTakeawayOrderInput,
  ListTakeawayOrdersQueryInput,
  UpdateTakeawayStatusInput,
} from './takeaway.schema.js';
import type { AuthenticatedUserContext } from '../../common/types/express.js';

export class TakeawayService {
  /**
   * Helper to format business date (YYYY-MM-DD) based on restaurant context.
   */
  private static getBusinessDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Creates a new takeaway order using atomic daily token generation and exact price snapshots.
   */
  public static async createOrder(
    restaurantId: string,
    input: CreateTakeawayOrderInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    // 1. Privileged check for Pay on Pickup
    if (input.isPayOnPickup) {
      const hasPayOnPickupPerm =
        actor.permissions.includes('orders.pay_on_pickup') ||
        actor.roles.includes('OWNER') ||
        actor.roles.includes('MANAGER');

      if (!hasPayOnPickupPerm) {
        throw new ForbiddenError(
          "Forbidden: Insufficient permissions (requires 'orders.pay_on_pickup' for Pay on Pickup orders)",
        );
      }
    }

    // 2. Fetch restaurant configuration for tax calculation
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      throw new NotFoundError('Restaurant not found');
    }

    // 3. Validate items and prepare pricing snapshots
    const orderItemsData: {
      menuItemId: string;
      variantId: string | null;
      name: string;
      variantName: string | null;
      quantity: number;
      unitPrice: Prisma.Decimal;
      subtotal: Prisma.Decimal;
      specialInstructions: string | null;
      modifiers: Array<{ id: string; name: string; priceAdjustment: number }>;
    }[] = [];

    let calculatedSubtotal = new Prisma.Decimal(0);

    for (const itemInput of input.items) {
      const menuItem = await prisma.menuItem.findFirst({
        where: { id: itemInput.menuItemId, restaurantId, isActive: true },
      });

      if (!menuItem) {
        throw new BadRequestError(
          `Menu item with ID '${itemInput.menuItemId}' is invalid, inactive, or not found in this restaurant`,
        );
      }

      if (!menuItem.isAvailable) {
        throw new BadRequestError(
          `Menu item '${menuItem.name}' is currently unavailable (out of stock / 86ed)`,
        );
      }

      let variantName: string | null = null;
      let unitPrice = menuItem.basePrice;

      if (itemInput.variantId) {
        const variant = await prisma.menuItemVariant.findFirst({
          where: {
            id: itemInput.variantId,
            menuItemId: itemInput.menuItemId,
            isActive: true,
          },
        });

        if (!variant) {
          throw new BadRequestError(
            `Variant with ID '${itemInput.variantId}' is invalid or inactive for item '${menuItem.name}'`,
          );
        }

        variantName = variant.name;
        unitPrice = variant.price;
      }

      // Modifiers snapshot
      const modifiersSnapshot: Array<{ id: string; name: string; priceAdjustment: number }> = [];
      let modifierTotalAdj = new Prisma.Decimal(0);

      if (itemInput.modifierIds && itemInput.modifierIds.length > 0) {
        const modifiers = await prisma.modifier.findMany({
          where: {
            id: { in: itemInput.modifierIds },
            isActive: true,
            modifierGroup: {
              restaurantId,
            },
          },
        });

        if (modifiers.length !== itemInput.modifierIds.length) {
          throw new BadRequestError(
            `One or more selected modifiers are invalid or inactive for '${menuItem.name}'`,
          );
        }

        for (const mod of modifiers) {
          modifiersSnapshot.push({
            id: mod.id,
            name: mod.name,
            priceAdjustment: mod.priceAdjustment.toNumber(),
          });
          modifierTotalAdj = modifierTotalAdj.plus(mod.priceAdjustment);
        }
      }

      const itemEffectiveUnit = unitPrice.plus(modifierTotalAdj);
      const itemSubtotal = itemEffectiveUnit.times(itemInput.quantity);
      calculatedSubtotal = calculatedSubtotal.plus(itemSubtotal);

      orderItemsData.push({
        menuItemId: menuItem.id,
        variantId: itemInput.variantId ?? null,
        name: menuItem.name,
        variantName,
        quantity: itemInput.quantity,
        unitPrice,
        subtotal: itemSubtotal,
        specialInstructions: itemInput.specialInstructions ?? null,
        modifiers: modifiersSnapshot,
      });
    }

    // 4. Tax calculation
    const taxRate = restaurant.taxRate > 0 ? new Prisma.Decimal(restaurant.taxRate) : null;
    let taxAmount = new Prisma.Decimal(0);

    if (taxRate && taxRate.greaterThan(0)) {
      if (restaurant.taxInclusive) {
        const factor = new Prisma.Decimal(1).plus(taxRate.dividedBy(100));
        const netSubtotal = calculatedSubtotal.dividedBy(factor);
        taxAmount = calculatedSubtotal.minus(netSubtotal).toDecimalPlaces(2);
      } else {
        taxAmount = calculatedSubtotal.times(taxRate.dividedBy(100)).toDecimalPlaces(2);
      }
    }

    const totalAmount = restaurant.taxInclusive
      ? calculatedSubtotal
      : calculatedSubtotal.plus(taxAmount);

    const businessDate = this.getBusinessDate();

    // 5. Execute creation within atomic transaction with atomic sequential token generation
    const order = await prisma.$transaction(async (tx) => {
      // Atomic PostgreSQL sequence increment
      const sequence = await tx.$queryRaw<{ lastTokenNumber: number }[]>`
        INSERT INTO "takeaway_daily_sequences" ("id", "restaurantId", "businessDate", "lastTokenNumber", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, ${restaurantId}, ${businessDate}, 1, NOW(), NOW())
        ON CONFLICT ("restaurantId", "businessDate")
        DO UPDATE SET "lastTokenNumber" = "takeaway_daily_sequences"."lastTokenNumber" + 1, "updatedAt" = NOW()
        RETURNING "lastTokenNumber";
      `;

      const tokenNumber = sequence[0]?.lastTokenNumber ?? 1;
      const formattedToken = tokenNumber < 100 ? `00${tokenNumber}`.slice(-3) : `${tokenNumber}`;
      const dateCompact = businessDate.replace(/-/g, '');
      const orderCode = `TK-${dateCompact}-${formattedToken}`;

      const newOrder = await tx.takeawayOrder.create({
        data: {
          restaurantId,
          tokenNumber,
          orderCode,
          businessDate,
          customerName: input.customerName,
          customerPhone: input.customerPhone ?? null,
          status: 'PENDING',
          paymentStatus: input.isPayOnPickup ? 'PENDING' : 'PAID',
          paymentMethod: input.paymentMethod ?? 'CASH',
          subtotal: calculatedSubtotal,
          taxRate,
          taxAmount,
          discountAmount: new Prisma.Decimal(0),
          totalAmount,
          isPayOnPickup: input.isPayOnPickup ?? false,
          specialInstructions: input.specialInstructions ?? null,
          createdById: actor.id,
          items: {
            create: orderItemsData.map((it) => ({
              menuItemId: it.menuItemId,
              ...(it.variantId ? { variantId: it.variantId } : {}),
              name: it.name,
              ...(it.variantName ? { variantName: it.variantName } : {}),
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              subtotal: it.subtotal,
              ...(it.specialInstructions ? { specialInstructions: it.specialInstructions } : {}),
              ...(it.modifiers.length > 0
                ? { modifiers: it.modifiers as Prisma.InputJsonValue }
                : {}),
            })),
          },
        },
        include: {
          items: true,
          createdByUser: {
            select: { id: true, name: true, username: true },
          },
        },
      });

      return newOrder;
    });

    // 6. Audit Logging
    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'TAKEAWAY_ORDER_CREATED',
      entityType: 'TAKEAWAY_ORDER',
      entityId: order.id,
      metadata: {
        orderCode: order.orderCode,
        tokenNumber: order.tokenNumber,
        customerName: order.customerName,
        totalAmount: order.totalAmount.toNumber(),
        isPayOnPickup: order.isPayOnPickup,
        paymentStatus: order.paymentStatus,
      },
      ipAddress: ipAddress ?? null,
    });

    if (order.isPayOnPickup) {
      await AuditService.log({
        restaurantId,
        userId: actor.id,
        action: 'TAKEAWAY_PAY_ON_PICKUP_USED',
        entityType: 'TAKEAWAY_ORDER',
        entityId: order.id,
        metadata: {
          orderCode: order.orderCode,
          tokenNumber: order.tokenNumber,
          authorizedBy: actor.username,
        },
        ipAddress: ipAddress ?? null,
      });
    }

    // 7. Realtime Socket.IO emission
    RealtimeService.emitToRestaurant(restaurantId, 'takeaway:order_created', {
      orderId: order.id,
      orderCode: order.orderCode,
      tokenNumber: order.tokenNumber,
      customerName: order.customerName,
      status: order.status,
      totalAmount: order.totalAmount.toNumber(),
      isPayOnPickup: order.isPayOnPickup,
      itemCount: order.items.length,
    });

    return {
      ...order,
      subtotal: order.subtotal.toNumber(),
      taxRate: order.taxRate ? order.taxRate.toNumber() : null,
      taxAmount: order.taxAmount.toNumber(),
      discountAmount: order.discountAmount.toNumber(),
      totalAmount: order.totalAmount.toNumber(),
      items: order.items.map((it) => ({
        ...it,
        unitPrice: it.unitPrice.toNumber(),
        subtotal: it.subtotal.toNumber(),
      })),
    };
  }

  /**
   * Retrieves active takeaway queue (PENDING, PREPARING, READY), sorted for fast POS display.
   */
  public static async getActiveQueue(restaurantId: string) {
    const orders = await prisma.takeawayOrder.findMany({
      where: {
        restaurantId,
        status: { in: ['PENDING', 'PREPARING', 'READY'] },
      },
      include: {
        items: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const pendingCount = orders.filter((o) => o.status === 'PENDING').length;
    const preparingCount = orders.filter((o) => o.status === 'PREPARING').length;
    const readyCount = orders.filter((o) => o.status === 'READY').length;

    const formattedOrders = orders.map((o) => ({
      id: o.id,
      tokenNumber: o.tokenNumber,
      orderCode: o.orderCode,
      businessDate: o.businessDate,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      totalAmount: o.totalAmount.toNumber(),
      isPayOnPickup: o.isPayOnPickup,
      specialInstructions: o.specialInstructions,
      createdAt: o.createdAt,
      items: o.items.map((it) => ({
        id: it.id,
        name: it.name,
        variantName: it.variantName,
        quantity: it.quantity,
        unitPrice: it.unitPrice.toNumber(),
        subtotal: it.subtotal.toNumber(),
        specialInstructions: it.specialInstructions,
        modifiers: it.modifiers,
      })),
    }));

    return {
      restaurantId,
      summary: {
        totalActive: orders.length,
        pending: pendingCount,
        preparing: preparingCount,
        ready: readyCount,
      },
      queue: formattedOrders,
    };
  }

  /**
   * Lists takeaway orders with pagination and filtering.
   */
  public static async listOrders(restaurantId: string, query: ListTakeawayOrdersQueryInput) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const whereClause: Prisma.TakeawayOrderWhereInput = {
      restaurantId,
      ...(query.status && { status: query.status }),
      ...(query.businessDate && { businessDate: query.businessDate }),
      ...(query.search && {
        OR: [
          { customerName: { contains: query.search, mode: 'insensitive' } },
          { orderCode: { contains: query.search, mode: 'insensitive' } },
          { customerPhone: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, orders] = await Promise.all([
      prisma.takeawayOrder.count({ where: whereClause }),
      prisma.takeawayOrder.findMany({
        where: whereClause,
        include: {
          items: true,
          createdByUser: {
            select: { id: true, name: true, username: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const formattedOrders = orders.map((o) => ({
      ...o,
      subtotal: o.subtotal.toNumber(),
      taxRate: o.taxRate ? o.taxRate.toNumber() : null,
      taxAmount: o.taxAmount.toNumber(),
      discountAmount: o.discountAmount.toNumber(),
      totalAmount: o.totalAmount.toNumber(),
      items: o.items.map((it) => ({
        ...it,
        unitPrice: it.unitPrice.toNumber(),
        subtotal: it.subtotal.toNumber(),
      })),
    }));

    return {
      orders: formattedOrders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieves single takeaway order details.
   */
  public static async getOrderById(restaurantId: string, orderId: string) {
    const order = await prisma.takeawayOrder.findFirst({
      where: { id: orderId, restaurantId },
      include: {
        items: true,
        createdByUser: {
          select: { id: true, name: true, username: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundError('Takeaway order not found in this restaurant');
    }

    return {
      ...order,
      subtotal: order.subtotal.toNumber(),
      taxRate: order.taxRate ? order.taxRate.toNumber() : null,
      taxAmount: order.taxAmount.toNumber(),
      discountAmount: order.discountAmount.toNumber(),
      totalAmount: order.totalAmount.toNumber(),
      items: order.items.map((it) => ({
        ...it,
        unitPrice: it.unitPrice.toNumber(),
        subtotal: it.subtotal.toNumber(),
      })),
    };
  }

  /**
   * Updates status of a takeaway order (PREPARING, READY, COMPLETED, mark paid).
   */
  public static async updateOrderStatus(
    restaurantId: string,
    orderId: string,
    input: UpdateTakeawayStatusInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const existing = await prisma.takeawayOrder.findFirst({
      where: { id: orderId, restaurantId },
    });

    if (!existing) {
      throw new NotFoundError('Takeaway order not found in this restaurant');
    }

    if (existing.status === 'CANCELLED') {
      throw new BadRequestError('Cannot update status of a cancelled takeaway order');
    }

    if (existing.status === 'COMPLETED') {
      throw new BadRequestError('Cannot update status of an already completed takeaway order');
    }

    const updated = await prisma.takeawayOrder.update({
      where: { id: orderId },
      data: {
        status: input.status,
        ...(input.markPaid ? { paymentStatus: 'PAID' } : {}),
        ...(input.status === 'COMPLETED' ? { completedAt: new Date() } : {}),
      },
      include: {
        items: true,
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'TAKEAWAY_ORDER_STATUS_CHANGED',
      entityType: 'TAKEAWAY_ORDER',
      entityId: orderId,
      metadata: {
        orderCode: existing.orderCode,
        tokenNumber: existing.tokenNumber,
        previousStatus: existing.status,
        newStatus: input.status,
        paymentStatus: updated.paymentStatus,
      },
      ipAddress: ipAddress ?? null,
    });

    RealtimeService.emitToRestaurant(restaurantId, 'takeaway:status_changed', {
      orderId,
      orderCode: existing.orderCode,
      tokenNumber: existing.tokenNumber,
      previousStatus: existing.status,
      status: input.status,
      paymentStatus: updated.paymentStatus,
    });

    return {
      ...updated,
      subtotal: updated.subtotal.toNumber(),
      taxRate: updated.taxRate ? updated.taxRate.toNumber() : null,
      taxAmount: updated.taxAmount.toNumber(),
      discountAmount: updated.discountAmount.toNumber(),
      totalAmount: updated.totalAmount.toNumber(),
      items: updated.items.map((it) => ({
        ...it,
        unitPrice: it.unitPrice.toNumber(),
        subtotal: it.subtotal.toNumber(),
      })),
    };
  }

  /**
   * Cancels a takeaway order with a required cancellation reason.
   */
  public static async cancelOrder(
    restaurantId: string,
    orderId: string,
    input: CancelTakeawayOrderInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const existing = await prisma.takeawayOrder.findFirst({
      where: { id: orderId, restaurantId },
    });

    if (!existing) {
      throw new NotFoundError('Takeaway order not found in this restaurant');
    }

    if (existing.status === 'CANCELLED') {
      throw new BadRequestError('Takeaway order is already cancelled');
    }

    if (existing.status === 'COMPLETED') {
      throw new BadRequestError('Cannot cancel an already completed takeaway order');
    }

    const cancelled = await prisma.takeawayOrder.update({
      where: { id: orderId },
      data: {
        status: 'CANCELLED',
        cancelReason: input.reason,
        cancelledAt: new Date(),
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'TAKEAWAY_ORDER_CANCELLED',
      entityType: 'TAKEAWAY_ORDER',
      entityId: orderId,
      metadata: {
        orderCode: existing.orderCode,
        tokenNumber: existing.tokenNumber,
        reason: input.reason,
        cancelledBy: actor.username,
      },
      ipAddress: ipAddress ?? null,
    });

    RealtimeService.emitToRestaurant(restaurantId, 'takeaway:order_cancelled', {
      orderId,
      orderCode: existing.orderCode,
      tokenNumber: existing.tokenNumber,
      cancelReason: input.reason,
    });

    return {
      id: cancelled.id,
      orderCode: cancelled.orderCode,
      status: cancelled.status,
      cancelReason: cancelled.cancelReason,
      cancelledAt: cancelled.cancelledAt,
    };
  }
}
