import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { BadRequestError, NotFoundError } from '../../../common/errors/app-error.js';
import { AuditService } from '../../../common/services/audit.service.js';
import { RealtimeService } from '../../../common/services/realtime.service.js';
import type {
  CancelDeliveryOrderInput,
  CreateDeliveryOrderInput,
  ListDeliveryOrdersQueryInput,
  UpdateDeliveryStatusInput,
} from '../delivery.schema.js';
import type { AuthenticatedUserContext } from '../../../common/types/express.js';

export class DeliveryService {
  private static getBusinessDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Creates a new phone-in / WhatsApp / aggregator delivery order with exact price snapshots.
   */
  public static async createOrder(
    restaurantId: string,
    input: CreateDeliveryOrderInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      throw new NotFoundError('Restaurant not found');
    }

    // 1. Customer Upsert / Linking
    let customerId: string | null = null;
    const existingCustomer = await prisma.customer.findUnique({
      where: {
        restaurantId_phone: {
          restaurantId,
          phone: input.customerPhone.trim(),
        },
      },
    });

    if (existingCustomer) {
      customerId = existingCustomer.id;
      // Update name if different
      if (existingCustomer.name !== input.customerName.trim()) {
        await prisma.customer.update({
          where: { id: existingCustomer.id },
          data: { name: input.customerName.trim() },
        });
      }
    } else {
      const newCustomer = await prisma.customer.create({
        data: {
          restaurantId,
          name: input.customerName.trim(),
          phone: input.customerPhone.trim(),
        },
      });
      customerId = newCustomer.id;
    }

    // Save address if not already present
    const existingAddr = await prisma.customerAddress.findFirst({
      where: {
        customerId,
        address: input.deliveryAddress.trim(),
      },
    });

    if (!existingAddr) {
      await prisma.customerAddress.create({
        data: {
          customerId,
          address: input.deliveryAddress.trim(),
          landmark: input.landmark ?? null,
          deliveryZoneId: input.deliveryZoneId ?? null,
          isDefault: true,
        },
      });
    }

    // 2. Resolve Delivery Zone and Delivery Charges
    let deliveryZoneName: string | null = null;
    let deliveryCharge = new Prisma.Decimal(input.flatDeliveryFee ?? 0);

    if (input.deliveryZoneId) {
      const zone = await prisma.deliveryZone.findFirst({
        where: { id: input.deliveryZoneId, restaurantId, isActive: true },
      });

      if (!zone) {
        throw new BadRequestError('Invalid or inactive delivery zone specified');
      }

      deliveryZoneName = zone.name;
      deliveryCharge = zone.deliveryCharge;
    }

    const packagingCharge = new Prisma.Decimal(input.packagingCharge ?? 0);

    // 3. Validate Menu Items & Modifier Snapshots
    const orderItemsData: {
      menuItemId: string;
      variantId?: string;
      name: string;
      variantName?: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
      subtotal: Prisma.Decimal;
      specialInstructions?: string;
      modifiers: Array<{ id: string; name: string; priceAdjustment: number }>;
    }[] = [];

    let calculatedSubtotal = new Prisma.Decimal(0);

    for (const itemInput of input.items) {
      const menuItem = await prisma.menuItem.findFirst({
        where: { id: itemInput.menuItemId, restaurantId, isActive: true },
      });

      if (!menuItem) {
        throw new BadRequestError(
          `Menu item with ID '${itemInput.menuItemId}' is invalid or inactive in this restaurant`,
        );
      }

      if (!menuItem.isAvailable) {
        throw new BadRequestError(`Menu item '${menuItem.name}' is currently unavailable (86ed)`);
      }

      let variantName: string | undefined;
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
            `Variant with ID '${itemInput.variantId}' is invalid or inactive for '${menuItem.name}'`,
          );
        }

        variantName = variant.name;
        unitPrice = variant.price;
      }

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
        ...(itemInput.variantId ? { variantId: itemInput.variantId } : {}),
        name: menuItem.name,
        ...(variantName ? { variantName } : {}),
        quantity: itemInput.quantity,
        unitPrice,
        subtotal: itemSubtotal,
        ...(itemInput.specialInstructions
          ? { specialInstructions: itemInput.specialInstructions }
          : {}),
        modifiers: modifiersSnapshot,
      });
    }

    // 4. Tax Calculation
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

    const itemsAndChargesTotal = calculatedSubtotal.plus(deliveryCharge).plus(packagingCharge);

    const totalAmount = restaurant.taxInclusive
      ? itemsAndChargesTotal
      : itemsAndChargesTotal.plus(taxAmount);

    // 5. Validate Rider if provided
    if (input.riderId) {
      const rider = await prisma.user.findFirst({
        where: { id: input.riderId, restaurantId, isActive: true },
      });
      if (!rider) {
        throw new BadRequestError('Invalid or inactive rider specified');
      }
    }

    const businessDate = this.getBusinessDate();

    // 6. Atomic Transaction for Order Creation & Order Code Sequence Generation
    const order = await prisma.$transaction(async (tx) => {
      const sequence = await tx.$queryRaw<{ lastOrderNumber: number }[]>`
        INSERT INTO "delivery_daily_sequences" ("id", "restaurantId", "businessDate", "lastOrderNumber", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, ${restaurantId}, ${businessDate}, 1, NOW(), NOW())
        ON CONFLICT ("restaurantId", "businessDate")
        DO UPDATE SET "lastOrderNumber" = "delivery_daily_sequences"."lastOrderNumber" + 1, "updatedAt" = NOW()
        RETURNING "lastOrderNumber";
      `;

      const orderNumber = sequence[0]?.lastOrderNumber ?? 1;
      const formattedNum = orderNumber < 100 ? `00${orderNumber}`.slice(-3) : `${orderNumber}`;
      const dateCompact = businessDate.replace(/-/g, '');
      const orderCode = `DEL-${dateCompact}-${formattedNum}`;

      const newOrder = await tx.deliveryOrder.create({
        data: {
          restaurantId,
          orderCode,
          businessDate,
          customerId,
          customerName: input.customerName.trim(),
          customerPhone: input.customerPhone.trim(),
          deliveryAddress: input.deliveryAddress.trim(),
          landmark: input.landmark ?? null,
          deliveryZoneId: input.deliveryZoneId ?? null,
          deliveryZoneName,
          deliveryCharge,
          packagingCharge,
          subtotal: calculatedSubtotal,
          taxRate,
          taxAmount,
          discountAmount: new Prisma.Decimal(0),
          totalAmount,
          paymentStatus: input.paymentMethod.toUpperCase() === 'PREPAID' ? 'PAID' : 'PENDING',
          paymentMethod: input.paymentMethod.toUpperCase(),
          status: 'PENDING',
          riderId: input.riderId ?? null,
          assignedAt: input.riderId ? new Date() : null,
          specialInstructions: input.specialInstructions ?? null,
          isAggregator: input.isAggregator ?? false,
          aggregatorName: input.aggregatorName ?? null,
          aggregatorReference: input.aggregatorReference ?? null,
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
          rider: { select: { id: true, name: true, username: true, phone: true } },
          customer: { select: { id: true, name: true, phone: true } },
          deliveryZone: { select: { id: true, name: true } },
          createdByUser: { select: { id: true, name: true, username: true } },
        },
      });

      return newOrder;
    });

    // 7. Audit Logging
    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'DELIVERY_ORDER_CREATED',
      entityType: 'DELIVERY_ORDER',
      entityId: order.id,
      metadata: {
        orderCode: order.orderCode,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        totalAmount: order.totalAmount.toNumber(),
        deliveryCharge: order.deliveryCharge.toNumber(),
        isAggregator: order.isAggregator,
        aggregatorName: order.aggregatorName,
      },
      ipAddress: ipAddress ?? null,
    });

    // 8. Realtime Event Emission
    RealtimeService.emitToRestaurant(restaurantId, 'delivery:order_created', {
      orderId: order.id,
      orderCode: order.orderCode,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deliveryAddress: order.deliveryAddress,
      status: order.status,
      totalAmount: order.totalAmount.toNumber(),
      riderId: order.riderId,
      riderName: order.rider?.name,
    });

    return {
      ...order,
      subtotal: order.subtotal.toNumber(),
      deliveryCharge: order.deliveryCharge.toNumber(),
      packagingCharge: order.packagingCharge.toNumber(),
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
   * Retrieves active delivery queue for the POS dispatcher view.
   */
  public static async getDispatcherQueue(restaurantId: string) {
    const orders = await prisma.deliveryOrder.findMany({
      where: {
        restaurantId,
        status: { in: ['PENDING', 'PREPARING', 'READY', 'DISPATCHED'] },
      },
      include: {
        rider: { select: { id: true, name: true, phone: true } },
        items: true,
        deliveryZone: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const pendingCount = orders.filter((o) => o.status === 'PENDING').length;
    const preparingCount = orders.filter((o) => o.status === 'PREPARING').length;
    const readyCount = orders.filter((o) => o.status === 'READY').length;
    const dispatchedCount = orders.filter((o) => o.status === 'DISPATCHED').length;

    const now = Date.now();
    const formattedOrders = orders.map((o) => ({
      id: o.id,
      orderCode: o.orderCode,
      businessDate: o.businessDate,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      deliveryAddress: o.deliveryAddress,
      landmark: o.landmark,
      deliveryZoneName: o.deliveryZoneName,
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      totalAmount: o.totalAmount.toNumber(),
      deliveryCharge: o.deliveryCharge.toNumber(),
      orderAgeMinutes: Math.floor((now - o.createdAt.getTime()) / 60000),
      isAggregator: o.isAggregator,
      aggregatorName: o.aggregatorName,
      rider: o.rider,
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
      summary: {
        totalActive: orders.length,
        pending: pendingCount,
        preparing: preparingCount,
        ready: readyCount,
        dispatched: dispatchedCount,
      },
      queue: formattedOrders,
    };
  }

  /**
   * Lists delivery orders with pagination and filtering.
   */
  public static async listOrders(restaurantId: string, query: ListDeliveryOrdersQueryInput) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const whereClause: Prisma.DeliveryOrderWhereInput = {
      restaurantId,
      ...(query.status && { status: query.status }),
      ...(query.riderId && { riderId: query.riderId }),
      ...(query.businessDate && { businessDate: query.businessDate }),
      ...(query.isSettled !== undefined && { isSettled: query.isSettled }),
      ...(query.search && {
        OR: [
          { customerName: { contains: query.search, mode: 'insensitive' } },
          { customerPhone: { contains: query.search, mode: 'insensitive' } },
          { orderCode: { contains: query.search, mode: 'insensitive' } },
          { deliveryAddress: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, orders] = await Promise.all([
      prisma.deliveryOrder.count({ where: whereClause }),
      prisma.deliveryOrder.findMany({
        where: whereClause,
        include: {
          rider: { select: { id: true, name: true, phone: true } },
          items: true,
          deliveryZone: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const formattedOrders = orders.map((o) => ({
      ...o,
      subtotal: o.subtotal.toNumber(),
      deliveryCharge: o.deliveryCharge.toNumber(),
      packagingCharge: o.packagingCharge.toNumber(),
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
   * Retrieves single delivery order details.
   */
  public static async getOrderById(restaurantId: string, orderId: string) {
    const order = await prisma.deliveryOrder.findFirst({
      where: { id: orderId, restaurantId },
      include: {
        rider: { select: { id: true, name: true, username: true, phone: true } },
        customer: { select: { id: true, name: true, phone: true, notes: true } },
        deliveryZone: { select: { id: true, name: true, deliveryCharge: true } },
        createdByUser: { select: { id: true, name: true, username: true } },
        items: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Delivery order not found in this restaurant');
    }

    return {
      ...order,
      subtotal: order.subtotal.toNumber(),
      deliveryCharge: order.deliveryCharge.toNumber(),
      packagingCharge: order.packagingCharge.toNumber(),
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
   * Updates delivery lifecycle status (PREPARING, READY, DISPATCHED, DELIVERED, FAILED).
   */
  public static async updateOrderStatus(
    restaurantId: string,
    orderId: string,
    input: UpdateDeliveryStatusInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const existing = await prisma.deliveryOrder.findFirst({
      where: { id: orderId, restaurantId },
      include: { rider: true },
    });

    if (!existing) {
      throw new NotFoundError('Delivery order not found in this restaurant');
    }

    if (existing.status === 'CANCELLED' || existing.status === 'DELIVERED') {
      throw new BadRequestError(
        `Cannot change status of an order that is already ${existing.status}`,
      );
    }

    let riderId = existing.riderId;
    if (input.riderId) {
      const rider = await prisma.user.findFirst({
        where: { id: input.riderId, restaurantId, isActive: true },
      });
      if (!rider) throw new BadRequestError('Invalid or inactive rider specified');
      riderId = input.riderId;
    }

    if (input.status === 'DISPATCHED' && !riderId) {
      throw new BadRequestError('Cannot dispatch a delivery order without an assigned rider');
    }

    const updated = await prisma.deliveryOrder.update({
      where: { id: orderId },
      data: {
        status: input.status,
        ...(riderId ? { riderId } : {}),
        ...(input.status === 'DISPATCHED' && !existing.dispatchedAt
          ? { dispatchedAt: new Date() }
          : {}),
        ...(input.status === 'DELIVERED'
          ? {
              deliveredAt: new Date(),
              ...(input.markPaid !== false ? { paymentStatus: 'PAID' } : {}),
            }
          : {}),
      },
      include: {
        rider: { select: { id: true, name: true, phone: true } },
        items: true,
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'DELIVERY_STATUS_CHANGED',
      entityType: 'DELIVERY_ORDER',
      entityId: orderId,
      metadata: {
        orderCode: existing.orderCode,
        previousStatus: existing.status,
        newStatus: input.status,
        paymentStatus: updated.paymentStatus,
        riderId: updated.riderId,
      },
      ipAddress: ipAddress ?? null,
    });

    RealtimeService.emitToRestaurant(restaurantId, 'delivery:status_changed', {
      orderId,
      orderCode: existing.orderCode,
      previousStatus: existing.status,
      status: input.status,
      paymentStatus: updated.paymentStatus,
      riderId: updated.riderId,
    });

    return {
      ...updated,
      subtotal: updated.subtotal.toNumber(),
      deliveryCharge: updated.deliveryCharge.toNumber(),
      packagingCharge: updated.packagingCharge.toNumber(),
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
   * Cancels a delivery order with a required cancellation reason.
   */
  public static async cancelOrder(
    restaurantId: string,
    orderId: string,
    input: CancelDeliveryOrderInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const existing = await prisma.deliveryOrder.findFirst({
      where: { id: orderId, restaurantId },
    });

    if (!existing) {
      throw new NotFoundError('Delivery order not found in this restaurant');
    }

    if (existing.status === 'CANCELLED') {
      throw new BadRequestError('Delivery order is already cancelled');
    }

    if (existing.status === 'DELIVERED') {
      throw new BadRequestError('Cannot cancel an already delivered delivery order');
    }

    const cancelled = await prisma.deliveryOrder.update({
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
      action: 'DELIVERY_CANCELLED',
      entityType: 'DELIVERY_ORDER',
      entityId: orderId,
      metadata: {
        orderCode: existing.orderCode,
        reason: input.reason,
        cancelledBy: actor.username,
      },
      ipAddress: ipAddress ?? null,
    });

    RealtimeService.emitToRestaurant(restaurantId, 'delivery:order_cancelled', {
      orderId,
      orderCode: existing.orderCode,
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
