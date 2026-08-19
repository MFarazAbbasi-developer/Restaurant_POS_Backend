import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { NotFoundError, BadRequestError } from '../../common/errors/app-error.js';
import { AuditService } from '../../common/services/audit.service.js';
import { RealtimeService } from '../../common/services/realtime.service.js';
import {
  KitchenQueueQuery,
  UpdateOrderKitchenStatusInput,
  UpdateItemKitchenStatusInput,
  RecallInput,
} from './kitchen.schema.js';
import { AuthenticatedUserContext } from '../../common/types/index.js';

export interface KitchenTicketItem {
  id: string;
  orderId: string;
  menuItemId: string;
  itemName: string;
  variantName: string | null;
  quantity: number;
  status: string;
  kitchenStatus: string;
  preparedAt: Date | null;
  kitchenNotes: string | null;
  specialInstructions: string | null;
  stationId: string | null;
  stationName: string | null;
  modifiers: {
    id: string;
    modifierOptionName: string;
    quantity: number;
  }[];
}

export interface KitchenTicket {
  id: string;
  orderCode: string;
  dailySequence: number;
  businessDate: string;
  orderType: string;
  status: string;
  paymentStatus: string;
  tableId: string | null;
  tableName: string | null;
  zoneName: string | null;
  tokenNumber: number | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  notes: string | null;
  createdAt: Date;
  elapsedSeconds: number;
  elapsedMinutes: number;
  urgencyTier: 'NORMAL' | 'WARNING' | 'CRITICAL';
  itemsSummary: {
    total: number;
    pending: number;
    preparing: number;
    ready: number;
    served: number;
  };
  items: KitchenTicketItem[];
}

export class KitchenService {
  /**
   * Helper to format raw database Order into rich KitchenTicket DTO with elapsed time & urgency.
   */
  public static formatTicket(order: Record<string, unknown>, now = new Date()): KitchenTicket {
    const rawItems = Array.isArray(order.items) ? (order.items as Record<string, unknown>[]) : [];

    const activeItems = rawItems.filter((i) => i.status !== 'VOIDED');

    const createdTime = new Date(order.createdAt as string | Date);
    const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - createdTime.getTime()) / 1000));
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);

    let urgencyTier: 'NORMAL' | 'WARNING' | 'CRITICAL' = 'NORMAL';
    if (elapsedMinutes >= 15) {
      urgencyTier = 'CRITICAL';
    } else if (elapsedMinutes >= 10) {
      urgencyTier = 'WARNING';
    }

    const itemsSummary = {
      total: activeItems.length,
      pending: activeItems.filter((i) => i.kitchenStatus === 'PENDING').length,
      preparing: activeItems.filter((i) => i.kitchenStatus === 'PREPARING').length,
      ready: activeItems.filter((i) => i.kitchenStatus === 'READY').length,
      served: activeItems.filter((i) => i.kitchenStatus === 'SERVED').length,
    };

    const tableObj = order.table as { name?: string; zone?: { name?: string } } | undefined;

    return {
      id: String(order.id),
      orderCode: String(order.orderCode),
      dailySequence: Number(order.dailySequence || 0),
      businessDate: String(order.businessDate),
      orderType: String(order.orderType),
      status: String(order.status),
      paymentStatus: String(order.paymentStatus),
      tableId: order.tableId ? String(order.tableId) : null,
      tableName: tableObj?.name ?? null,
      zoneName: tableObj?.zone?.name ?? null,
      tokenNumber:
        order.tokenNumber !== undefined && order.tokenNumber !== null
          ? Number(order.tokenNumber)
          : null,
      customerName: order.customerName ? String(order.customerName) : null,
      customerPhone: order.customerPhone ? String(order.customerPhone) : null,
      deliveryAddress: order.deliveryAddress ? String(order.deliveryAddress) : null,
      notes: order.notes ? String(order.notes) : null,
      createdAt: createdTime,
      elapsedSeconds,
      elapsedMinutes,
      urgencyTier,
      itemsSummary,
      items: activeItems.map((item) => {
        const rawMods = Array.isArray(item.modifiers)
          ? (item.modifiers as Record<string, unknown>[])
          : [];
        const stationObj = item.station as { name?: string } | undefined;

        return {
          id: String(item.id),
          orderId: String(item.orderId),
          menuItemId: String(item.menuItemId),
          itemName: String(item.itemName),
          variantName: item.variantName ? String(item.variantName) : null,
          quantity: Number(item.quantity || 1),
          status: String(item.status),
          kitchenStatus: String(item.kitchenStatus || 'PENDING'),
          preparedAt: item.preparedAt ? new Date(item.preparedAt as string | Date) : null,
          kitchenNotes: item.kitchenNotes ? String(item.kitchenNotes) : null,
          specialInstructions: item.specialInstructions ? String(item.specialInstructions) : null,
          stationId: item.stationId ? String(item.stationId) : null,
          stationName: stationObj?.name ?? null,
          modifiers: rawMods.map((m) => ({
            id: String(m.id),
            modifierOptionName: String(m.name || m.modifierOptionName || ''),
            quantity: Number(m.quantity || 1),
          })),
        };
      }),
    };
  }

  /**
   * 1. Get active Kitchen Queue with station and category filtering.
   */
  public static async getKitchenQueue(
    restaurantId: string,
    query: KitchenQueueQuery,
  ): Promise<{
    tickets: KitchenTicket[];
    counts: { total: number; confirmed: number; preparing: number; ready: number };
    pagination: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    // Status filter
    let statusFilter:
      Prisma.EnumOrderStatusFilter | { in: ('PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY')[] } = {
      in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'],
    };

    if (query.status && query.status !== 'ALL_ACTIVE') {
      statusFilter = { equals: query.status as 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' };
    }

    // Category IDs filter if stationId or categoryId is specified
    let targetCategoryIds: string[] | undefined = undefined;
    if (query.stationId) {
      const stationCategories = await prisma.categoryKitchenStation.findMany({
        where: { stationId: query.stationId },
        select: { categoryId: true },
      });
      targetCategoryIds = stationCategories.map((sc) => sc.categoryId);
    } else if (query.categoryId) {
      targetCategoryIds = [query.categoryId];
    }

    const where: Prisma.OrderWhereInput = {
      restaurantId,
      status: statusFilter,
    };

    if (query.orderType) {
      where.orderType = query.orderType;
    }

    if (query.search) {
      where.OR = [
        { orderCode: { contains: query.search.trim(), mode: 'insensitive' } },
        { customerName: { contains: query.search.trim(), mode: 'insensitive' } },
        { customerPhone: { contains: query.search.trim(), mode: 'insensitive' } },
        { table: { name: { contains: query.search.trim(), mode: 'insensitive' } } },
      ];
    }

    if (targetCategoryIds !== undefined) {
      where.items = {
        some: {
          status: 'ACTIVE',
          menuItem: { categoryId: { in: targetCategoryIds } },
        },
      };
    }

    const [total, orders, statusCounts] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'asc' }],
        include: {
          table: {
            select: {
              name: true,
              zone: { select: { name: true } },
            },
          },
          items: {
            where: { status: 'ACTIVE' },
            include: {
              modifiers: true,
              station: { select: { name: true } },
              menuItem: { select: { categoryId: true } },
            },
          },
        },
      }),
      prisma.order.groupBy({
        by: ['status'],
        where: {
          restaurantId,
          status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] },
        },
        _count: { status: true },
      }),
    ]);

    const counts = {
      total: 0,
      pending: 0,
      confirmed: 0,
      preparing: 0,
      ready: 0,
    };

    for (const group of statusCounts) {
      if (group.status === 'PENDING') counts.pending = group._count.status;
      if (group.status === 'CONFIRMED') counts.confirmed = group._count.status;
      if (group.status === 'PREPARING') counts.preparing = group._count.status;
      if (group.status === 'READY') counts.ready = group._count.status;
      counts.total += group._count.status;
    }

    const now = new Date();
    const tickets = orders.map((o) =>
      this.formatTicket(o as unknown as Record<string, unknown>, now),
    );

    return {
      tickets,
      counts,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 2. Get Single Kitchen Ticket Details.
   */
  public static async getKitchenOrderById(
    restaurantId: string,
    orderId: string,
  ): Promise<KitchenTicket> {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: {
        table: {
          select: {
            name: true,
            zone: { select: { name: true } },
          },
        },
        items: {
          where: { status: 'ACTIVE' },
          include: {
            modifiers: true,
            station: { select: { name: true } },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundError(`Order with ID ${orderId} not found`);
    }

    return this.formatTicket(order as unknown as Record<string, unknown>);
  }

  /**
   * 3. Bump Order Status from Kitchen Bump Bar (PREPARING -> READY -> SERVED).
   */
  public static async updateOrderKitchenStatus(
    restaurantId: string,
    orderId: string,
    input: UpdateOrderKitchenStatusInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ): Promise<KitchenTicket> {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: { items: { where: { status: 'ACTIVE' } } },
    });

    if (!order) {
      throw new NotFoundError(`Order with ID ${orderId} not found`);
    }

    if (order.status === 'CANCELLED' || order.status === 'VOIDED') {
      throw new BadRequestError(`Cannot bump order that is already ${order.status}`);
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update items in cascade
      if (input.status === 'PREPARING') {
        await tx.orderItem.updateMany({
          where: {
            orderId,
            status: 'ACTIVE',
            kitchenStatus: 'PENDING',
          },
          data: { kitchenStatus: 'PREPARING' },
        });
      } else if (input.status === 'READY') {
        await tx.orderItem.updateMany({
          where: {
            orderId,
            status: 'ACTIVE',
            kitchenStatus: { in: ['PENDING', 'PREPARING'] },
          },
          data: {
            kitchenStatus: 'READY',
            preparedAt: now,
          },
        });
      } else if (input.status === 'SERVED') {
        await tx.orderItem.updateMany({
          where: {
            orderId,
            status: 'ACTIVE',
            kitchenStatus: { not: 'SERVED' },
          },
          data: {
            kitchenStatus: 'SERVED',
            preparedAt: now,
          },
        });
      }

      // 2. Update Order Status
      return tx.order.update({
        where: { id: orderId },
        data: {
          status: input.status,
        },
        include: {
          table: {
            select: {
              name: true,
              zone: { select: { name: true } },
            },
          },
          items: {
            where: { status: 'ACTIVE' },
            include: {
              modifiers: true,
              station: { select: { name: true } },
            },
          },
        },
      });
    });

    // Audit Logging
    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'KITCHEN_ORDER_BUMPED',
      entityType: 'ORDER',
      entityId: orderId,
      metadata: {
        orderCode: order.orderCode,
        fromStatus: order.status,
        toStatus: input.status,
      },
      ipAddress: ipAddress ?? undefined,
    });

    const ticket = this.formatTicket(updated as unknown as Record<string, unknown>, now);

    // Real-time broadcasting
    RealtimeService.emitToRestaurant(restaurantId, 'kitchen:order_bumped', {
      orderId,
      orderCode: order.orderCode,
      status: input.status,
      ticket,
    });
    RealtimeService.emitToRestaurant(restaurantId, 'order:status_changed', {
      orderId,
      status: input.status,
    });

    return ticket;
  }

  /**
   * 4. Bump Individual Item Status (PENDING -> PREPARING -> READY -> SERVED).
   */
  public static async updateItemKitchenStatus(
    restaurantId: string,
    orderId: string,
    itemId: string,
    input: UpdateItemKitchenStatusInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ): Promise<KitchenTicket> {
    const item = await prisma.orderItem.findFirst({
      where: {
        id: itemId,
        orderId,
        order: { restaurantId },
      },
      include: { order: true },
    });

    if (!item) {
      throw new NotFoundError(`Order item with ID ${itemId} not found`);
    }

    if (item.status === 'VOIDED') {
      throw new BadRequestError('Cannot update status of a voided item');
    }

    const now = new Date();

    const updatedOrder = await prisma.$transaction(async (tx) => {
      // 1. Update Item Status
      await tx.orderItem.update({
        where: { id: itemId },
        data: {
          kitchenStatus: input.status,
          preparedAt: input.status === 'READY' || input.status === 'SERVED' ? now : item.preparedAt,
          kitchenNotes: input.kitchenNotes !== undefined ? input.kitchenNotes : item.kitchenNotes,
        },
      });

      // 2. Automated Order State Synchronization
      let newOrderStatus: 'CONFIRMED' | 'PREPARING' | 'READY' | 'SERVED' | undefined = undefined;

      const activeItems = await tx.orderItem.findMany({
        where: { orderId, status: 'ACTIVE' },
      });

      const allReady =
        activeItems.length > 0 &&
        activeItems.every((i) =>
          i.id === itemId
            ? input.status === 'READY' || input.status === 'SERVED'
            : i.kitchenStatus === 'READY' || i.kitchenStatus === 'SERVED',
        );
      const anyPreparing = activeItems.some((i) =>
        i.id === itemId ? input.status === 'PREPARING' : i.kitchenStatus === 'PREPARING',
      );

      if (allReady && item.order.status !== 'READY' && item.order.status !== 'SERVED') {
        newOrderStatus = 'READY';
      } else if (
        anyPreparing &&
        (item.order.status === 'CONFIRMED' || item.order.status === 'PENDING')
      ) {
        newOrderStatus = 'PREPARING';
      }

      if (newOrderStatus) {
        return tx.order.update({
          where: { id: orderId },
          data: { status: newOrderStatus },
          include: {
            table: {
              select: {
                name: true,
                zone: { select: { name: true } },
              },
            },
            items: {
              where: { status: 'ACTIVE' },
              include: {
                modifiers: true,
                station: { select: { name: true } },
              },
            },
          },
        });
      }

      return tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          table: {
            select: {
              name: true,
              zone: { select: { name: true } },
            },
          },
          items: {
            where: { status: 'ACTIVE' },
            include: {
              modifiers: true,
              station: { select: { name: true } },
            },
          },
        },
      });
    });

    // Audit Logging
    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'KITCHEN_ITEM_BUMPED',
      entityType: 'ORDER_ITEM',
      entityId: itemId,
      metadata: {
        orderId,
        orderCode: item.order.orderCode,
        itemName: item.itemName,
        fromStatus: item.kitchenStatus,
        toStatus: input.status,
      },
      ipAddress: ipAddress ?? undefined,
    });

    const ticket = this.formatTicket(updatedOrder as unknown as Record<string, unknown>, now);

    // Real-time broadcasting
    RealtimeService.emitToRestaurant(restaurantId, 'kitchen:item_bumped', {
      orderId,
      itemId,
      kitchenStatus: input.status,
      ticket,
    });

    return ticket;
  }

  /**
   * 5. Recall Bumped Order (Revert back to PREPARING).
   */
  public static async recallOrder(
    restaurantId: string,
    orderId: string,
    input: RecallInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ): Promise<KitchenTicket> {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
    });

    if (!order) {
      throw new NotFoundError(`Order with ID ${orderId} not found`);
    }

    if (order.status !== 'READY' && order.status !== 'SERVED' && order.status !== 'COMPLETED') {
      throw new BadRequestError(`Cannot recall order with status ${order.status}`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.orderItem.updateMany({
        where: {
          orderId,
          status: 'ACTIVE',
          kitchenStatus: { in: ['READY', 'SERVED'] },
        },
        data: {
          kitchenStatus: 'PREPARING',
        },
      });

      return tx.order.update({
        where: { id: orderId },
        data: { status: 'PREPARING' },
        include: {
          table: {
            select: {
              name: true,
              zone: { select: { name: true } },
            },
          },
          items: {
            where: { status: 'ACTIVE' },
            include: {
              modifiers: true,
              station: { select: { name: true } },
            },
          },
        },
      });
    });

    // Audit Logging
    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'KITCHEN_ORDER_RECALLED',
      entityType: 'ORDER',
      entityId: orderId,
      metadata: {
        orderCode: order.orderCode,
        reason: input.reason,
      },
      ipAddress: ipAddress ?? undefined,
    });

    const ticket = this.formatTicket(updated as unknown as Record<string, unknown>);

    RealtimeService.emitToRestaurant(restaurantId, 'kitchen:order_recalled', {
      orderId,
      ticket,
    });
    RealtimeService.emitToRestaurant(restaurantId, 'order:status_changed', {
      orderId,
      status: 'PREPARING',
    });

    return ticket;
  }

  /**
   * 6. Recall Bumped Item (Revert back to PREPARING).
   */
  public static async recallItem(
    restaurantId: string,
    orderId: string,
    itemId: string,
    input: RecallInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ): Promise<KitchenTicket> {
    const item = await prisma.orderItem.findFirst({
      where: { id: itemId, orderId, order: { restaurantId } },
      include: { order: true },
    });

    if (!item) {
      throw new NotFoundError(`Order item with ID ${itemId} not found`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.orderItem.update({
        where: { id: itemId },
        data: { kitchenStatus: 'PREPARING' },
      });

      // If order was READY or SERVED, revert to PREPARING
      if (item.order.status === 'READY' || item.order.status === 'SERVED') {
        return tx.order.update({
          where: { id: orderId },
          data: { status: 'PREPARING' },
          include: {
            table: {
              select: {
                name: true,
                zone: { select: { name: true } },
              },
            },
            items: {
              where: { status: 'ACTIVE' },
              include: {
                modifiers: true,
                station: { select: { name: true } },
              },
            },
          },
        });
      }

      return tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          table: {
            select: {
              name: true,
              zone: { select: { name: true } },
            },
          },
          items: {
            where: { status: 'ACTIVE' },
            include: {
              modifiers: true,
              station: { select: { name: true } },
            },
          },
        },
      });
    });

    // Audit Logging
    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'KITCHEN_ITEM_RECALLED',
      entityType: 'ORDER_ITEM',
      entityId: itemId,
      metadata: {
        orderId,
        itemName: item.itemName,
        reason: input.reason,
      },
      ipAddress: ipAddress ?? undefined,
    });

    const ticket = this.formatTicket(updated as unknown as Record<string, unknown>);

    RealtimeService.emitToRestaurant(restaurantId, 'kitchen:item_recalled', {
      orderId,
      itemId,
      ticket,
    });

    return ticket;
  }

  /**
   * 7. Kitchen Performance Analytics & Metrics.
   */
  public static async getKitchenPerformance(restaurantId: string): Promise<{
    activeTicketsCount: number;
    preparingTicketsCount: number;
    readyTicketsCount: number;
    delayedTicketsCount: number;
    completedTicketsToday: number;
    avgPrepTimeMinutes: number;
  }> {
    const today = new Date().toISOString().split('T')[0]!;
    const now = new Date();

    const [activeOrders, todayCompletedOrders] = await Promise.all([
      prisma.order.findMany({
        where: {
          restaurantId,
          status: { in: ['CONFIRMED', 'PREPARING', 'READY'] },
        },
        select: {
          id: true,
          status: true,
          createdAt: true,
        },
      }),
      prisma.order.findMany({
        where: {
          restaurantId,
          businessDate: today,
          status: { in: ['SERVED', 'COMPLETED'] },
        },
        select: {
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    let preparingCount = 0;
    let readyCount = 0;
    let delayedCount = 0;

    for (const order of activeOrders) {
      if (order.status === 'PREPARING') preparingCount++;
      if (order.status === 'READY') readyCount++;

      const elapsedMinutes = Math.floor(
        (now.getTime() - new Date(order.createdAt).getTime()) / 60000,
      );
      if (elapsedMinutes >= 15) delayedCount++;
    }

    let totalPrepSeconds = 0;
    for (const o of todayCompletedOrders) {
      const durationSeconds = Math.max(
        0,
        Math.floor((new Date(o.updatedAt).getTime() - new Date(o.createdAt).getTime()) / 1000),
      );
      totalPrepSeconds += durationSeconds;
    }

    const avgPrepMinutes =
      todayCompletedOrders.length > 0
        ? Number((totalPrepSeconds / todayCompletedOrders.length / 60).toFixed(1))
        : 0;

    return {
      activeTicketsCount: activeOrders.length,
      preparingTicketsCount: preparingCount,
      readyTicketsCount: readyCount,
      delayedTicketsCount: delayedCount,
      completedTicketsToday: todayCompletedOrders.length,
      avgPrepTimeMinutes: avgPrepMinutes,
    };
  }
}
