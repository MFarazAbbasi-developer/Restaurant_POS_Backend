import { prisma } from '../../../config/database.js';
import { NotFoundError } from '../../../common/errors/app-error.js';
import { AuditService } from '../../../common/services/audit.service.js';
import { RealtimeService } from '../../../common/services/realtime.service.js';
import type { CreateTableOrderInput, TableOrderStatusType } from '../tables.schema.js';
import type { AuthenticatedUserContext } from '../../../common/types/express.js';

export class TableOrderService {
  /**
   * Opens a new sub-bill / order context on a table.
   * If table was AVAILABLE, automatically transitions table to OCCUPIED.
   */
  public static async createTableOrder(
    restaurantId: string,
    tableId: string,
    input: CreateTableOrderInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const table = await prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId },
    });

    if (!table) {
      throw new NotFoundError('Table not found in this restaurant');
    }

    const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderCode = `ORD-${datePrefix}-${randomSuffix}`;

    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.tableOrder.create({
        data: {
          restaurantId,
          tableId,
          orderCode,
          subBillName: input.subBillName ?? null,
          guestCount: input.guestCount ?? 1,
          status: 'ACTIVE',
          openedByUserId: actor.id,
          ...(input.notes ? { metadata: { notes: input.notes } } : {}),
        },
      });

      if (table.status === 'AVAILABLE' || table.status === 'CLEANING') {
        await tx.restaurantTable.update({
          where: { id: tableId },
          data: { status: 'OCCUPIED' },
        });
      }

      return newOrder;
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'TABLE_ORDER_CREATED',
      entityType: 'TABLE_ORDER',
      entityId: order.id,
      metadata: {
        tableId,
        tableName: table.name,
        orderCode: order.orderCode,
        guestCount: order.guestCount,
      },
      ipAddress: ipAddress ?? null,
    });

    RealtimeService.emitToRestaurant(restaurantId, 'table:order_created', {
      tableId,
      tableName: table.name,
      orderId: order.id,
      orderCode: order.orderCode,
      guestCount: order.guestCount,
    });

    if (table.status === 'AVAILABLE') {
      RealtimeService.emitToRestaurant(restaurantId, 'table:status_changed', {
        tableId,
        tableName: table.name,
        previousStatus: table.status,
        status: 'OCCUPIED',
      });
    }

    return {
      ...order,
      totalAmount: order.totalAmount.toNumber(),
    };
  }

  /**
   * Lists orders / sub-bills for a table.
   */
  public static async listTableOrders(
    restaurantId: string,
    tableId: string,
    activeOnly: boolean = false,
  ) {
    const table = await prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId },
    });

    if (!table) {
      throw new NotFoundError('Table not found in this restaurant');
    }

    const orders = await prisma.tableOrder.findMany({
      where: {
        tableId,
        restaurantId,
        ...(activeOnly && { status: { in: ['ACTIVE', 'BILL_PRINTED'] } }),
      },
      include: {
        openedByUser: {
          select: { id: true, name: true, username: true },
        },
      },
      orderBy: { openedAt: 'desc' },
    });

    return orders.map((o) => ({
      ...o,
      totalAmount: o.totalAmount.toNumber(),
    }));
  }

  /**
   * Updates status of a table order (e.g. BILL_PRINTED, CLOSED, CANCELLED).
   */
  public static async updateTableOrderStatus(
    restaurantId: string,
    tableId: string,
    orderId: string,
    status: TableOrderStatusType,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const order = await prisma.tableOrder.findFirst({
      where: { id: orderId, tableId, restaurantId },
      include: {
        table: true,
      },
    });

    if (!order) {
      throw new NotFoundError('Order not found on this table');
    }

    const isClosing = status === 'CLOSED' || status === 'CANCELLED';

    const updated = await prisma.tableOrder.update({
      where: { id: orderId },
      data: {
        status,
        ...(isClosing && { closedAt: new Date() }),
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'TABLE_ORDER_STATUS_CHANGED',
      entityType: 'TABLE_ORDER',
      entityId: orderId,
      metadata: {
        tableId,
        orderCode: order.orderCode,
        previousStatus: order.status,
        newStatus: status,
      },
      ipAddress: ipAddress ?? null,
    });

    RealtimeService.emitToRestaurant(restaurantId, 'table:order_status_changed', {
      tableId,
      orderId,
      orderCode: order.orderCode,
      previousStatus: order.status,
      status,
    });

    return {
      ...updated,
      totalAmount: updated.totalAmount.toNumber(),
    };
  }
}
