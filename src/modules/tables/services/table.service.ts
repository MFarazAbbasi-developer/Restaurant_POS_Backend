import { prisma } from '../../../config/database.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../../common/errors/app-error.js';
import { AuditService } from '../../../common/services/audit.service.js';
import { RealtimeService } from '../../../common/services/realtime.service.js';
import type {
  CreateTableInput,
  ListTablesQueryInput,
  MergeTablesInput,
  TableStatusType,
  TransferTableInput,
  UpdateTableInput,
} from '../tables.schema.js';
import type { AuthenticatedUserContext } from '../../../common/types/express.js';
import type { Prisma } from '@prisma/client';

export class TableService {
  /**
   * Lists tables with optional zone, status, active filters and search.
   */
  public static async listTables(restaurantId: string, query: ListTablesQueryInput) {
    const whereClause: Prisma.RestaurantTableWhereInput = {
      restaurantId,
      ...(query.zoneId && { zoneId: query.zoneId }),
      ...(query.status && { status: query.status }),
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.search && {
        name: { contains: query.search, mode: 'insensitive' },
      }),
    };

    const tables = await prisma.restaurantTable.findMany({
      where: whereClause,
      include: {
        zone: {
          select: {
            id: true,
            name: true,
            sortOrder: true,
          },
        },
        mergedIntoTable: {
          select: {
            id: true,
            name: true,
          },
        },
        mergedTables: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
        tableOrders: {
          where: {
            status: { in: ['ACTIVE', 'BILL_PRINTED'] },
          },
          select: {
            id: true,
            orderCode: true,
            subBillName: true,
            guestCount: true,
            status: true,
            totalAmount: true,
            openedAt: true,
          },
        },
        orders: {
          where: {
            paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] },
            status: { notIn: ['CANCELLED', 'VOIDED'] },
          },
          select: {
            id: true,
            orderCode: true,
            guestCount: true,
            status: true,
            grandTotal: true,
            createdAt: true,
            tableOrderId: true,
            items: {
              where: { status: 'ACTIVE' },
              select: {
                id: true,
                itemName: true,
                quantity: true,
                unitPrice: true,
                kitchenStatus: true,
              },
            },
          },
        },
      },
      orderBy: [{ zone: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    });

    return tables.map((t) => {
      const subBillOrders = t.tableOrders.map((o) => ({
        id: o.id,
        orderCode: o.orderCode,
        subBillName: o.subBillName,
        guestCount: o.guestCount,
        status: o.status,
        totalAmount: o.totalAmount.toNumber(),
        openedAt: o.openedAt,
        items: [],
      }));

      const directOrders = (t.orders || [])
        .filter((ord) => !ord.tableOrderId)
        .map((ord) => ({
          id: ord.id,
          orderCode: ord.orderCode,
          subBillName: `Order #${ord.orderCode} (${ord.status})`,
          guestCount: ord.guestCount ?? 1,
          status: ord.status,
          totalAmount: ord.grandTotal.toNumber(),
          openedAt: ord.createdAt,
          items: ord.items.map((it) => ({
            id: it.id,
            itemName: it.itemName,
            quantity: it.quantity,
            unitPrice: it.unitPrice.toNumber(),
            kitchenStatus: it.kitchenStatus,
          })),
        }));

      const activeOrders = [...subBillOrders, ...directOrders];

      return {
        ...t,
        activeOrdersCount: activeOrders.length,
        activeOrders,
        isMerged: t.mergedIntoTableId !== null || t.mergedTables.length > 0,
      };
    });
  }

  /**
   * Retrieves high-performance POS floor layout payload organized by zones.
   */
  public static async getPosFloorView(restaurantId: string) {
    const zones = await prisma.zone.findMany({
      where: {
        restaurantId,
        isActive: true,
      },
      orderBy: {
        sortOrder: 'asc',
      },
      include: {
        tables: {
          where: {
            isActive: true,
          },
          orderBy: {
            sortOrder: 'asc',
          },
          include: {
            mergedIntoTable: {
              select: { id: true, name: true },
            },
            mergedTables: {
              select: { id: true, name: true, status: true },
            },
            tableOrders: {
              where: {
                status: { in: ['ACTIVE', 'BILL_PRINTED'] },
              },
              select: {
                id: true,
                orderCode: true,
                subBillName: true,
                guestCount: true,
                status: true,
                totalAmount: true,
                openedAt: true,
              },
            },
            orders: {
              where: {
                paymentStatus: { in: ['UNPAID', 'PARTIALLY_PAID'] },
                status: { notIn: ['CANCELLED', 'VOIDED'] },
              },
              select: {
                id: true,
                orderCode: true,
                guestCount: true,
                status: true,
                grandTotal: true,
                createdAt: true,
                tableOrderId: true,
                items: {
                  where: { status: 'ACTIVE' },
                  select: {
                    id: true,
                    itemName: true,
                    quantity: true,
                    unitPrice: true,
                    kitchenStatus: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    let totalTablesCount = 0;
    let occupiedTablesCount = 0;
    let availableTablesCount = 0;
    let totalGuestsSeated = 0;

    const formattedZones = zones.map((zone) => {
      let zoneOccupiedCount = 0;
      let zoneAvailableCount = 0;
      let zoneGuestsCount = 0;

      const tables = zone.tables.map((table) => {
        totalTablesCount++;

        const subBillOrders = table.tableOrders.map((o) => ({
          id: o.id,
          orderCode: o.orderCode,
          subBillName: o.subBillName,
          guestCount: o.guestCount,
          status: o.status,
          totalAmount: o.totalAmount.toNumber(),
          openedAt: o.openedAt,
          items: [],
        }));

        const directOrders = (table.orders || [])
          .filter((ord) => !ord.tableOrderId)
          .map((ord) => ({
            id: ord.id,
            orderCode: ord.orderCode,
            subBillName: `Order #${ord.orderCode} (${ord.status})`,
            guestCount: ord.guestCount ?? 1,
            status: ord.status,
            totalAmount: ord.grandTotal.toNumber(),
            openedAt: ord.createdAt,
            items: ord.items.map((it) => ({
              id: it.id,
              itemName: it.itemName,
              quantity: it.quantity,
              unitPrice: it.unitPrice.toNumber(),
              kitchenStatus: it.kitchenStatus,
            })),
          }));

        const activeOrders = [...subBillOrders, ...directOrders];

        const tableGuests = activeOrders.reduce((sum, ord) => sum + ord.guestCount, 0);
        zoneGuestsCount += tableGuests;
        totalGuestsSeated += tableGuests;

        const effectiveStatus =
          table.status === 'AVAILABLE' && activeOrders.length > 0
            ? 'OCCUPIED'
            : table.status;

        if (effectiveStatus === 'OCCUPIED' || effectiveStatus === 'BILL_PRINTED') {
          zoneOccupiedCount++;
          occupiedTablesCount++;
        } else if (effectiveStatus === 'AVAILABLE') {
          zoneAvailableCount++;
          availableTablesCount++;
        }

        return {
          id: table.id,
          name: table.name,
          capacity: table.capacity,
          sortOrder: table.sortOrder,
          status: effectiveStatus,
          mergedIntoTableId: table.mergedIntoTableId,
          mergedIntoTable: table.mergedIntoTable,
          mergedTables: table.mergedTables,
          isMerged: table.mergedIntoTableId !== null || table.mergedTables.length > 0,
          activeOrdersCount: activeOrders.length,
          activeOrders,
        };
      });

      return {
        id: zone.id,
        name: zone.name,
        description: zone.description,
        sortOrder: zone.sortOrder,
        totalTables: tables.length,
        occupiedTables: zoneOccupiedCount,
        availableTables: zoneAvailableCount,
        totalGuests: zoneGuestsCount,
        tables,
      };
    });

    return {
      restaurantId,
      summary: {
        totalZones: zones.length,
        totalTables: totalTablesCount,
        occupiedTables: occupiedTablesCount,
        availableTables: availableTablesCount,
        totalGuestsSeated,
      },
      zones: formattedZones,
    };
  }

  /**
   * Retrieves single table details by ID.
   */
  public static async getTableById(restaurantId: string, tableId: string) {
    const table = await prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId },
      include: {
        zone: true,
        mergedIntoTable: {
          select: { id: true, name: true },
        },
        mergedTables: {
          select: { id: true, name: true, status: true },
        },
        tableOrders: {
          orderBy: { openedAt: 'desc' },
          include: {
            openedByUser: {
              select: { id: true, name: true, username: true },
            },
          },
        },
      },
    });

    if (!table) {
      throw new NotFoundError('Table not found in this restaurant');
    }

    return {
      ...table,
      tableOrders: table.tableOrders.map((o) => ({
        ...o,
        totalAmount: o.totalAmount.toNumber(),
      })),
      isMerged: table.mergedIntoTableId !== null || table.mergedTables.length > 0,
    };
  }

  /**
   * Creates a new table.
   */
  public static async createTable(
    restaurantId: string,
    input: CreateTableInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    // 1. Verify zone belongs to same restaurant
    const zone = await prisma.zone.findFirst({
      where: { id: input.zoneId, restaurantId },
    });

    if (!zone) {
      throw new BadRequestError('Seating zone does not exist in this restaurant');
    }

    // 2. Check table name uniqueness in restaurant
    const existing = await prisma.restaurantTable.findUnique({
      where: {
        restaurantId_name: {
          restaurantId,
          name: input.name,
        },
      },
    });

    if (existing) {
      throw new ConflictError(`Table '${input.name}' already exists in this restaurant`);
    }

    const table = await prisma.restaurantTable.create({
      data: {
        restaurantId,
        zoneId: input.zoneId,
        name: input.name,
        capacity: input.capacity,
        sortOrder: input.sortOrder ?? 0,
        status: 'AVAILABLE',
        isActive: input.isActive ?? true,
      },
      include: {
        zone: true,
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'TABLE_CREATED',
      entityType: 'TABLE',
      entityId: table.id,
      metadata: {
        name: table.name,
        zoneId: table.zoneId,
        capacity: table.capacity,
      },
      ipAddress: ipAddress ?? null,
    });

    RealtimeService.emitToRestaurant(restaurantId, 'table:created', {
      tableId: table.id,
      name: table.name,
      zoneId: table.zoneId,
      status: table.status,
    });

    return table;
  }

  /**
   * Updates an existing table.
   */
  public static async updateTable(
    restaurantId: string,
    tableId: string,
    input: UpdateTableInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const existing = await prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId },
    });

    if (!existing) {
      throw new NotFoundError('Table not found in this restaurant');
    }

    if (input.zoneId) {
      const zone = await prisma.zone.findFirst({
        where: { id: input.zoneId, restaurantId },
      });
      if (!zone) {
        throw new BadRequestError('Seating zone does not exist in this restaurant');
      }
    }

    if (input.name && input.name !== existing.name) {
      const conflict = await prisma.restaurantTable.findUnique({
        where: {
          restaurantId_name: {
            restaurantId,
            name: input.name,
          },
        },
      });
      if (conflict) {
        throw new ConflictError(`Table '${input.name}' already exists in this restaurant`);
      }
    }

    const updated = await prisma.restaurantTable.update({
      where: { id: tableId },
      data: {
        ...(input.zoneId !== undefined && { zoneId: input.zoneId }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.capacity !== undefined && { capacity: input.capacity }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      },
      include: {
        zone: true,
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'TABLE_UPDATED',
      entityType: 'TABLE',
      entityId: tableId,
      metadata: {
        previous: { name: existing.name, capacity: existing.capacity, zoneId: existing.zoneId },
        changes: input,
      },
      ipAddress: ipAddress ?? null,
    });

    RealtimeService.emitToRestaurant(restaurantId, 'table:updated', {
      tableId: updated.id,
      name: updated.name,
      zoneId: updated.zoneId,
    });

    return updated;
  }

  /**
   * Updates table operational status with table release protection.
   */
  public static async updateTableStatus(
    restaurantId: string,
    tableId: string,
    status: TableStatusType,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const table = await prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId },
      include: {
        tableOrders: {
          where: {
            status: { in: ['ACTIVE', 'BILL_PRINTED'] },
          },
        },
        mergedIntoTable: {
          include: {
            tableOrders: {
              where: { status: { in: ['ACTIVE', 'BILL_PRINTED'] } },
            },
          },
        },
      },
    });

    if (!table) {
      throw new NotFoundError('Table not found in this restaurant');
    }

    // Table Release Protection:
    // A table CANNOT transition to AVAILABLE while active orders remain open.
    if (status === 'AVAILABLE') {
      if (table.tableOrders.length > 0) {
        throw new ConflictError(
          `Cannot release table '${table.name}': ${table.tableOrders.length} active order(s)/sub-bill(s) remain open. Settle or transfer orders first.`,
        );
      }

      if (table.mergedIntoTable && table.mergedIntoTable.tableOrders.length > 0) {
        throw new ConflictError(
          `Cannot release table '${table.name}': Table is merged into '${table.mergedIntoTable.name}' which still has open orders.`,
        );
      }
    }

    const updated = await prisma.restaurantTable.update({
      where: { id: tableId },
      data: { status },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'TABLE_STATUS_CHANGED',
      entityType: 'TABLE',
      entityId: tableId,
      metadata: {
        tableName: table.name,
        previousStatus: table.status,
        newStatus: status,
      },
      ipAddress: ipAddress ?? null,
    });

    RealtimeService.emitToRestaurant(restaurantId, 'table:status_changed', {
      tableId,
      tableName: table.name,
      previousStatus: table.status,
      status,
    });

    return updated;
  }

  /**
   * Transfers active table context & orders atomically from one table to another.
   */
  public static async transferTable(
    restaurantId: string,
    input: TransferTableInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const [fromTable, toTable] = await Promise.all([
      prisma.restaurantTable.findFirst({
        where: { id: input.fromTableId, restaurantId },
        include: {
          tableOrders: {
            where: { status: { in: ['ACTIVE', 'BILL_PRINTED'] } },
          },
        },
      }),
      prisma.restaurantTable.findFirst({
        where: { id: input.toTableId, restaurantId },
      }),
    ]);

    if (!fromTable) {
      throw new NotFoundError('Source table not found in this restaurant');
    }

    if (!toTable) {
      throw new NotFoundError('Destination table not found in this restaurant');
    }

    if (fromTable.tableOrders.length === 0 && fromTable.status === 'AVAILABLE') {
      throw new BadRequestError('Source table has no active orders or occupancy to transfer');
    }

    const targetStatus =
      input.targetStatus ?? (fromTable.status === 'BILL_PRINTED' ? 'BILL_PRINTED' : 'OCCUPIED');

    const result = await prisma.$transaction(async (tx) => {
      // 1. Move all active table orders to destination table
      const updatedOrders = await tx.tableOrder.updateMany({
        where: {
          tableId: fromTable.id,
          status: { in: ['ACTIVE', 'BILL_PRINTED'] },
        },
        data: {
          tableId: toTable.id,
        },
      });

      // 2. Set source table to AVAILABLE (or CLEANING)
      const updatedFrom = await tx.restaurantTable.update({
        where: { id: fromTable.id },
        data: {
          status: 'AVAILABLE',
          mergedIntoTableId: null,
        },
      });

      // 3. Set destination table to OCCUPIED / BILL_PRINTED
      const updatedTo = await tx.restaurantTable.update({
        where: { id: toTable.id },
        data: {
          status: targetStatus,
        },
      });

      return {
        fromTable: updatedFrom,
        toTable: updatedTo,
        transferredOrdersCount: updatedOrders.count,
      };
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'TABLE_TRANSFERRED',
      entityType: 'TABLE',
      entityId: toTable.id,
      metadata: {
        fromTableId: fromTable.id,
        fromTableName: fromTable.name,
        toTableId: toTable.id,
        toTableName: toTable.name,
        transferredOrdersCount: result.transferredOrdersCount,
      },
      ipAddress: ipAddress ?? null,
    });

    RealtimeService.emitToRestaurant(restaurantId, 'table:transferred', {
      fromTableId: fromTable.id,
      fromTableName: fromTable.name,
      toTableId: toTable.id,
      toTableName: toTable.name,
      transferredOrdersCount: result.transferredOrdersCount,
      fromTableStatus: result.fromTable.status,
      toTableStatus: result.toTable.status,
    });

    return result;
  }

  /**
   * Merges multiple secondary tables into a primary table under a shared bill/session.
   */
  public static async mergeTables(
    restaurantId: string,
    input: MergeTablesInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const allTableIds = [input.primaryTableId, ...input.secondaryTableIds];

    const tables = await prisma.restaurantTable.findMany({
      where: {
        id: { in: allTableIds },
        restaurantId,
      },
    });

    if (tables.length !== allTableIds.length) {
      throw new BadRequestError('One or more tables do not exist in this restaurant');
    }

    const primaryTable = tables.find((t) => t.id === input.primaryTableId)!;
    const secondaryTables = tables.filter((t) => t.id !== input.primaryTableId);

    // Validate that none of the secondary tables are already primary for other tables
    const alreadyMergedCount = await prisma.restaurantTable.count({
      where: {
        mergedIntoTableId: { in: input.secondaryTableIds },
      },
    });

    if (alreadyMergedCount > 0) {
      throw new ConflictError(
        'One or more secondary tables are already acting as primary merged tables',
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Set primary table to OCCUPIED
      const updatedPrimary = await tx.restaurantTable.update({
        where: { id: primaryTable.id },
        data: {
          status: primaryTable.status === 'BILL_PRINTED' ? 'BILL_PRINTED' : 'OCCUPIED',
          mergedIntoTableId: null,
        },
      });

      // 2. Link secondary tables to primary table and set status to OCCUPIED
      await tx.restaurantTable.updateMany({
        where: { id: { in: input.secondaryTableIds } },
        data: {
          mergedIntoTableId: primaryTable.id,
          status: 'OCCUPIED',
        },
      });

      // 3. Consolidate any active orders on secondary tables to primary table
      await tx.tableOrder.updateMany({
        where: {
          tableId: { in: input.secondaryTableIds },
          status: { in: ['ACTIVE', 'BILL_PRINTED'] },
        },
        data: {
          tableId: primaryTable.id,
        },
      });

      return {
        primaryTable: updatedPrimary,
        mergedTableIds: input.secondaryTableIds,
      };
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'TABLES_MERGED',
      entityType: 'TABLE',
      entityId: primaryTable.id,
      metadata: {
        primaryTableName: primaryTable.name,
        secondaryTableIds: input.secondaryTableIds,
        secondaryTableNames: secondaryTables.map((t) => t.name),
      },
      ipAddress: ipAddress ?? null,
    });

    RealtimeService.emitToRestaurant(restaurantId, 'table:merged', {
      primaryTableId: primaryTable.id,
      primaryTableName: primaryTable.name,
      secondaryTableIds: input.secondaryTableIds,
    });

    return result;
  }

  /**
   * Unmerges a table or all secondary tables linked to a primary table.
   */
  public static async unmergeTable(
    restaurantId: string,
    tableId: string,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const table = await prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId },
      include: {
        mergedTables: true,
      },
    });

    if (!table) {
      throw new NotFoundError('Table not found in this restaurant');
    }

    if (table.mergedIntoTableId === null && table.mergedTables.length === 0) {
      throw new BadRequestError('Table is not part of any merged table group');
    }

    await prisma.$transaction(async (tx) => {
      if (table.mergedIntoTableId !== null) {
        // Unmerge this single secondary table
        await tx.restaurantTable.update({
          where: { id: table.id },
          data: {
            mergedIntoTableId: null,
            status: 'AVAILABLE',
          },
        });
      } else if (table.mergedTables.length > 0) {
        // Unmerge all secondary tables attached to this primary table
        await tx.restaurantTable.updateMany({
          where: { mergedIntoTableId: table.id },
          data: {
            mergedIntoTableId: null,
            status: 'AVAILABLE',
          },
        });
      }
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'TABLES_UNMERGED',
      entityType: 'TABLE',
      entityId: tableId,
      metadata: {
        tableName: table.name,
      },
      ipAddress: ipAddress ?? null,
    });

    RealtimeService.emitToRestaurant(restaurantId, 'table:unmerged', {
      tableId,
      tableName: table.name,
    });

    return { id: tableId, unmerged: true };
  }

  /**
   * Deletes a table if no active orders or merge constraints exist.
   */
  public static async deleteTable(
    restaurantId: string,
    tableId: string,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const table = await prisma.restaurantTable.findFirst({
      where: { id: tableId, restaurantId },
      include: {
        tableOrders: {
          where: { status: { in: ['ACTIVE', 'BILL_PRINTED'] } },
        },
        mergedTables: true,
      },
    });

    if (!table) {
      throw new NotFoundError('Table not found in this restaurant');
    }

    if (table.tableOrders.length > 0) {
      throw new BadRequestError(
        'Cannot delete table with active orders. Close or transfer orders first.',
      );
    }

    if (table.mergedTables.length > 0) {
      throw new BadRequestError(
        'Cannot delete table that has secondary tables merged into it. Unmerge first.',
      );
    }

    await prisma.restaurantTable.delete({
      where: { id: tableId },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'TABLE_DELETED',
      entityType: 'TABLE',
      entityId: tableId,
      metadata: {
        name: table.name,
      },
      ipAddress: ipAddress ?? null,
    });

    RealtimeService.emitToRestaurant(restaurantId, 'table:deleted', {
      tableId,
      name: table.name,
    });

    return { id: tableId, deleted: true };
  }
}
