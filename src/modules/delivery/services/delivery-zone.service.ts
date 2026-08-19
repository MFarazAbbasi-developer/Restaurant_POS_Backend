import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { BadRequestError, NotFoundError } from '../../../common/errors/app-error.js';
import { AuditService } from '../../../common/services/audit.service.js';
import type { CreateDeliveryZoneInput, UpdateDeliveryZoneInput } from '../delivery.schema.js';
import type { AuthenticatedUserContext } from '../../../common/types/express.js';

export class DeliveryZoneService {
  public static async listZones(restaurantId: string) {
    const zones = await prisma.deliveryZone.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
    });

    return zones.map((z) => ({
      ...z,
      deliveryCharge: z.deliveryCharge.toNumber(),
    }));
  }

  public static async getZoneById(restaurantId: string, zoneId: string) {
    const zone = await prisma.deliveryZone.findFirst({
      where: { id: zoneId, restaurantId },
    });

    if (!zone) {
      throw new NotFoundError('Delivery zone not found in this restaurant');
    }

    return {
      ...zone,
      deliveryCharge: zone.deliveryCharge.toNumber(),
    };
  }

  public static async createZone(
    restaurantId: string,
    input: CreateDeliveryZoneInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const existing = await prisma.deliveryZone.findUnique({
      where: {
        restaurantId_name: {
          restaurantId,
          name: input.name.trim(),
        },
      },
    });

    if (existing) {
      throw new BadRequestError(`Delivery zone with name '${input.name}' already exists`);
    }

    const zone = await prisma.deliveryZone.create({
      data: {
        restaurantId,
        name: input.name.trim(),
        deliveryCharge: new Prisma.Decimal(input.deliveryCharge),
        estimatedMinutes: input.estimatedMinutes ?? null,
        isActive: input.isActive ?? true,
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'DELIVERY_ZONE_CREATED',
      entityType: 'DELIVERY_ZONE',
      entityId: zone.id,
      metadata: {
        name: zone.name,
        deliveryCharge: zone.deliveryCharge.toNumber(),
      },
      ipAddress: ipAddress ?? null,
    });

    return {
      ...zone,
      deliveryCharge: zone.deliveryCharge.toNumber(),
    };
  }

  public static async updateZone(
    restaurantId: string,
    zoneId: string,
    input: UpdateDeliveryZoneInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const existing = await prisma.deliveryZone.findFirst({
      where: { id: zoneId, restaurantId },
    });

    if (!existing) {
      throw new NotFoundError('Delivery zone not found in this restaurant');
    }

    if (input.name && input.name.trim() !== existing.name) {
      const duplicate = await prisma.deliveryZone.findUnique({
        where: {
          restaurantId_name: {
            restaurantId,
            name: input.name.trim(),
          },
        },
      });
      if (duplicate) {
        throw new BadRequestError(`Delivery zone '${input.name}' already exists`);
      }
    }

    const updated = await prisma.deliveryZone.update({
      where: { id: zoneId },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.deliveryCharge !== undefined
          ? { deliveryCharge: new Prisma.Decimal(input.deliveryCharge) }
          : {}),
        ...(input.estimatedMinutes !== undefined
          ? { estimatedMinutes: input.estimatedMinutes }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'DELIVERY_ZONE_UPDATED',
      entityType: 'DELIVERY_ZONE',
      entityId: zoneId,
      metadata: {
        updatedFields: Object.keys(input),
      },
      ipAddress: ipAddress ?? null,
    });

    return {
      ...updated,
      deliveryCharge: updated.deliveryCharge.toNumber(),
    };
  }
}
