import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { NotFoundError, ConflictError } from '../../common/errors/app-error.js';
import { AuditService } from '../../common/services/audit.service.js';
import { CreateKitchenStationInput, UpdateKitchenStationInput } from './kitchen.schema.js';
import { AuthenticatedUserContext } from '../../common/types/index.js';

export class KitchenStationService {
  /**
   * 1. Create a new Kitchen Station with category mappings.
   */
  public static async createStation(
    restaurantId: string,
    input: CreateKitchenStationInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ): Promise<Record<string, unknown>> {
    // Check duplicate name within restaurant
    const existing = await prisma.kitchenStation.findFirst({
      where: {
        restaurantId,
        name: { equals: input.name.trim(), mode: 'insensitive' },
      },
    });

    if (existing) {
      throw new ConflictError(`Kitchen station "${input.name.trim()}" already exists`);
    }

    const station = await prisma.$transaction(async (tx) => {
      const newStation = await tx.kitchenStation.create({
        data: {
          restaurantId,
          name: input.name.trim(),
          code: input.code?.trim() || null,
          displayOrder: input.displayOrder ?? 0,
        },
      });

      if (input.categoryIds && input.categoryIds.length > 0) {
        await tx.categoryKitchenStation.createMany({
          data: input.categoryIds.map((categoryId) => ({
            stationId: newStation.id,
            categoryId,
          })),
          skipDuplicates: true,
        });
      }

      return tx.kitchenStation.findUnique({
        where: { id: newStation.id },
        include: {
          categories: {
            include: {
              category: { select: { id: true, name: true } },
            },
          },
        },
      });
    });

    // Audit Log
    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'KITCHEN_STATION_CREATED',
      entityType: 'KITCHEN_STATION',
      entityId: station?.id,
      metadata: { name: input.name, code: input.code },
      ipAddress,
    });

    return station as unknown as Record<string, unknown>;
  }

  /**
   * 2. List all Kitchen Stations for a restaurant.
   */
  public static async listStations(restaurantId: string): Promise<Record<string, unknown>[]> {
    const stations = await prisma.kitchenStation.findMany({
      where: { restaurantId },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        categories: {
          include: {
            category: { select: { id: true, name: true, sortOrder: true } },
          },
        },
      },
    });

    return stations as unknown as Record<string, unknown>[];
  }

  /**
   * 3. Get a Kitchen Station by ID.
   */
  public static async getStationById(
    restaurantId: string,
    id: string,
  ): Promise<Record<string, unknown>> {
    const station = await prisma.kitchenStation.findFirst({
      where: { id, restaurantId },
      include: {
        categories: {
          include: {
            category: { select: { id: true, name: true, sortOrder: true } },
          },
        },
      },
    });

    if (!station) {
      throw new NotFoundError(`Kitchen station with ID ${id} not found`);
    }

    return station as unknown as Record<string, unknown>;
  }

  /**
   * 4. Update Kitchen Station.
   */
  public static async updateStation(
    restaurantId: string,
    id: string,
    input: UpdateKitchenStationInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ): Promise<Record<string, unknown>> {
    const station = await prisma.kitchenStation.findFirst({
      where: { id, restaurantId },
    });

    if (!station) {
      throw new NotFoundError(`Kitchen station with ID ${id} not found`);
    }

    if (input.name && input.name.trim().toLowerCase() !== station.name.toLowerCase()) {
      const duplicate = await prisma.kitchenStation.findFirst({
        where: {
          restaurantId,
          name: { equals: input.name.trim(), mode: 'insensitive' },
          id: { not: id },
        },
      });

      if (duplicate) {
        throw new ConflictError(`Kitchen station "${input.name.trim()}" already exists`);
      }
    }

    const updateData: Prisma.KitchenStationUpdateInput = {};
    if (input.name !== undefined) updateData.name = input.name.trim();
    if (input.code !== undefined) updateData.code = input.code ? input.code.trim() : null;
    if (input.displayOrder !== undefined) updateData.displayOrder = input.displayOrder;
    if (input.isActive !== undefined) updateData.isActive = input.isActive;

    const updated = await prisma.$transaction(async (tx) => {
      if (input.categoryIds !== undefined) {
        await tx.categoryKitchenStation.deleteMany({
          where: { stationId: id },
        });

        if (input.categoryIds.length > 0) {
          await tx.categoryKitchenStation.createMany({
            data: input.categoryIds.map((categoryId) => ({
              stationId: id,
              categoryId,
            })),
            skipDuplicates: true,
          });
        }
      }

      return tx.kitchenStation.update({
        where: { id },
        data: updateData,
        include: {
          categories: {
            include: {
              category: { select: { id: true, name: true } },
            },
          },
        },
      });
    });

    // Audit Log
    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'KITCHEN_STATION_UPDATED',
      entityType: 'KITCHEN_STATION',
      entityId: id,
      metadata: input as Record<string, unknown>,
      ipAddress,
    });

    return updated as unknown as Record<string, unknown>;
  }

  /**
   * 5. Delete Kitchen Station.
   */
  public static async deleteStation(
    restaurantId: string,
    id: string,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ): Promise<{ success: boolean; message: string }> {
    const station = await prisma.kitchenStation.findFirst({
      where: { id, restaurantId },
    });

    if (!station) {
      throw new NotFoundError(`Kitchen station with ID ${id} not found`);
    }

    await prisma.kitchenStation.delete({
      where: { id },
    });

    // Audit Log
    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'KITCHEN_STATION_DELETED',
      entityType: 'KITCHEN_STATION',
      entityId: id,
      metadata: { name: station.name },
      ipAddress,
    });

    return {
      success: true,
      message: 'Kitchen station deleted successfully',
    };
  }
}
