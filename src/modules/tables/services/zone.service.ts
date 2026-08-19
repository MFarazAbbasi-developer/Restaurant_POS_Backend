import { prisma } from '../../../config/database.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../../common/errors/app-error.js';
import { AuditService } from '../../../common/services/audit.service.js';
import type { CreateZoneInput, ReorderZonesInput, UpdateZoneInput } from '../tables.schema.js';
import type { AuthenticatedUserContext } from '../../../common/types/express.js';

export class ZoneService {
  /**
   * Lists all seating zones for the restaurant, ordered by sortOrder.
   */
  public static async listZones(restaurantId: string) {
    return prisma.zone.findMany({
      where: { restaurantId },
      include: {
        _count: {
          select: { tables: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Retrieves a single seating zone by ID.
   */
  public static async getZoneById(restaurantId: string, zoneId: string) {
    const zone = await prisma.zone.findFirst({
      where: { id: zoneId, restaurantId },
      include: {
        tables: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: { tables: true },
        },
      },
    });

    if (!zone) {
      throw new NotFoundError('Seating zone not found in this restaurant');
    }

    return zone;
  }

  /**
   * Creates a new seating zone / floor.
   */
  public static async createZone(
    restaurantId: string,
    input: CreateZoneInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const existing = await prisma.zone.findUnique({
      where: {
        restaurantId_name: {
          restaurantId,
          name: input.name,
        },
      },
    });

    if (existing) {
      throw new ConflictError(`Seating zone '${input.name}' already exists in this restaurant`);
    }

    const zone = await prisma.zone.create({
      data: {
        restaurantId,
        name: input.name,
        description: input.description ?? null,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'ZONE_CREATED',
      entityType: 'ZONE',
      entityId: zone.id,
      metadata: {
        name: zone.name,
        sortOrder: zone.sortOrder,
      },
      ipAddress: ipAddress ?? null,
    });

    return zone;
  }

  /**
   * Updates an existing seating zone.
   */
  public static async updateZone(
    restaurantId: string,
    zoneId: string,
    input: UpdateZoneInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const existing = await prisma.zone.findFirst({
      where: { id: zoneId, restaurantId },
    });

    if (!existing) {
      throw new NotFoundError('Seating zone not found in this restaurant');
    }

    if (input.name && input.name !== existing.name) {
      const conflict = await prisma.zone.findUnique({
        where: {
          restaurantId_name: {
            restaurantId,
            name: input.name,
          },
        },
      });

      if (conflict) {
        throw new ConflictError(`Seating zone '${input.name}' already exists in this restaurant`);
      }
    }

    const updated = await prisma.zone.update({
      where: { id: zoneId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'ZONE_UPDATED',
      entityType: 'ZONE',
      entityId: zoneId,
      metadata: {
        previous: { name: existing.name, description: existing.description },
        changes: input,
      },
      ipAddress: ipAddress ?? null,
    });

    return updated;
  }

  /**
   * Toggles the active status of a seating zone.
   */
  public static async updateZoneStatus(
    restaurantId: string,
    zoneId: string,
    isActive: boolean,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const existing = await prisma.zone.findFirst({
      where: { id: zoneId, restaurantId },
    });

    if (!existing) {
      throw new NotFoundError('Seating zone not found in this restaurant');
    }

    const updated = await prisma.zone.update({
      where: { id: zoneId },
      data: { isActive },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'ZONE_STATUS_CHANGED',
      entityType: 'ZONE',
      entityId: zoneId,
      metadata: {
        previousStatus: existing.isActive,
        newStatus: isActive,
      },
      ipAddress: ipAddress ?? null,
    });

    return updated;
  }

  /**
   * Reorders multiple zones atomically in a transaction.
   */
  public static async reorderZones(
    restaurantId: string,
    input: ReorderZonesInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const zoneIds = input.items.map((i) => i.id);

    const count = await prisma.zone.count({
      where: {
        id: { in: zoneIds },
        restaurantId,
      },
    });

    if (count !== zoneIds.length) {
      throw new BadRequestError('One or more zones do not exist in this restaurant');
    }

    await prisma.$transaction(
      input.items.map((item) =>
        prisma.zone.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'ZONE_UPDATED',
      entityType: 'ZONE',
      metadata: {
        event: 'REORDER_ZONES',
        reorderedCount: input.items.length,
      },
      ipAddress: ipAddress ?? null,
    });

    return this.listZones(restaurantId);
  }

  /**
   * Deletes a zone if no tables are associated with it.
   */
  public static async deleteZone(
    restaurantId: string,
    zoneId: string,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const existing = await prisma.zone.findFirst({
      where: { id: zoneId, restaurantId },
      include: {
        _count: {
          select: { tables: true },
        },
      },
    });

    if (!existing) {
      throw new NotFoundError('Seating zone not found in this restaurant');
    }

    if (existing._count.tables > 0) {
      throw new BadRequestError(
        'Cannot delete zone containing tables. Move or delete tables first.',
      );
    }

    await prisma.zone.delete({
      where: { id: zoneId },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'ZONE_DELETED',
      entityType: 'ZONE',
      entityId: zoneId,
      metadata: {
        name: existing.name,
      },
      ipAddress: ipAddress ?? null,
    });

    return { id: zoneId, deleted: true };
  }
}
