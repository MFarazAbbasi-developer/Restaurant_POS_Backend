import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { ForbiddenError, NotFoundError } from '../../../common/errors/app-error.js';
import { AuditService } from '../../../common/services/audit.service.js';
import type {
  CreateModifierGroupInput,
  CreateModifierInput,
  LinkItemModifierGroupInput,
  UpdateModifierGroupInput,
  UpdateModifierInput,
} from '../menu.schema.js';
import type { AuthenticatedUserContext } from '../../../common/types/express.js';

export class ModifierService {
  /**
   * Lists all modifier groups with nested modifiers for the restaurant.
   */
  public static async listModifierGroups(restaurantId: string) {
    return prisma.modifierGroup.findMany({
      where: { restaurantId },
      include: {
        modifiers: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: { menuItems: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * Retrieves a single modifier group by ID.
   */
  public static async getModifierGroupById(restaurantId: string, groupId: string) {
    const group = await prisma.modifierGroup.findFirst({
      where: { id: groupId, restaurantId },
      include: {
        modifiers: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: { menuItems: true },
        },
      },
    });

    if (!group) {
      throw new NotFoundError('Modifier group not found in this restaurant');
    }

    return group;
  }

  /**
   * Creates a new modifier group.
   */
  public static async createModifierGroup(
    restaurantId: string,
    input: CreateModifierGroupInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const group = await prisma.modifierGroup.create({
      data: {
        restaurantId,
        name: input.name,
        selectionType: input.selectionType,
        minSelections: input.minSelections,
        maxSelections: input.maxSelections,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      },
      include: {
        modifiers: true,
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'MODIFIER_GROUP_CREATED',
      entityType: 'MODIFIER_GROUP',
      entityId: group.id,
      metadata: {
        name: group.name,
        selectionType: group.selectionType,
        minSelections: group.minSelections,
        maxSelections: group.maxSelections,
      },
      ipAddress: ipAddress ?? null,
    });

    return group;
  }

  /**
   * Updates an existing modifier group.
   */
  public static async updateModifierGroup(
    restaurantId: string,
    groupId: string,
    input: UpdateModifierGroupInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const existing = await prisma.modifierGroup.findFirst({
      where: { id: groupId, restaurantId },
    });

    if (!existing) {
      throw new NotFoundError('Modifier group not found in this restaurant');
    }

    const updated = await prisma.modifierGroup.update({
      where: { id: groupId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.selectionType !== undefined && { selectionType: input.selectionType }),
        ...(input.minSelections !== undefined && { minSelections: input.minSelections }),
        ...(input.maxSelections !== undefined && { maxSelections: input.maxSelections }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      },
      include: {
        modifiers: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'MODIFIER_GROUP_UPDATED',
      entityType: 'MODIFIER_GROUP',
      entityId: groupId,
      metadata: {
        previous: { name: existing.name, selectionType: existing.selectionType },
        changes: input,
      },
      ipAddress: ipAddress ?? null,
    });

    return updated;
  }

  /**
   * Toggles active status of a modifier group.
   */
  public static async updateModifierGroupStatus(
    restaurantId: string,
    groupId: string,
    isActive: boolean,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const existing = await prisma.modifierGroup.findFirst({
      where: { id: groupId, restaurantId },
    });

    if (!existing) {
      throw new NotFoundError('Modifier group not found in this restaurant');
    }

    const updated = await prisma.modifierGroup.update({
      where: { id: groupId },
      data: { isActive },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'MODIFIER_GROUP_UPDATED',
      entityType: 'MODIFIER_GROUP',
      entityId: groupId,
      metadata: {
        previousStatus: existing.isActive,
        newStatus: isActive,
      },
      ipAddress: ipAddress ?? null,
    });

    return updated;
  }

  /**
   * Creates a modifier option within a group.
   */
  public static async createModifier(
    restaurantId: string,
    groupId: string,
    input: CreateModifierInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const group = await prisma.modifierGroup.findFirst({
      where: { id: groupId, restaurantId },
    });

    if (!group) {
      throw new NotFoundError('Modifier group not found in this restaurant');
    }

    // If price adjustment > 0, verify menu.price_update permission or OWNER
    if (input.priceAdjustment > 0) {
      const hasPricePerm =
        actor.permissions.includes('menu.price_update') || actor.roles.includes('OWNER');
      if (!hasPricePerm) {
        throw new ForbiddenError(
          "Forbidden: Insufficient permissions (requires 'menu.price_update' to set price adjustments)",
        );
      }
    }

    const modifier = await prisma.modifier.create({
      data: {
        modifierGroupId: groupId,
        name: input.name,
        priceAdjustment: new Prisma.Decimal(input.priceAdjustment),
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'MODIFIER_CREATED',
      entityType: 'MODIFIER',
      entityId: modifier.id,
      metadata: {
        groupId,
        name: modifier.name,
        priceAdjustment: input.priceAdjustment,
      },
      ipAddress: ipAddress ?? null,
    });

    return modifier;
  }

  /**
   * Updates an existing modifier option.
   */
  public static async updateModifier(
    restaurantId: string,
    modifierId: string,
    input: UpdateModifierInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const existing = await prisma.modifier.findFirst({
      where: {
        id: modifierId,
        modifierGroup: {
          restaurantId,
        },
      },
      include: {
        modifierGroup: true,
      },
    });

    if (!existing) {
      throw new NotFoundError('Modifier not found in this restaurant');
    }

    // Verify price permission if priceAdjustment is changing
    const isPriceChanging =
      input.priceAdjustment !== undefined &&
      Number(input.priceAdjustment) !== Number(existing.priceAdjustment);

    if (isPriceChanging) {
      const hasPricePerm =
        actor.permissions.includes('menu.price_update') || actor.roles.includes('OWNER');
      if (!hasPricePerm) {
        throw new ForbiddenError(
          "Forbidden: Insufficient permissions (requires 'menu.price_update' to modify price adjustments)",
        );
      }
    }

    const updated = await prisma.modifier.update({
      where: { id: modifierId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.priceAdjustment !== undefined && {
          priceAdjustment: new Prisma.Decimal(input.priceAdjustment),
        }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'MODIFIER_UPDATED',
      entityType: 'MODIFIER',
      entityId: modifierId,
      metadata: {
        groupId: existing.modifierGroupId,
        previous: { name: existing.name, priceAdjustment: existing.priceAdjustment.toNumber() },
        changes: input,
      },
      ipAddress: ipAddress ?? null,
    });

    return updated;
  }

  /**
   * Deletes a modifier option.
   */
  public static async deleteModifier(
    restaurantId: string,
    modifierId: string,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const existing = await prisma.modifier.findFirst({
      where: {
        id: modifierId,
        modifierGroup: {
          restaurantId,
        },
      },
    });

    if (!existing) {
      throw new NotFoundError('Modifier not found in this restaurant');
    }

    await prisma.modifier.delete({
      where: { id: modifierId },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'MODIFIER_DELETED',
      entityType: 'MODIFIER',
      entityId: modifierId,
      metadata: {
        groupId: existing.modifierGroupId,
        name: existing.name,
      },
      ipAddress: ipAddress ?? null,
    });

    return { id: modifierId, deleted: true };
  }

  /**
   * Links a modifier group to a menu item.
   */
  public static async linkModifierGroupToItem(
    restaurantId: string,
    itemId: string,
    input: LinkItemModifierGroupInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const [item, group] = await Promise.all([
      prisma.menuItem.findFirst({ where: { id: itemId, restaurantId } }),
      prisma.modifierGroup.findFirst({ where: { id: input.modifierGroupId, restaurantId } }),
    ]);

    if (!item) {
      throw new NotFoundError('Menu item not found in this restaurant');
    }

    if (!group) {
      throw new NotFoundError('Modifier group not found in this restaurant');
    }

    const link = await prisma.menuItemModifierGroup.upsert({
      where: {
        menuItemId_modifierGroupId: {
          menuItemId: itemId,
          modifierGroupId: input.modifierGroupId,
        },
      },
      update: {
        sortOrder: input.sortOrder ?? 0,
        isRequired: input.isRequired ?? false,
        minSelections: input.minSelections ?? null,
        maxSelections: input.maxSelections ?? null,
      },
      create: {
        menuItemId: itemId,
        modifierGroupId: input.modifierGroupId,
        sortOrder: input.sortOrder ?? 0,
        isRequired: input.isRequired ?? false,
        minSelections: input.minSelections ?? null,
        maxSelections: input.maxSelections ?? null,
      },
      include: {
        modifierGroup: {
          include: {
            modifiers: {
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'ITEM_MODIFIER_GROUP_LINKED',
      entityType: 'MENU_ITEM_MODIFIER_GROUP',
      entityId: link.id,
      metadata: {
        itemId,
        modifierGroupId: input.modifierGroupId,
        isRequired: link.isRequired,
      },
      ipAddress: ipAddress ?? null,
    });

    return link;
  }

  /**
   * Unlinks a modifier group from a menu item.
   */
  public static async unlinkModifierGroupFromItem(
    restaurantId: string,
    itemId: string,
    groupId: string,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const item = await prisma.menuItem.findFirst({
      where: { id: itemId, restaurantId },
    });

    if (!item) {
      throw new NotFoundError('Menu item not found in this restaurant');
    }

    const existingLink = await prisma.menuItemModifierGroup.findUnique({
      where: {
        menuItemId_modifierGroupId: {
          menuItemId: itemId,
          modifierGroupId: groupId,
        },
      },
    });

    if (!existingLink) {
      throw new NotFoundError('Modifier group is not linked to this menu item');
    }

    await prisma.menuItemModifierGroup.delete({
      where: {
        menuItemId_modifierGroupId: {
          menuItemId: itemId,
          modifierGroupId: groupId,
        },
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'ITEM_MODIFIER_GROUP_UNLINKED',
      entityType: 'MENU_ITEM_MODIFIER_GROUP',
      entityId: existingLink.id,
      metadata: {
        itemId,
        modifierGroupId: groupId,
      },
      ipAddress: ipAddress ?? null,
    });

    return { unlinked: true, itemId, modifierGroupId: groupId };
  }
}
