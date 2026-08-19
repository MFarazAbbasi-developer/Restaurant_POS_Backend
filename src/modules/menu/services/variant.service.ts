import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { ForbiddenError, NotFoundError } from '../../../common/errors/app-error.js';
import { AuditService } from '../../../common/services/audit.service.js';
import type { CreateVariantInput, UpdateVariantInput } from '../menu.schema.js';
import type { AuthenticatedUserContext } from '../../../common/types/express.js';

export class VariantService {
  /**
   * Creates a portion/price variant for a menu item.
   */
  public static async createVariant(
    restaurantId: string,
    itemId: string,
    input: CreateVariantInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const item = await prisma.menuItem.findFirst({
      where: { id: itemId, restaurantId },
    });

    if (!item) {
      throw new NotFoundError('Menu item not found in this restaurant');
    }

    // Creating variants specifies a price -> requires menu.price_update or OWNER
    const hasPricePerm =
      actor.permissions.includes('menu.price_update') || actor.roles.includes('OWNER');
    if (!hasPricePerm) {
      throw new ForbiddenError(
        "Forbidden: Insufficient permissions (requires 'menu.price_update' to configure variants)",
      );
    }

    const variant = await prisma.menuItemVariant.create({
      data: {
        menuItemId: itemId,
        name: input.name,
        price: new Prisma.Decimal(input.price),
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'MENU_VARIANT_CREATED',
      entityType: 'MENU_ITEM_VARIANT',
      entityId: variant.id,
      metadata: {
        itemId,
        variantName: variant.name,
        price: input.price,
      },
      ipAddress: ipAddress ?? null,
    });

    return variant;
  }

  /**
   * Updates an existing portion/price variant.
   */
  public static async updateVariant(
    restaurantId: string,
    variantId: string,
    input: UpdateVariantInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const existing = await prisma.menuItemVariant.findFirst({
      where: {
        id: variantId,
        menuItem: {
          restaurantId,
        },
      },
      include: {
        menuItem: true,
      },
    });

    if (!existing) {
      throw new NotFoundError('Variant not found in this restaurant');
    }

    // If price is changing, verify menu.price_update permission
    const isPriceChanging =
      input.price !== undefined && Number(input.price) !== Number(existing.price);

    if (isPriceChanging) {
      const hasPricePerm =
        actor.permissions.includes('menu.price_update') || actor.roles.includes('OWNER');
      if (!hasPricePerm) {
        throw new ForbiddenError(
          "Forbidden: Insufficient permissions (requires 'menu.price_update' to modify variant price)",
        );
      }
    }

    const updated = await prisma.menuItemVariant.update({
      where: { id: variantId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.price !== undefined && { price: new Prisma.Decimal(input.price) }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'MENU_VARIANT_UPDATED',
      entityType: 'MENU_ITEM_VARIANT',
      entityId: variantId,
      metadata: {
        itemId: existing.menuItemId,
        previous: {
          name: existing.name,
          price: existing.price.toNumber(),
          isActive: existing.isActive,
        },
        changes: input,
      },
      ipAddress: ipAddress ?? null,
    });

    return updated;
  }

  /**
   * Deletes a portion/price variant.
   */
  public static async deleteVariant(
    restaurantId: string,
    variantId: string,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const existing = await prisma.menuItemVariant.findFirst({
      where: {
        id: variantId,
        menuItem: {
          restaurantId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundError('Variant not found in this restaurant');
    }

    await prisma.menuItemVariant.delete({
      where: { id: variantId },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'MENU_VARIANT_DELETED',
      entityType: 'MENU_ITEM_VARIANT',
      entityId: variantId,
      metadata: {
        itemId: existing.menuItemId,
        variantName: existing.name,
      },
      ipAddress: ipAddress ?? null,
    });

    return { id: variantId, deleted: true };
  }
}
