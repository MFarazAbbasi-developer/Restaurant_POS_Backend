import { prisma } from '../../../config/database.js';
import { NotFoundError, BadRequestError } from '../../../common/errors/app-error.js';
import { AuditService } from '../../../common/services/audit.service.js';
import type {
  CreateCategoryInput,
  ReorderCategoriesInput,
  UpdateCategoryInput,
} from '../menu.schema.js';
import type { AuthenticatedUserContext } from '../../../common/types/express.js';

export class CategoryService {
  /**
   * Lists all categories belonging to the restaurant, sorted by sortOrder.
   */
  public static async listCategories(restaurantId: string) {
    return prisma.category.findMany({
      where: { restaurantId },
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: { menuItems: true },
        },
      },
    });
  }

  /**
   * Retrieves a single category by ID.
   */
  public static async getCategoryById(restaurantId: string, categoryId: string) {
    const category = await prisma.category.findFirst({
      where: { id: categoryId, restaurantId },
      include: {
        _count: {
          select: { menuItems: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundError('Category not found');
    }

    return category;
  }

  /**
   * Creates a new menu category for the restaurant.
   */
  public static async createCategory(
    restaurantId: string,
    input: CreateCategoryInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const category = await prisma.category.create({
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
      action: 'MENU_CATEGORY_CREATED',
      entityType: 'CATEGORY',
      entityId: category.id,
      metadata: {
        name: category.name,
        sortOrder: category.sortOrder,
        isActive: category.isActive,
      },
      ipAddress: ipAddress ?? null,
    });

    return category;
  }

  /**
   * Updates an existing menu category.
   */
  public static async updateCategory(
    restaurantId: string,
    categoryId: string,
    input: UpdateCategoryInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const existing = await prisma.category.findFirst({
      where: { id: categoryId, restaurantId },
    });

    if (!existing) {
      throw new NotFoundError('Category not found');
    }

    const updated = await prisma.category.update({
      where: { id: categoryId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'MENU_CATEGORY_UPDATED',
      entityType: 'CATEGORY',
      entityId: categoryId,
      metadata: {
        previous: {
          name: existing.name,
          description: existing.description,
          sortOrder: existing.sortOrder,
        },
        changes: input,
      },
      ipAddress: ipAddress ?? null,
    });

    return updated;
  }

  /**
   * Activates or deactivates a menu category.
   */
  public static async updateCategoryStatus(
    restaurantId: string,
    categoryId: string,
    isActive: boolean,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const existing = await prisma.category.findFirst({
      where: { id: categoryId, restaurantId },
    });

    if (!existing) {
      throw new NotFoundError('Category not found');
    }

    const updated = await prisma.category.update({
      where: { id: categoryId },
      data: { isActive },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'MENU_CATEGORY_STATUS_CHANGED',
      entityType: 'CATEGORY',
      entityId: categoryId,
      metadata: {
        previousStatus: existing.isActive,
        newStatus: isActive,
      },
      ipAddress: ipAddress ?? null,
    });

    return updated;
  }

  /**
   * Reorders multiple categories atomically within a transaction.
   */
  public static async reorderCategories(
    restaurantId: string,
    input: ReorderCategoriesInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const itemIds = input.items.map((i) => i.id);

    // Verify all category IDs belong to this restaurant
    const existingCount = await prisma.category.count({
      where: {
        id: { in: itemIds },
        restaurantId,
      },
    });

    if (existingCount !== itemIds.length) {
      throw new BadRequestError('One or more categories do not exist in this restaurant');
    }

    // Execute atomic reorder in transaction
    await prisma.$transaction(
      input.items.map((item) =>
        prisma.category.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'MENU_CATEGORY_UPDATED',
      entityType: 'CATEGORY',
      metadata: {
        event: 'REORDER_CATEGORIES',
        reorderedCount: input.items.length,
      },
      ipAddress: ipAddress ?? null,
    });

    return this.listCategories(restaurantId);
  }
}
