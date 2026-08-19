import { prisma } from '../../config/database.js';
import { NotFoundError } from '../../common/errors/app-error.js';
import { AuditService } from '../../common/services/audit.service.js';
import type { UpdateRestaurantInput } from './restaurant.schema.js';
import type { AuthenticatedUserContext } from '../../common/types/express.js';
import { Prisma } from '@prisma/client';

export class RestaurantService {
  /**
   * Retrieves restaurant configuration details for the current tenant.
   */
  public static async getRestaurant(restaurantId: string) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      throw new NotFoundError('Restaurant not found');
    }

    return restaurant;
  }

  /**
   * Updates restaurant configuration and records an audit log entry.
   */
  public static async updateRestaurant(
    restaurantId: string,
    input: UpdateRestaurantInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const existing = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!existing) {
      throw new NotFoundError('Restaurant not found');
    }

    const updateData: Prisma.RestaurantUpdateInput = {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.legalName !== undefined && { legalName: input.legalName }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.address !== undefined && { address: input.address }),
      ...(input.logo !== undefined && { logo: input.logo }),
      ...(input.currency !== undefined && { currency: input.currency }),
      ...(input.timezone !== undefined && { timezone: input.timezone }),
      ...(input.taxNumber !== undefined && { taxNumber: input.taxNumber }),
      ...(input.taxRate !== undefined && { taxRate: input.taxRate }),
      ...(input.taxInclusive !== undefined && { taxInclusive: input.taxInclusive }),
      ...(input.serviceChargeRate !== undefined && { serviceChargeRate: input.serviceChargeRate }),
      ...(input.serviceChargeEnabled !== undefined && {
        serviceChargeEnabled: input.serviceChargeEnabled,
      }),
      ...(input.dineInEnabled !== undefined && { dineInEnabled: input.dineInEnabled }),
      ...(input.takeawayEnabled !== undefined && { takeawayEnabled: input.takeawayEnabled }),
      ...(input.deliveryEnabled !== undefined && { deliveryEnabled: input.deliveryEnabled }),
      ...(input.receiptHeader !== undefined && { receiptHeader: input.receiptHeader }),
      ...(input.receiptFooter !== undefined && { receiptFooter: input.receiptFooter }),
      ...(input.settings !== undefined && {
        settings:
          input.settings === null ? Prisma.JsonNull : (input.settings as Prisma.InputJsonValue),
      }),
    };

    const updatedRestaurant = await prisma.restaurant.update({
      where: { id: restaurantId },
      data: updateData,
    });

    // Record audit log
    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'RESTAURANT_SETTINGS_UPDATED',
      entityType: 'RESTAURANT',
      entityId: restaurantId,
      metadata: {
        updatedFields: Object.keys(input),
        changes: input,
      },
      ipAddress: ipAddress ?? null,
    });

    return updatedRestaurant;
  }
}
