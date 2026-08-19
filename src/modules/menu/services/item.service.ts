import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../../common/errors/app-error.js';
import { AuditService } from '../../../common/services/audit.service.js';
import type {
  CreateMenuItemInput,
  ListMenuItemsQueryInput,
  UpdateMenuItemInput,
} from '../menu.schema.js';
import type { AuthenticatedUserContext } from '../../../common/types/express.js';

export class ItemService {
  /**
   * Lists menu items for the restaurant with optional filtering, search, and pagination.
   */
  public static async listItems(restaurantId: string, query: ListMenuItemsQueryInput) {
    const { categoryId, isActive, isAvailable, search, page, limit, sortBy, sortOrder } = query;

    const where: Prisma.MenuItemWhereInput = {
      restaurantId,
      ...(categoryId !== undefined && { categoryId }),
      ...(isActive !== undefined && { isActive }),
      ...(isAvailable !== undefined && { isAvailable }),
      ...(search !== undefined &&
        search.length > 0 && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { urduName: { contains: search, mode: 'insensitive' } },
            { itemCode: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        }),
    };

    const [total, items] = await Promise.all([
      prisma.menuItem.count({ where }),
      prisma.menuItem.findMany({
        where,
        include: {
          category: true,
          variants: {
            orderBy: { sortOrder: 'asc' },
          },
          modifierGroups: {
            orderBy: { sortOrder: 'asc' },
            include: {
              modifierGroup: {
                include: {
                  modifiers: {
                    orderBy: { sortOrder: 'asc' },
                  },
                },
              },
            },
          },
        },
        orderBy: {
          [sortBy]: sortOrder,
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Retrieves a single menu item by ID.
   */
  public static async getItemById(restaurantId: string, itemId: string) {
    const item = await prisma.menuItem.findFirst({
      where: { id: itemId, restaurantId },
      include: {
        category: true,
        variants: {
          orderBy: { sortOrder: 'asc' },
        },
        modifierGroups: {
          orderBy: { sortOrder: 'asc' },
          include: {
            modifierGroup: {
              include: {
                modifiers: {
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundError('Menu item not found');
    }

    return item;
  }

  /**
   * Creates a new menu item in the restaurant.
   */
  public static async createItem(
    restaurantId: string,
    input: CreateMenuItemInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    // 1. Verify category exists and belongs to the restaurant
    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, restaurantId },
    });

    if (!category) {
      throw new BadRequestError('Category does not exist in this restaurant');
    }

    // 2. Verify item code uniqueness within the restaurant
    const duplicateCode = await prisma.menuItem.findUnique({
      where: {
        restaurantId_itemCode: {
          restaurantId,
          itemCode: input.itemCode,
        },
      },
    });

    if (duplicateCode) {
      throw new ConflictError(`Item code '${input.itemCode}' already exists in this restaurant`);
    }

    // 3. If basePrice > 0, verify user has menu.price_update permission or OWNER role
    if (input.basePrice > 0) {
      const hasPricePerm =
        actor.permissions.includes('menu.price_update') || actor.roles.includes('OWNER');
      if (!hasPricePerm) {
        throw new ForbiddenError(
          "Forbidden: Insufficient permissions (requires 'menu.price_update' to set basePrice)",
        );
      }
    }

    const item = await prisma.menuItem.create({
      data: {
        restaurantId,
        categoryId: input.categoryId,
        itemCode: input.itemCode,
        name: input.name,
        urduName: input.urduName ?? null,
        description: input.description ?? null,
        basePrice: new Prisma.Decimal(input.basePrice),
        taxRate: input.taxRate != null ? new Prisma.Decimal(input.taxRate) : null,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
        isAvailable: input.isAvailable ?? true,
      },
      include: {
        category: true,
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'MENU_ITEM_CREATED',
      entityType: 'MENU_ITEM',
      entityId: item.id,
      metadata: {
        itemCode: item.itemCode,
        name: item.name,
        categoryId: item.categoryId,
        basePrice: input.basePrice,
      },
      ipAddress: ipAddress ?? null,
    });

    return item;
  }

  /**
   * Updates an existing menu item.
   */
  public static async updateItem(
    restaurantId: string,
    itemId: string,
    input: UpdateMenuItemInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const existing = await prisma.menuItem.findFirst({
      where: { id: itemId, restaurantId },
    });

    if (!existing) {
      throw new NotFoundError('Menu item not found');
    }

    // 1. Verify category if changing category
    if (input.categoryId && input.categoryId !== existing.categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: input.categoryId, restaurantId },
      });

      if (!category) {
        throw new BadRequestError('Category does not exist in this restaurant');
      }
    }

    // 2. Verify item code if changing code
    if (input.itemCode && input.itemCode !== existing.itemCode) {
      const duplicateCode = await prisma.menuItem.findUnique({
        where: {
          restaurantId_itemCode: {
            restaurantId,
            itemCode: input.itemCode,
          },
        },
      });

      if (duplicateCode) {
        throw new ConflictError(`Item code '${input.itemCode}' already exists in this restaurant`);
      }
    }

    // 3. If price is changing, verify menu.price_update permission
    const isPriceChanging =
      input.basePrice !== undefined && Number(input.basePrice) !== Number(existing.basePrice);

    if (isPriceChanging) {
      const hasPricePerm =
        actor.permissions.includes('menu.price_update') || actor.roles.includes('OWNER');
      if (!hasPricePerm) {
        throw new ForbiddenError(
          "Forbidden: Insufficient permissions (requires 'menu.price_update' to modify item price)",
        );
      }
    }

    const updated = await prisma.menuItem.update({
      where: { id: itemId },
      data: {
        ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
        ...(input.itemCode !== undefined && { itemCode: input.itemCode }),
        ...(input.name !== undefined && { name: input.name }),
        ...(input.urduName !== undefined && { urduName: input.urduName }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.basePrice !== undefined && { basePrice: new Prisma.Decimal(input.basePrice) }),
        ...(input.taxRate !== undefined && {
          taxRate: input.taxRate != null ? new Prisma.Decimal(input.taxRate) : null,
        }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      },
      include: {
        category: true,
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'MENU_ITEM_UPDATED',
      entityType: 'MENU_ITEM',
      entityId: itemId,
      metadata: {
        previous: {
          itemCode: existing.itemCode,
          name: existing.name,
          basePrice: existing.basePrice.toNumber(),
        },
        changes: input,
      },
      ipAddress: ipAddress ?? null,
    });

    if (isPriceChanging) {
      await AuditService.log({
        restaurantId,
        userId: actor.id,
        action: 'MENU_ITEM_PRICE_CHANGED',
        entityType: 'MENU_ITEM',
        entityId: itemId,
        metadata: {
          previousPrice: existing.basePrice.toNumber(),
          newPrice: input.basePrice,
        },
        ipAddress: ipAddress ?? null,
      });
    }

    return updated;
  }

  /**
   * Toggles menu item active status.
   */
  public static async updateItemStatus(
    restaurantId: string,
    itemId: string,
    isActive: boolean,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const existing = await prisma.menuItem.findFirst({
      where: { id: itemId, restaurantId },
    });

    if (!existing) {
      throw new NotFoundError('Menu item not found');
    }

    const updated = await prisma.menuItem.update({
      where: { id: itemId },
      data: { isActive },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'MENU_ITEM_STATUS_CHANGED',
      entityType: 'MENU_ITEM',
      entityId: itemId,
      metadata: {
        previousStatus: existing.isActive,
        newStatus: isActive,
      },
      ipAddress: ipAddress ?? null,
    });

    return updated;
  }

  /**
   * Toggles operational availability (86 / out of stock toggle).
   */
  public static async updateItemAvailability(
    restaurantId: string,
    itemId: string,
    isAvailable: boolean,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const existing = await prisma.menuItem.findFirst({
      where: { id: itemId, restaurantId },
    });

    if (!existing) {
      throw new NotFoundError('Menu item not found');
    }

    const updated = await prisma.menuItem.update({
      where: { id: itemId },
      data: { isAvailable },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'MENU_ITEM_AVAILABILITY_CHANGED',
      entityType: 'MENU_ITEM',
      entityId: itemId,
      metadata: {
        previousAvailability: existing.isAvailable,
        newAvailability: isAvailable,
      },
      ipAddress: ipAddress ?? null,
    });

    return updated;
  }
}
