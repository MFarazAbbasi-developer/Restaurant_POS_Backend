import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AuditService } from '../../common/services/audit.service.js';
import { RealtimeService } from '../../common/services/realtime.service.js';
import { BadRequestError, NotFoundError } from '../../common/errors/app-error.js';
import { ManagerAuthService } from '../auth/manager-auth.service.js';
import {
  CalculatedItemModifier,
  CalculatedOrderItem,
  OrderCalculationService,
} from './order-calculation.service.js';

export interface OrderItemInput {
  menuItemId: string;
  variantId?: string;
  quantity: number;
  modifierIds?: string[];
  discountType?: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue?: number;
  specialInstructions?: string;
}

export interface CreateOrderInput {
  orderType: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
  items: OrderItemInput[];
  tableId?: string;
  tableOrderId?: string;
  guestCount?: number;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryZoneId?: string;
  flatDeliveryFee?: number;
  packagingCharge?: number;
  notes?: string;
  paymentMethod?: string;
  isAggregator?: boolean;
  aggregatorName?: string;
  aggregatorReference?: string;
}

export interface ActorContext {
  id: string;
  restaurantId: string;
  username: string;
  roles: string[];
  permissions: string[];
}

export class OrderService {
  /**
   * Helper to format Date into YYYY-MM-DD business date string.
   */
  private static getBusinessDateString(date = new Date()): string {
    return date.toISOString().split('T')[0] ?? '';
  }

  /**
   * Helper to serialize Decimal fields to Javascript numbers for API responses.
   */
  public static serializeOrder(order: Record<string, unknown>): Record<string, unknown> {
    const rawItems = Array.isArray(order.items) ? (order.items as Record<string, unknown>[]) : [];

    return {
      ...order,
      subtotal:
        order.subtotal instanceof Prisma.Decimal
          ? order.subtotal.toNumber()
          : Number(order.subtotal || 0),
      itemDiscountsTotal:
        order.itemDiscountsTotal instanceof Prisma.Decimal
          ? order.itemDiscountsTotal.toNumber()
          : Number(order.itemDiscountsTotal || 0),
      orderDiscountValue:
        order.orderDiscountValue instanceof Prisma.Decimal
          ? order.orderDiscountValue.toNumber()
          : order.orderDiscountValue !== null && order.orderDiscountValue !== undefined
            ? Number(order.orderDiscountValue)
            : null,
      orderDiscountAmount:
        order.orderDiscountAmount instanceof Prisma.Decimal
          ? order.orderDiscountAmount.toNumber()
          : Number(order.orderDiscountAmount || 0),
      totalDiscount:
        order.totalDiscount instanceof Prisma.Decimal
          ? order.totalDiscount.toNumber()
          : Number(order.totalDiscount || 0),
      taxRate:
        order.taxRate instanceof Prisma.Decimal
          ? order.taxRate.toNumber()
          : order.taxRate !== null && order.taxRate !== undefined
            ? Number(order.taxRate)
            : null,
      taxAmount:
        order.taxAmount instanceof Prisma.Decimal
          ? order.taxAmount.toNumber()
          : Number(order.taxAmount || 0),
      serviceChargeRate:
        order.serviceChargeRate instanceof Prisma.Decimal
          ? order.serviceChargeRate.toNumber()
          : order.serviceChargeRate !== null && order.serviceChargeRate !== undefined
            ? Number(order.serviceChargeRate)
            : null,
      serviceChargeAmount:
        order.serviceChargeAmount instanceof Prisma.Decimal
          ? order.serviceChargeAmount.toNumber()
          : Number(order.serviceChargeAmount || 0),
      deliveryCharge:
        order.deliveryCharge instanceof Prisma.Decimal
          ? order.deliveryCharge.toNumber()
          : Number(order.deliveryCharge || 0),
      packagingCharge:
        order.packagingCharge instanceof Prisma.Decimal
          ? order.packagingCharge.toNumber()
          : Number(order.packagingCharge || 0),
      roundingAmount:
        order.roundingAmount instanceof Prisma.Decimal
          ? order.roundingAmount.toNumber()
          : Number(order.roundingAmount || 0),
      grandTotal:
        order.grandTotal instanceof Prisma.Decimal
          ? order.grandTotal.toNumber()
          : Number(order.grandTotal || 0),
      paidAmount:
        order.paidAmount instanceof Prisma.Decimal
          ? order.paidAmount.toNumber()
          : Number(order.paidAmount || 0),
      changeAmount:
        order.changeAmount instanceof Prisma.Decimal
          ? order.changeAmount.toNumber()
          : Number(order.changeAmount || 0),
      items: order.items
        ? rawItems.map((item) => {
            const rawMods = Array.isArray(item.modifiers)
              ? (item.modifiers as Record<string, unknown>[])
              : [];
            return {
              ...item,
              unitPrice:
                item.unitPrice instanceof Prisma.Decimal
                  ? item.unitPrice.toNumber()
                  : Number(item.unitPrice || 0),
              modifiersPrice:
                item.modifiersPrice instanceof Prisma.Decimal
                  ? item.modifiersPrice.toNumber()
                  : Number(item.modifiersPrice || 0),
              itemGrossTotal:
                item.itemGrossTotal instanceof Prisma.Decimal
                  ? item.itemGrossTotal.toNumber()
                  : Number(item.itemGrossTotal || 0),
              discountValue:
                item.discountValue instanceof Prisma.Decimal
                  ? item.discountValue.toNumber()
                  : item.discountValue !== null && item.discountValue !== undefined
                    ? Number(item.discountValue)
                    : null,
              discountAmount:
                item.discountAmount instanceof Prisma.Decimal
                  ? item.discountAmount.toNumber()
                  : Number(item.discountAmount || 0),
              itemNetTotal:
                item.itemNetTotal instanceof Prisma.Decimal
                  ? item.itemNetTotal.toNumber()
                  : Number(item.itemNetTotal || 0),
              modifiers: item.modifiers
                ? rawMods.map((mod) => ({
                    ...mod,
                    priceAdjustment:
                      mod.priceAdjustment instanceof Prisma.Decimal
                        ? mod.priceAdjustment.toNumber()
                        : Number(mod.priceAdjustment || 0),
                  }))
                : [],
            };
          })
        : undefined,
    };
  }

  /**
   * Helper to validate and calculate items from menu catalog.
   */
  private static async resolveAndCalculateItems(
    restaurantId: string,
    itemsInput: OrderItemInput[],
  ): Promise<CalculatedOrderItem[]> {
    const menuItemIds = [...new Set(itemsInput.map((i) => i.menuItemId))];
    const variantIds = [
      ...new Set(itemsInput.map((i) => i.variantId).filter((v): v is string => Boolean(v))),
    ];
    const allModifierIds = [...new Set(itemsInput.flatMap((i) => i.modifierIds || []))];

    // Fetch catalog items
    const menuItems = await prisma.menuItem.findMany({
      where: {
        id: { in: menuItemIds },
        restaurantId,
        isActive: true,
      },
    });
    const menuItemMap = new Map(menuItems.map((m) => [m.id, m]));

    // Fetch variants
    const variants = variantIds.length
      ? await prisma.menuItemVariant.findMany({
          where: {
            id: { in: variantIds },
            isActive: true,
          },
        })
      : [];
    const variantMap = new Map(variants.map((v) => [v.id, v]));

    // Fetch modifiers
    const modifiers = allModifierIds.length
      ? await prisma.modifier.findMany({
          where: {
            id: { in: allModifierIds },
            isActive: true,
          },
        })
      : [];
    const modifierMap = new Map(modifiers.map((m) => [m.id, m]));

    const calculatedItems: CalculatedOrderItem[] = [];

    for (const itemInput of itemsInput) {
      const menuItem = menuItemMap.get(itemInput.menuItemId);
      if (!menuItem) {
        throw new BadRequestError(
          `Menu item ${itemInput.menuItemId} is invalid, inactive, or unavailable`,
        );
      }

      let variantName: string | null = null;
      let unitPrice = menuItem.basePrice;

      if (itemInput.variantId) {
        const variant = variantMap.get(itemInput.variantId);
        if (!variant || variant.menuItemId !== menuItem.id) {
          throw new BadRequestError(
            `Variant ${itemInput.variantId} does not belong to menu item "${menuItem.name}"`,
          );
        }
        variantName = variant.name;
        unitPrice = variant.price;
      }

      const calculatedModifiers: CalculatedItemModifier[] = [];
      for (const modId of itemInput.modifierIds || []) {
        const mod = modifierMap.get(modId);
        if (!mod) {
          throw new BadRequestError(`Modifier ${modId} is invalid or inactive`);
        }
        calculatedModifiers.push({
          modifierId: mod.id,
          modifierGroupId: mod.modifierGroupId,
          name: mod.name,
          priceAdjustment: mod.priceAdjustment,
        });
      }

      const itemCalc = OrderCalculationService.calculateItemTotals({
        unitPrice,
        quantity: itemInput.quantity,
        modifiers: calculatedModifiers,
        discountType: itemInput.discountType,
        discountValue: itemInput.discountValue,
      });

      calculatedItems.push({
        menuItemId: menuItem.id,
        variantId: itemInput.variantId ?? null,
        itemName: menuItem.name,
        variantName,
        quantity: itemInput.quantity,
        unitPrice: itemCalc.unitPrice,
        modifiersPrice: itemCalc.modifiersPrice,
        itemGrossTotal: itemCalc.itemGrossTotal,
        discountType: itemCalc.discountType,
        discountValue: itemCalc.discountValue,
        discountAmount: itemCalc.discountAmount,
        itemNetTotal: itemCalc.itemNetTotal,
        specialInstructions: itemInput.specialInstructions ?? null,
        modifiers: calculatedModifiers,
      });
    }

    return calculatedItems;
  }

  /**
   * 1. Creates a Unified Order (DINE_IN, TAKEAWAY, or DELIVERY).
   */
  public static async createOrder(
    restaurantId: string,
    input: CreateOrderInput,
    actor: ActorContext,
    ipAddress?: string,
  ) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });
    if (!restaurant || !restaurant.isActive) {
      throw new NotFoundError('Restaurant not found or inactive');
    }

    // Verify channel enabled
    if (input.orderType === 'DINE_IN' && !restaurant.dineInEnabled) {
      throw new BadRequestError('Dine-in ordering is currently disabled for this restaurant');
    }
    if (input.orderType === 'TAKEAWAY' && !restaurant.takeawayEnabled) {
      throw new BadRequestError('Takeaway ordering is currently disabled for this restaurant');
    }
    if (input.orderType === 'DELIVERY' && !restaurant.deliveryEnabled) {
      throw new BadRequestError('Delivery ordering is currently disabled for this restaurant');
    }

    // Validate Dine-in table
    let table = null;
    if (input.orderType === 'DINE_IN' && input.tableId) {
      table = await prisma.restaurantTable.findFirst({
        where: { id: input.tableId, restaurantId, isActive: true },
      });
      if (!table) {
        throw new BadRequestError('Specified table is invalid or inactive');
      }
    }

    // Determine delivery charge
    let deliveryCharge = new Prisma.Decimal(input.flatDeliveryFee ?? 0);
    if (input.orderType === 'DELIVERY' && input.deliveryZoneId) {
      const zone = await prisma.deliveryZone.findFirst({
        where: { id: input.deliveryZoneId, restaurantId, isActive: true },
      });
      if (!zone) {
        throw new BadRequestError('Specified delivery zone is invalid or inactive');
      }
      if (input.flatDeliveryFee === undefined) {
        deliveryCharge = zone.deliveryCharge;
      }
    }

    // Resolve item snapshots and pricing
    const calculatedItems = await this.resolveAndCalculateItems(restaurantId, input.items);

    // Calculate order financial breakdown
    const orderCalculation = OrderCalculationService.calculateOrderTotals({
      items: calculatedItems,
      taxRate: restaurant.taxRate,
      taxInclusive: restaurant.taxInclusive,
      serviceChargeRate: restaurant.serviceChargeRate,
      serviceChargeEnabled: input.orderType === 'DINE_IN' ? restaurant.serviceChargeEnabled : false,
      deliveryCharge,
      packagingCharge: input.packagingCharge ?? 0,
    });

    const businessDate = this.getBusinessDateString();

    const createdOrder = await prisma.$transaction(async (tx) => {
      // 1. Generate sequential order code
      const sequence = (await tx.$queryRaw`
        INSERT INTO "daily_order_sequences" ("id", "restaurantId", "businessDate", "lastOrderNumber", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, ${restaurantId}, ${businessDate}, 1, NOW(), NOW())
        ON CONFLICT ("restaurantId", "businessDate")
        DO UPDATE SET "lastOrderNumber" = "daily_order_sequences"."lastOrderNumber" + 1, "updatedAt" = NOW()
        RETURNING "lastOrderNumber"
      `) as { lastOrderNumber: number }[];

      const orderNumber = sequence[0]?.lastOrderNumber ?? 1;
      const formattedNum = orderNumber < 100 ? `00${orderNumber}`.slice(-3) : `${orderNumber}`;
      const dateCompact = businessDate.replace(/-/g, '');
      const orderCode = `ORD-${dateCompact}-${formattedNum}`;

      // 2. Create Order
      const newOrder = await tx.order.create({
        data: {
          restaurantId,
          orderCode,
          businessDate,
          orderType: input.orderType,
          status: 'PENDING',
          paymentStatus: input.paymentMethod?.toUpperCase() === 'PREPAID' ? 'PAID' : 'UNPAID',
          paymentMethod: input.paymentMethod ?? 'CASH',
          subtotal: orderCalculation.subtotal,
          itemDiscountsTotal: orderCalculation.itemDiscountsTotal,
          orderDiscountType: orderCalculation.orderDiscountType,
          orderDiscountValue: orderCalculation.orderDiscountValue,
          orderDiscountAmount: orderCalculation.orderDiscountAmount,
          orderDiscountReason: orderCalculation.orderDiscountReason,
          totalDiscount: orderCalculation.totalDiscount,
          taxRate: orderCalculation.taxRate,
          taxInclusive: orderCalculation.taxInclusive,
          taxAmount: orderCalculation.taxAmount,
          serviceChargeRate: orderCalculation.serviceChargeRate,
          serviceChargeAmount: orderCalculation.serviceChargeAmount,
          deliveryCharge: orderCalculation.deliveryCharge,
          packagingCharge: orderCalculation.packagingCharge,
          roundingAmount: orderCalculation.roundingAmount,
          grandTotal: orderCalculation.grandTotal,
          tableId: input.tableId ?? null,
          tableOrderId: input.tableOrderId ?? null,
          guestCount: input.guestCount ?? 1,
          customerId: input.customerId ?? null,
          customerName: input.customerName ?? null,
          customerPhone: input.customerPhone ?? null,
          deliveryAddress: input.deliveryAddress ?? null,
          deliveryZoneId: input.deliveryZoneId ?? null,
          isAggregator: input.isAggregator ?? false,
          aggregatorName: input.aggregatorName ?? null,
          aggregatorReference: input.aggregatorReference ?? null,
          notes: input.notes ?? null,
          createdById: actor.id,
          items: {
            create: calculatedItems.map((it) => ({
              menuItemId: it.menuItemId,
              ...(it.variantId ? { variantId: it.variantId } : {}),
              itemName: it.itemName,
              ...(it.variantName ? { variantName: it.variantName } : {}),
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              modifiersPrice: it.modifiersPrice,
              itemGrossTotal: it.itemGrossTotal,
              ...(it.discountType ? { discountType: it.discountType } : {}),
              ...(it.discountValue ? { discountValue: it.discountValue } : {}),
              discountAmount: it.discountAmount,
              itemNetTotal: it.itemNetTotal,
              status: 'ACTIVE',
              ...(it.specialInstructions ? { specialInstructions: it.specialInstructions } : {}),
              modifiers: {
                create: it.modifiers.map((m) => ({
                  modifierId: m.modifierId,
                  ...(m.modifierGroupId ? { modifierGroupId: m.modifierGroupId } : {}),
                  name: m.name,
                  priceAdjustment: m.priceAdjustment,
                })),
              },
            })),
          },
        },
        include: {
          items: {
            include: {
              modifiers: true,
            },
          },
          table: true,
          customer: true,
          deliveryZone: true,
          createdByUser: {
            select: { id: true, name: true, username: true },
          },
        },
      });

      // 3. If dine-in and table was AVAILABLE, update table status to OCCUPIED
      if (table && table.status === 'AVAILABLE') {
        await tx.restaurantTable.update({
          where: { id: table.id },
          data: { status: 'OCCUPIED' },
        });
      }

      return newOrder;
    });

    // 4. Audit Log
    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'ORDER_CREATED',
      entityType: 'ORDER',
      entityId: createdOrder.id,
      metadata: {
        orderCode: createdOrder.orderCode,
        orderType: createdOrder.orderType,
        grandTotal: createdOrder.grandTotal.toNumber(),
        itemsCount: calculatedItems.length,
      },
      ipAddress: ipAddress ?? null,
    });

    // 5. Realtime Notification
    RealtimeService.emitToRestaurant(restaurantId, 'order:created', {
      orderId: createdOrder.id,
      orderCode: createdOrder.orderCode,
      orderType: createdOrder.orderType,
      status: createdOrder.status,
      grandTotal: createdOrder.grandTotal.toNumber(),
      tableId: createdOrder.tableId,
      customerName: createdOrder.customerName,
    });
    RealtimeService.emitToRestaurant(restaurantId, 'kitchen:order_new', {
      orderId: createdOrder.id,
      orderCode: createdOrder.orderCode,
      orderType: createdOrder.orderType,
      status: createdOrder.status,
    });

    return this.serializeOrder(createdOrder);
  }

  /**
   * 2. Retrieves a single order by ID.
   */
  public static async getOrderById(restaurantId: string, orderId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: {
        items: {
          include: {
            modifiers: true,
          },
        },
        table: true,
        customer: true,
        deliveryZone: true,
        rider: {
          select: { id: true, name: true, username: true, phone: true },
        },
        createdByUser: {
          select: { id: true, name: true, username: true },
        },
        voidedByUser: {
          select: { id: true, name: true, username: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundError('Order not found');
    }

    return this.serializeOrder(order);
  }

  /**
   * 3. Lists and filters orders with pagination.
   */
  public static async listOrders(
    restaurantId: string,
    query: {
      status?:
        | 'PENDING'
        | 'CONFIRMED'
        | 'PREPARING'
        | 'READY'
        | 'SERVED'
        | 'COMPLETED'
        | 'CANCELLED'
        | 'VOIDED';
      orderType?: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
      paymentStatus?: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED';
      tableId?: string;
      businessDate?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      restaurantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.orderType ? { orderType: query.orderType } : {}),
      ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
      ...(query.tableId ? { tableId: query.tableId } : {}),
      ...(query.businessDate ? { businessDate: query.businessDate } : {}),
      ...(query.search
        ? {
            OR: [
              { orderCode: { contains: query.search, mode: 'insensitive' } },
              { customerName: { contains: query.search, mode: 'insensitive' } },
              { customerPhone: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            include: {
              modifiers: true,
            },
          },
          table: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true, phone: true } },
          rider: { select: { id: true, name: true, username: true } },
        },
      }),
    ]);

    return {
      orders: orders.map((o) => this.serializeOrder(o)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 4. Adds items/courses incrementally to an active order.
   */
  public static async addItemsToOrder(
    restaurantId: string,
    orderId: string,
    itemsInput: OrderItemInput[],
    actor: ActorContext,
    ipAddress?: string,
  ) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: {
        items: {
          include: { modifiers: true },
        },
        restaurant: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Order not found');
    }

    if (['COMPLETED', 'CANCELLED', 'VOIDED'].includes(order.status)) {
      throw new BadRequestError(`Cannot add items to an order with status ${order.status}`);
    }

    // Resolve new items
    const newCalculatedItems = await this.resolveAndCalculateItems(restaurantId, itemsInput);

    // Combine existing active items with new items
    const existingActiveCalculatedItems: CalculatedOrderItem[] = order.items
      .filter((i) => i.status === 'ACTIVE')
      .map((it) => ({
        menuItemId: it.menuItemId,
        variantId: it.variantId,
        itemName: it.itemName,
        variantName: it.variantName,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        modifiersPrice: it.modifiersPrice,
        itemGrossTotal: it.itemGrossTotal,
        discountType: it.discountType,
        discountValue: it.discountValue,
        discountAmount: it.discountAmount,
        itemNetTotal: it.itemNetTotal,
        specialInstructions: it.specialInstructions,
        modifiers: it.modifiers.map((m) => ({
          modifierId: m.modifierId,
          modifierGroupId: m.modifierGroupId,
          name: m.name,
          priceAdjustment: m.priceAdjustment,
        })),
      }));

    const allActiveItems = [...existingActiveCalculatedItems, ...newCalculatedItems];

    // Recalculate totals
    const orderCalculation = OrderCalculationService.calculateOrderTotals({
      items: allActiveItems,
      orderDiscountType: order.orderDiscountType,
      orderDiscountValue: order.orderDiscountValue,
      orderDiscountReason: order.orderDiscountReason,
      taxRate: order.taxRate,
      taxInclusive: order.taxInclusive,
      serviceChargeRate: order.serviceChargeRate,
      serviceChargeEnabled:
        order.orderType === 'DINE_IN' ? order.restaurant.serviceChargeEnabled : false,
      deliveryCharge: order.deliveryCharge,
      packagingCharge: order.packagingCharge,
    });

    const updatedOrder = await prisma.$transaction(async (tx) => {
      // 1. Insert new items
      for (const it of newCalculatedItems) {
        await tx.orderItem.create({
          data: {
            orderId: order.id,
            menuItemId: it.menuItemId,
            ...(it.variantId ? { variantId: it.variantId } : {}),
            itemName: it.itemName,
            ...(it.variantName ? { variantName: it.variantName } : {}),
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            modifiersPrice: it.modifiersPrice,
            itemGrossTotal: it.itemGrossTotal,
            ...(it.discountType ? { discountType: it.discountType } : {}),
            ...(it.discountValue ? { discountValue: it.discountValue } : {}),
            discountAmount: it.discountAmount,
            itemNetTotal: it.itemNetTotal,
            status: 'ACTIVE',
            ...(it.specialInstructions ? { specialInstructions: it.specialInstructions } : {}),
            modifiers: {
              create: it.modifiers.map((m) => ({
                modifierId: m.modifierId,
                ...(m.modifierGroupId ? { modifierGroupId: m.modifierGroupId } : {}),
                name: m.name,
                priceAdjustment: m.priceAdjustment,
              })),
            },
          },
        });
      }

      // 2. Update Order Totals
      return tx.order.update({
        where: { id: order.id },
        data: {
          subtotal: orderCalculation.subtotal,
          itemDiscountsTotal: orderCalculation.itemDiscountsTotal,
          orderDiscountAmount: orderCalculation.orderDiscountAmount,
          totalDiscount: orderCalculation.totalDiscount,
          taxAmount: orderCalculation.taxAmount,
          serviceChargeAmount: orderCalculation.serviceChargeAmount,
          grandTotal: orderCalculation.grandTotal,
        },
        include: {
          items: {
            include: {
              modifiers: true,
            },
          },
          table: true,
          customer: true,
        },
      });
    });

    // Audit log
    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'ORDER_ITEMS_ADDED',
      entityType: 'ORDER',
      entityId: order.id,
      metadata: {
        addedItemsCount: newCalculatedItems.length,
        newGrandTotal: updatedOrder.grandTotal.toNumber(),
      },
      ipAddress: ipAddress ?? null,
    });

    // Realtime notification
    RealtimeService.emitToRestaurant(restaurantId, 'order:items_added', {
      orderId: updatedOrder.id,
      orderCode: updatedOrder.orderCode,
      newGrandTotal: updatedOrder.grandTotal.toNumber(),
    });

    return this.serializeOrder(updatedOrder);
  }

  /**
   * 5. Voids a single item within an active order.
   */
  public static async voidOrderItem(
    restaurantId: string,
    orderId: string,
    itemId: string,
    voidReason: string,
    managerPin?: string,
    actor?: ActorContext,
    ipAddress?: string,
  ) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: {
        items: {
          include: { modifiers: true },
        },
        restaurant: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Order not found');
    }

    if (['COMPLETED', 'CANCELLED', 'VOIDED'].includes(order.status)) {
      throw new BadRequestError(`Cannot void items from an order with status ${order.status}`);
    }

    const itemToVoid = order.items.find((i) => i.id === itemId);
    if (!itemToVoid) {
      throw new NotFoundError('Order item not found');
    }

    if (itemToVoid.status === 'VOIDED') {
      throw new BadRequestError('Order item is already voided');
    }

    // Permission Verification: If actor lacks orders.void, check manager PIN
    const hasVoidPermission =
      actor?.permissions.includes('orders.void') || actor?.roles.includes('OWNER');
    if (!hasVoidPermission) {
      if (!managerPin) {
        throw new BadRequestError('Manager PIN is required to authorize voiding order items');
      }
      await ManagerAuthService.verifyManagerPin({
        restaurantId,
        pin: managerPin,
        requiredPermission: 'orders.void',
      });
    }

    // Filter remaining active items
    const remainingActiveCalculatedItems: CalculatedOrderItem[] = order.items
      .filter((i) => i.id !== itemId && i.status === 'ACTIVE')
      .map((it) => ({
        menuItemId: it.menuItemId,
        variantId: it.variantId,
        itemName: it.itemName,
        variantName: it.variantName,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        modifiersPrice: it.modifiersPrice,
        itemGrossTotal: it.itemGrossTotal,
        discountType: it.discountType,
        discountValue: it.discountValue,
        discountAmount: it.discountAmount,
        itemNetTotal: it.itemNetTotal,
        specialInstructions: it.specialInstructions,
        modifiers: it.modifiers.map((m) => ({
          modifierId: m.modifierId,
          modifierGroupId: m.modifierGroupId,
          name: m.name,
          priceAdjustment: m.priceAdjustment,
        })),
      }));

    // Recalculate totals
    const orderCalculation = OrderCalculationService.calculateOrderTotals({
      items: remainingActiveCalculatedItems,
      orderDiscountType: order.orderDiscountType,
      orderDiscountValue: order.orderDiscountValue,
      orderDiscountReason: order.orderDiscountReason,
      taxRate: order.taxRate,
      taxInclusive: order.taxInclusive,
      serviceChargeRate: order.serviceChargeRate,
      serviceChargeEnabled:
        order.orderType === 'DINE_IN' ? order.restaurant.serviceChargeEnabled : false,
      deliveryCharge: order.deliveryCharge,
      packagingCharge: order.packagingCharge,
    });

    const updatedOrder = await prisma.$transaction(async (tx) => {
      // 1. Mark item as VOIDED
      await tx.orderItem.update({
        where: { id: itemId },
        data: {
          status: 'VOIDED',
          voidReason,
          voidedAt: new Date(),
        },
      });

      // 2. Update order totals
      return tx.order.update({
        where: { id: order.id },
        data: {
          subtotal: orderCalculation.subtotal,
          itemDiscountsTotal: orderCalculation.itemDiscountsTotal,
          orderDiscountAmount: orderCalculation.orderDiscountAmount,
          totalDiscount: orderCalculation.totalDiscount,
          taxAmount: orderCalculation.taxAmount,
          serviceChargeAmount: orderCalculation.serviceChargeAmount,
          grandTotal: orderCalculation.grandTotal,
        },
        include: {
          items: {
            include: {
              modifiers: true,
            },
          },
          table: true,
          customer: true,
        },
      });
    });

    // Audit log
    await AuditService.log({
      restaurantId,
      userId: actor?.id ?? 'SYSTEM',
      action: 'ORDER_ITEM_VOIDED',
      entityType: 'ORDER',
      entityId: order.id,
      metadata: {
        voidedItemId: itemId,
        itemName: itemToVoid.itemName,
        voidReason,
        newGrandTotal: updatedOrder.grandTotal.toNumber(),
      },
      ipAddress: ipAddress ?? null,
    });

    // Realtime notification
    RealtimeService.emitToRestaurant(restaurantId, 'order:item_voided', {
      orderId: updatedOrder.id,
      orderCode: updatedOrder.orderCode,
      voidedItemId: itemId,
      newGrandTotal: updatedOrder.grandTotal.toNumber(),
    });
    RealtimeService.emitToRestaurant(restaurantId, 'kitchen:item_voided', {
      orderId: updatedOrder.id,
      orderCode: updatedOrder.orderCode,
      voidedItemId: itemId,
    });

    return this.serializeOrder(updatedOrder);
  }

  /**
   * 6. Applies or modifies an order-level discount.
   */
  public static async applyOrderDiscount(
    restaurantId: string,
    orderId: string,
    discountInput: {
      discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
      discountValue: number;
      discountReason: string;
      managerPin?: string;
    },
    actor: ActorContext,
    ipAddress?: string,
  ) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: {
        items: {
          include: { modifiers: true },
        },
        restaurant: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Order not found');
    }

    if (['COMPLETED', 'CANCELLED', 'VOIDED'].includes(order.status)) {
      throw new BadRequestError(`Cannot discount an order with status ${order.status}`);
    }

    // Permission Verification: If actor lacks orders.discount, verify manager PIN
    const hasDiscountPermission =
      actor.permissions.includes('orders.discount') || actor.roles.includes('OWNER');
    if (!hasDiscountPermission) {
      if (!discountInput.managerPin) {
        throw new BadRequestError('Manager PIN is required to authorize order discounts');
      }
      await ManagerAuthService.verifyManagerPin({
        restaurantId,
        pin: discountInput.managerPin,
        requiredPermission: 'orders.discount',
      });
    }

    // Active items
    const activeCalculatedItems: CalculatedOrderItem[] = order.items
      .filter((i) => i.status === 'ACTIVE')
      .map((it) => ({
        menuItemId: it.menuItemId,
        variantId: it.variantId,
        itemName: it.itemName,
        variantName: it.variantName,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        modifiersPrice: it.modifiersPrice,
        itemGrossTotal: it.itemGrossTotal,
        discountType: it.discountType,
        discountValue: it.discountValue,
        discountAmount: it.discountAmount,
        itemNetTotal: it.itemNetTotal,
        specialInstructions: it.specialInstructions,
        modifiers: it.modifiers.map((m) => ({
          modifierId: m.modifierId,
          modifierGroupId: m.modifierGroupId,
          name: m.name,
          priceAdjustment: m.priceAdjustment,
        })),
      }));

    // Recalculate with new order discount
    const orderCalculation = OrderCalculationService.calculateOrderTotals({
      items: activeCalculatedItems,
      orderDiscountType: discountInput.discountType,
      orderDiscountValue: discountInput.discountValue,
      orderDiscountReason: discountInput.discountReason,
      taxRate: order.taxRate,
      taxInclusive: order.taxInclusive,
      serviceChargeRate: order.serviceChargeRate,
      serviceChargeEnabled:
        order.orderType === 'DINE_IN' ? order.restaurant.serviceChargeEnabled : false,
      deliveryCharge: order.deliveryCharge,
      packagingCharge: order.packagingCharge,
    });

    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        orderDiscountType: orderCalculation.orderDiscountType,
        orderDiscountValue: orderCalculation.orderDiscountValue,
        orderDiscountAmount: orderCalculation.orderDiscountAmount,
        orderDiscountReason: orderCalculation.orderDiscountReason,
        totalDiscount: orderCalculation.totalDiscount,
        taxAmount: orderCalculation.taxAmount,
        serviceChargeAmount: orderCalculation.serviceChargeAmount,
        grandTotal: orderCalculation.grandTotal,
      },
      include: {
        items: {
          include: {
            modifiers: true,
          },
        },
        table: true,
        customer: true,
      },
    });

    // Audit log
    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'ORDER_DISCOUNT_APPLIED',
      entityType: 'ORDER',
      entityId: order.id,
      metadata: {
        discountType: discountInput.discountType,
        discountValue: discountInput.discountValue,
        discountReason: discountInput.discountReason,
        newGrandTotal: updatedOrder.grandTotal.toNumber(),
      },
      ipAddress: ipAddress ?? null,
    });

    // Realtime notification
    RealtimeService.emitToRestaurant(restaurantId, 'order:discount_applied', {
      orderId: updatedOrder.id,
      orderCode: updatedOrder.orderCode,
      orderDiscountAmount: updatedOrder.orderDiscountAmount.toNumber(),
      newGrandTotal: updatedOrder.grandTotal.toNumber(),
    });

    return this.serializeOrder(updatedOrder);
  }

  /**
   * 7. Updates order lifecycle status (e.g. CONFIRMED, PREPARING, READY, SERVED, COMPLETED).
   */
  public static async updateOrderStatus(
    restaurantId: string,
    orderId: string,
    newStatus:
      | 'PENDING'
      | 'CONFIRMED'
      | 'PREPARING'
      | 'READY'
      | 'SERVED'
      | 'COMPLETED'
      | 'CANCELLED'
      | 'VOIDED',
    actor: ActorContext,
    ipAddress?: string,
  ) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
    });

    if (!order) {
      throw new NotFoundError('Order not found');
    }

    if (order.status === newStatus) {
      return this.serializeOrder(order);
    }

    if (order.status === 'COMPLETED' || order.status === 'CANCELLED' || order.status === 'VOIDED') {
      throw new BadRequestError(`Cannot transition order that is already ${order.status}`);
    }

    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: newStatus,
        ...(newStatus === 'COMPLETED' ? { closedAt: new Date() } : {}),
      },
      include: {
        items: {
          include: {
            modifiers: true,
          },
        },
        table: true,
        customer: true,
      },
    });

    // Audit log
    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'ORDER_STATUS_CHANGED',
      entityType: 'ORDER',
      entityId: order.id,
      metadata: {
        previousStatus: order.status,
        newStatus,
      },
      ipAddress: ipAddress ?? null,
    });

    // Realtime notification
    RealtimeService.emitToRestaurant(restaurantId, 'order:status_changed', {
      orderId: updatedOrder.id,
      orderCode: updatedOrder.orderCode,
      previousStatus: order.status,
      status: newStatus,
    });

    return this.serializeOrder(updatedOrder);
  }

  /**
   * 8. Cancels an active order with reason.
   */
  public static async cancelOrder(
    restaurantId: string,
    orderId: string,
    reason: string,
    actor: ActorContext,
    ipAddress?: string,
  ) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: { table: true },
    });

    if (!order) {
      throw new NotFoundError('Order not found');
    }

    if (['COMPLETED', 'CANCELLED', 'VOIDED'].includes(order.status)) {
      throw new BadRequestError(`Cannot cancel order that is already ${order.status}`);
    }

    const cancelledOrder = await prisma.$transaction(async (tx) => {
      // 1. Cancel order
      const res = await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          cancelReason: reason,
          closedAt: new Date(),
        },
        include: {
          items: {
            include: {
              modifiers: true,
            },
          },
          table: true,
        },
      });

      return res;
    });

    // Audit log
    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'ORDER_CANCELLED',
      entityType: 'ORDER',
      entityId: order.id,
      metadata: {
        orderCode: order.orderCode,
        cancelReason: reason,
      },
      ipAddress: ipAddress ?? null,
    });

    // Realtime notification
    RealtimeService.emitToRestaurant(restaurantId, 'order:cancelled', {
      orderId: cancelledOrder.id,
      orderCode: cancelledOrder.orderCode,
      cancelReason: reason,
    });

    return this.serializeOrder(cancelledOrder);
  }

  /**
   * 9. Voids an entire order with reason.
   */
  public static async voidOrder(
    restaurantId: string,
    orderId: string,
    voidReason: string,
    managerPin?: string,
    actor?: ActorContext,
    ipAddress?: string,
  ) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundError('Order not found');
    }

    if (['VOIDED', 'CANCELLED'].includes(order.status)) {
      throw new BadRequestError(`Cannot void order that is already ${order.status}`);
    }

    // Permission Verification: If actor lacks orders.void, check manager PIN
    const hasVoidPermission =
      actor?.permissions.includes('orders.void') || actor?.roles.includes('OWNER');
    if (!hasVoidPermission) {
      if (!managerPin) {
        throw new BadRequestError('Manager PIN is required to authorize voiding an order');
      }
      await ManagerAuthService.verifyManagerPin({
        restaurantId,
        pin: managerPin,
        requiredPermission: 'orders.void',
      });
    }

    const voidedOrder = await prisma.$transaction(async (tx) => {
      // 1. Mark all items as voided
      await tx.orderItem.updateMany({
        where: { orderId: order.id, status: 'ACTIVE' },
        data: {
          status: 'VOIDED',
          voidReason,
          voidedAt: new Date(),
        },
      });

      // 2. Void order
      return tx.order.update({
        where: { id: order.id },
        data: {
          status: 'VOIDED',
          voidReason,
          voidedById: actor?.id ?? null,
          closedAt: new Date(),
        },
        include: {
          items: {
            include: {
              modifiers: true,
            },
          },
          table: true,
          voidedByUser: {
            select: { id: true, name: true, username: true },
          },
        },
      });
    });

    // Audit log
    await AuditService.log({
      restaurantId,
      userId: actor?.id ?? 'SYSTEM',
      action: 'ORDER_VOIDED',
      entityType: 'ORDER',
      entityId: order.id,
      metadata: {
        orderCode: order.orderCode,
        voidReason,
      },
      ipAddress: ipAddress ?? null,
    });

    // Realtime notification
    RealtimeService.emitToRestaurant(restaurantId, 'order:voided', {
      orderId: voidedOrder.id,
      orderCode: voidedOrder.orderCode,
      voidReason,
    });

    return this.serializeOrder(voidedOrder);
  }

  /**
   * 10. Retrieves active orders for a given physical dining table.
   */
  public static async getTableActiveOrders(restaurantId: string, tableId: string) {
    const table = await prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId },
    });

    if (!table) {
      throw new NotFoundError('Table not found');
    }

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        tableId,
        status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED'] },
      },
      include: {
        items: {
          include: {
            modifiers: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      table: {
        id: table.id,
        name: table.name,
        status: table.status,
        capacity: table.capacity,
      },
      orders: orders.map((o) => this.serializeOrder(o)),
    };
  }

  /**
   * 11. Calculates daily order and sales metrics for a business date.
   */
  public static async getDailyOrderSummary(restaurantId: string, businessDate?: string) {
    const date = businessDate ?? this.getBusinessDateString();

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        businessDate: date,
        status: { notIn: ['CANCELLED', 'VOIDED'] },
      },
    });

    const summary = {
      businessDate: date,
      totalOrders: orders.length,
      dineInOrders: orders.filter((o) => o.orderType === 'DINE_IN').length,
      takeawayOrders: orders.filter((o) => o.orderType === 'TAKEAWAY').length,
      deliveryOrders: orders.filter((o) => o.orderType === 'DELIVERY').length,
      totalSubtotal: orders.reduce((sum, o) => sum + o.subtotal.toNumber(), 0),
      totalDiscounts: orders.reduce((sum, o) => sum + o.totalDiscount.toNumber(), 0),
      totalTax: orders.reduce((sum, o) => sum + o.taxAmount.toNumber(), 0),
      totalServiceCharge: orders.reduce((sum, o) => sum + o.serviceChargeAmount.toNumber(), 0),
      totalDeliveryCharges: orders.reduce((sum, o) => sum + o.deliveryCharge.toNumber(), 0),
      totalPackagingCharges: orders.reduce((sum, o) => sum + o.packagingCharge.toNumber(), 0),
      totalGrandTotal: orders.reduce((sum, o) => sum + o.grandTotal.toNumber(), 0),
    };

    return summary;
  }
}
