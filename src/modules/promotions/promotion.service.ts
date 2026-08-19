import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../common/errors/app-error.js';
import { HttpStatus } from '../../common/http/http-status.js';
import { AuditService } from '../../common/services/audit.service.js';
import {
  CreatePromotionInput,
  UpdatePromotionInput,
  ListPromotionsQuery,
  PreviewPromotionsInput,
  ValidatePromoCodeInput,
} from './promotion.schema.js';
import {
  PromotionEngine,
  PromotionCandidateItem,
  AppliedPromotionBreakdown,
} from './promotion-engine.service.js';

export class PromotionService {
  // ---------------------------------------------------------------------------
  // 1. List Promotions
  // ---------------------------------------------------------------------------
  public static async listPromotions(restaurantId: string, query: ListPromotionsQuery) {
    const { page, limit, search, type, targetType, isActive, isAutoApply, hasCode } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.PromotionWhereInput = {
      restaurantId,
      ...(type && { type }),
      ...(targetType && { targetType }),
      ...(isActive !== undefined && { isActive }),
      ...(isAutoApply !== undefined && { isAutoApply }),
      ...(hasCode !== undefined && (hasCode ? { code: { not: null } } : { code: null })),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [total, promotions] = await Promise.all([
      prisma.promotion.count({ where }),
      prisma.promotion.findMany({
        where,
        skip,
        take: limit,
        include: {
          menuItems: {
            include: {
              menuItem: { select: { id: true, itemCode: true, name: true, basePrice: true } },
            },
          },
          categories: {
            include: {
              category: { select: { id: true, name: true } },
            },
          },
          _count: {
            select: { usages: true },
          },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    const formattedPromotions = promotions.map((p) => ({
      ...p,
      discountValue: p.discountValue.toNumber(),
      maxDiscountAmount: p.maxDiscountAmount ? p.maxDiscountAmount.toNumber() : null,
      minOrderAmount: p.minOrderAmount ? p.minOrderAmount.toNumber() : null,
      getDiscountPercentage: p.getDiscountPercentage ? p.getDiscountPercentage.toNumber() : null,
      usageCount: p.usageCount,
      totalRedemptions: p._count.usages,
    }));

    return {
      promotions: formattedPromotions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Get Single Promotion
  // ---------------------------------------------------------------------------
  public static async getPromotion(restaurantId: string, id: string) {
    const promotion = await prisma.promotion.findFirst({
      where: { id, restaurantId },
      include: {
        menuItems: {
          include: {
            menuItem: { select: { id: true, itemCode: true, name: true, basePrice: true } },
          },
        },
        categories: {
          include: {
            category: { select: { id: true, name: true } },
          },
        },
        customer: { select: { id: true, name: true, phone: true } },
        _count: {
          select: { usages: true },
        },
      },
    });

    if (!promotion) {
      throw new AppError('Promotion not found', HttpStatus.NOT_FOUND);
    }

    return {
      ...promotion,
      discountValue: promotion.discountValue.toNumber(),
      maxDiscountAmount: promotion.maxDiscountAmount
        ? promotion.maxDiscountAmount.toNumber()
        : null,
      minOrderAmount: promotion.minOrderAmount ? promotion.minOrderAmount.toNumber() : null,
      getDiscountPercentage: promotion.getDiscountPercentage
        ? promotion.getDiscountPercentage.toNumber()
        : null,
      totalRedemptions: promotion._count.usages,
    };
  }

  // ---------------------------------------------------------------------------
  // 3. Create Promotion
  // ---------------------------------------------------------------------------
  public static async createPromotion(
    restaurantId: string,
    input: CreatePromotionInput,
    actorId?: string,
  ) {
    // If promo code provided, ensure unique per restaurant
    if (input.code) {
      const existing = await prisma.promotion.findFirst({
        where: {
          restaurantId,
          code: { equals: input.code, mode: 'insensitive' },
        },
      });

      if (existing) {
        throw new AppError(
          `Promo code "${input.code}" already exists for this restaurant`,
          HttpStatus.CONFLICT,
        );
      }
    }

    const promotion = await prisma.$transaction(async (tx) => {
      const promo = await tx.promotion.create({
        data: {
          restaurantId,
          name: input.name,
          code: input.code ? input.code.toUpperCase() : null,
          description: input.description ?? null,
          type: input.type,
          targetType: input.targetType,
          discountValue: new Prisma.Decimal(input.discountValue),
          maxDiscountAmount:
            input.maxDiscountAmount !== undefined && input.maxDiscountAmount !== null
              ? new Prisma.Decimal(input.maxDiscountAmount)
              : null,
          minOrderAmount:
            input.minOrderAmount !== undefined && input.minOrderAmount !== null
              ? new Prisma.Decimal(input.minOrderAmount)
              : null,
          minQuantity: input.minQuantity ?? null,
          buyQuantity: input.buyQuantity ?? null,
          getQuantity: input.getQuantity ?? null,
          getDiscountPercentage:
            input.getDiscountPercentage !== undefined && input.getDiscountPercentage !== null
              ? new Prisma.Decimal(input.getDiscountPercentage)
              : new Prisma.Decimal(100),
          orderTypes: input.orderTypes
            ? JSON.parse(JSON.stringify(input.orderTypes))
            : Prisma.DbNull,
          daysOfWeek: input.daysOfWeek
            ? JSON.parse(JSON.stringify(input.daysOfWeek))
            : Prisma.DbNull,
          startDate: input.startDate ? new Date(input.startDate) : null,
          endDate: input.endDate ? new Date(input.endDate) : null,
          startTime: input.startTime ?? null,
          endTime: input.endTime ?? null,
          isActive: input.isActive ?? true,
          isAutoApply: input.isAutoApply ?? false,
          isStackable: input.isStackable ?? false,
          priority: input.priority ?? 0,
          usageLimit: input.usageLimit ?? null,
          perCustomerLimit: input.perCustomerLimit ?? null,
          customerId: input.customerId ?? null,
          ...(input.targetType === 'ITEM' &&
            input.menuItemIds && {
              menuItems: {
                create: input.menuItemIds.map((menuItemId) => ({ menuItemId })),
              },
            }),
          ...(input.targetType === 'CATEGORY' &&
            input.categoryIds && {
              categories: {
                create: input.categoryIds.map((categoryId) => ({ categoryId })),
              },
            }),
        },
        include: {
          menuItems: {
            include: {
              menuItem: { select: { id: true, itemCode: true, name: true } },
            },
          },
          categories: {
            include: {
              category: { select: { id: true, name: true } },
            },
          },
        },
      });

      return promo;
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'PROMOTION_CREATED',
      entityType: 'PROMOTION',
      entityId: promotion.id,
      metadata: {
        name: promotion.name,
        code: promotion.code,
        type: promotion.type,
        targetType: promotion.targetType,
        discountValue: promotion.discountValue.toNumber(),
      },
    });

    return {
      ...promotion,
      discountValue: promotion.discountValue.toNumber(),
      maxDiscountAmount: promotion.maxDiscountAmount
        ? promotion.maxDiscountAmount.toNumber()
        : null,
      minOrderAmount: promotion.minOrderAmount ? promotion.minOrderAmount.toNumber() : null,
      getDiscountPercentage: promotion.getDiscountPercentage
        ? promotion.getDiscountPercentage.toNumber()
        : null,
    };
  }

  // ---------------------------------------------------------------------------
  // 4. Update Promotion
  // ---------------------------------------------------------------------------
  public static async updatePromotion(
    restaurantId: string,
    id: string,
    input: UpdatePromotionInput,
    actorId?: string,
  ) {
    const existing = await prisma.promotion.findFirst({
      where: { id, restaurantId },
    });

    if (!existing) {
      throw new AppError('Promotion not found', HttpStatus.NOT_FOUND);
    }

    if (input.code && input.code !== existing.code) {
      const duplicate = await prisma.promotion.findFirst({
        where: {
          restaurantId,
          code: { equals: input.code, mode: 'insensitive' },
          id: { not: id },
        },
      });

      if (duplicate) {
        throw new AppError(
          `Promo code "${input.code}" already in use by another promotion`,
          HttpStatus.CONFLICT,
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      // If target items/categories changed, clear and recreate
      if (input.targetType === 'ITEM' && input.menuItemIds) {
        await tx.promotionMenuItem.deleteMany({ where: { promotionId: id } });
        await tx.promotionMenuItem.createMany({
          data: input.menuItemIds.map((menuItemId: string) => ({ promotionId: id, menuItemId })),
        });
      }

      if (input.targetType === 'CATEGORY' && input.categoryIds) {
        await tx.promotionCategory.deleteMany({ where: { promotionId: id } });
        await tx.promotionCategory.createMany({
          data: input.categoryIds.map((categoryId: string) => ({ promotionId: id, categoryId })),
        });
      }

      const promo = await tx.promotion.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.code !== undefined && { code: input.code ? input.code.toUpperCase() : null }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.type !== undefined && { type: input.type }),
          ...(input.targetType !== undefined && { targetType: input.targetType }),
          ...(input.discountValue !== undefined && {
            discountValue: new Prisma.Decimal(input.discountValue),
          }),
          ...(input.maxDiscountAmount !== undefined && {
            maxDiscountAmount:
              input.maxDiscountAmount !== null ? new Prisma.Decimal(input.maxDiscountAmount) : null,
          }),
          ...(input.minOrderAmount !== undefined && {
            minOrderAmount:
              input.minOrderAmount !== null ? new Prisma.Decimal(input.minOrderAmount) : null,
          }),
          ...(input.minQuantity !== undefined && { minQuantity: input.minQuantity }),
          ...(input.buyQuantity !== undefined && { buyQuantity: input.buyQuantity }),
          ...(input.getQuantity !== undefined && { getQuantity: input.getQuantity }),
          ...(input.getDiscountPercentage !== undefined && {
            getDiscountPercentage:
              input.getDiscountPercentage !== null
                ? new Prisma.Decimal(input.getDiscountPercentage)
                : new Prisma.Decimal(100),
          }),
          ...(input.orderTypes !== undefined && {
            orderTypes: input.orderTypes
              ? JSON.parse(JSON.stringify(input.orderTypes))
              : Prisma.DbNull,
          }),
          ...(input.daysOfWeek !== undefined && {
            daysOfWeek: input.daysOfWeek
              ? JSON.parse(JSON.stringify(input.daysOfWeek))
              : Prisma.DbNull,
          }),
          ...(input.startDate !== undefined && {
            startDate: input.startDate ? new Date(input.startDate) : null,
          }),
          ...(input.endDate !== undefined && {
            endDate: input.endDate ? new Date(input.endDate) : null,
          }),
          ...(input.startTime !== undefined && { startTime: input.startTime }),
          ...(input.endTime !== undefined && { endTime: input.endTime }),
          ...(input.isActive !== undefined && { isActive: input.isActive }),
          ...(input.isAutoApply !== undefined && { isAutoApply: input.isAutoApply }),
          ...(input.isStackable !== undefined && { isStackable: input.isStackable }),
          ...(input.priority !== undefined && { priority: input.priority }),
          ...(input.usageLimit !== undefined && { usageLimit: input.usageLimit }),
          ...(input.perCustomerLimit !== undefined && { perCustomerLimit: input.perCustomerLimit }),
          ...(input.customerId !== undefined && { customerId: input.customerId }),
        },
        include: {
          menuItems: {
            include: {
              menuItem: { select: { id: true, itemCode: true, name: true } },
            },
          },
          categories: {
            include: {
              category: { select: { id: true, name: true } },
            },
          },
        },
      });

      return promo;
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'PROMOTION_UPDATED',
      entityType: 'PROMOTION',
      entityId: id,
      metadata: { changes: input },
    });

    return {
      ...updated,
      discountValue: updated.discountValue.toNumber(),
      maxDiscountAmount: updated.maxDiscountAmount ? updated.maxDiscountAmount.toNumber() : null,
      minOrderAmount: updated.minOrderAmount ? updated.minOrderAmount.toNumber() : null,
      getDiscountPercentage: updated.getDiscountPercentage
        ? updated.getDiscountPercentage.toNumber()
        : null,
    };
  }

  // ---------------------------------------------------------------------------
  // 5. Delete Promotion
  // ---------------------------------------------------------------------------
  public static async deletePromotion(restaurantId: string, id: string, actorId?: string) {
    const existing = await prisma.promotion.findFirst({
      where: { id, restaurantId },
    });

    if (!existing) {
      throw new AppError('Promotion not found', HttpStatus.NOT_FOUND);
    }

    await prisma.promotion.delete({ where: { id } });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'PROMOTION_DELETED',
      entityType: 'PROMOTION',
      entityId: id,
      metadata: { name: existing.name, code: existing.code },
    });
  }

  // ---------------------------------------------------------------------------
  // 6. Toggle Active Status
  // ---------------------------------------------------------------------------
  public static async toggleStatus(restaurantId: string, id: string, actorId?: string) {
    const existing = await prisma.promotion.findFirst({
      where: { id, restaurantId },
    });

    if (!existing) {
      throw new AppError('Promotion not found', HttpStatus.NOT_FOUND);
    }

    const updated = await prisma.promotion.update({
      where: { id },
      data: { isActive: !existing.isActive },
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'PROMOTION_STATUS_TOGGLED',
      entityType: 'PROMOTION',
      entityId: id,
      metadata: { isActive: updated.isActive },
    });

    return {
      id: updated.id,
      name: updated.name,
      isActive: updated.isActive,
    };
  }

  // ---------------------------------------------------------------------------
  // 7. Preview Promotions
  // ---------------------------------------------------------------------------
  public static async previewPromotions(restaurantId: string, input: PreviewPromotionsInput) {
    // 1. Fetch menu item pricing and categories
    const itemIds = input.items.map((it) => it.menuItemId);
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: itemIds }, restaurantId },
      include: {
        variants: true,
        category: true,
      },
    });

    const itemMap = new Map(menuItems.map((m) => [m.id, m]));

    // Construct Candidate items
    let subtotal = new Prisma.Decimal(0);
    const candidateItems: PromotionCandidateItem[] = [];

    for (const itemInput of input.items) {
      const menuItem = itemMap.get(itemInput.menuItemId);
      if (!menuItem) {
        throw new AppError(`Menu item ${itemInput.menuItemId} not found`, HttpStatus.BAD_REQUEST);
      }

      let unitPrice = menuItem.basePrice;
      let variantName: string | null = null;

      if (itemInput.variantId) {
        const variant = menuItem.variants.find((v) => v.id === itemInput.variantId);
        if (variant) {
          unitPrice = variant.price;
          variantName = variant.name;
        }
      }

      const modifiersPrice = new Prisma.Decimal(itemInput.modifiersPrice ?? 0);
      const singlePrice = unitPrice.add(modifiersPrice);
      const itemGross = singlePrice.mul(itemInput.quantity);
      subtotal = subtotal.add(itemGross);

      candidateItems.push({
        menuItemId: menuItem.id,
        variantId: itemInput.variantId,
        categoryId: menuItem.categoryId,
        name: `${menuItem.name}${variantName ? ` (${variantName})` : ''}`,
        quantity: itemInput.quantity,
        unitPrice: singlePrice,
        itemGrossTotal: itemGross,
      });
    }

    // Evaluate promotions
    const evalResult = await PromotionEngine.evaluatePromotions({
      restaurantId,
      orderType: input.orderType,
      customerId: input.customerId,
      promoCode: input.promoCode,
      items: candidateItems,
      subtotal,
    });

    const discountedSubtotal = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      subtotal.sub(evalResult.totalPromotionDiscount),
    );

    return {
      subtotal: subtotal.toNumber(),
      promotionDiscount: evalResult.totalPromotionDiscount.toNumber(),
      discountedSubtotal: discountedSubtotal.toNumber(),
      isQualified: evalResult.isQualified,
      appliedPromotions: evalResult.appliedPromotions.map((p) => ({
        ...p,
        discountAmount: p.discountAmount.toNumber(),
      })),
      appliedPromoCode: evalResult.appliedPromoCode,
      itemDiscounts: Object.fromEntries(
        Array.from(evalResult.itemPromotions.entries()).map(([k, v]) => [k, v.toNumber()]),
      ),
    };
  }

  // ---------------------------------------------------------------------------
  // 8. Validate Promo Code
  // ---------------------------------------------------------------------------
  public static async validatePromoCode(restaurantId: string, input: ValidatePromoCodeInput) {
    const promo = await prisma.promotion.findFirst({
      where: {
        restaurantId,
        code: { equals: input.code, mode: 'insensitive' },
      },
      include: {
        menuItems: { select: { menuItemId: true } },
        categories: { select: { categoryId: true } },
      },
    });

    if (!promo) {
      throw new AppError(`Invalid promo code "${input.code}"`, HttpStatus.NOT_FOUND);
    }

    // Build context if items provided
    const candidateItems: PromotionCandidateItem[] = [];
    let subtotal = new Prisma.Decimal(0);

    if (input.items && input.items.length > 0) {
      const itemIds = input.items.map((it) => it.menuItemId);
      const menuItems = await prisma.menuItem.findMany({
        where: { id: { in: itemIds }, restaurantId },
        include: { variants: true },
      });
      const itemMap = new Map(menuItems.map((m) => [m.id, m]));

      for (const itemInput of input.items) {
        const menuItem = itemMap.get(itemInput.menuItemId);
        if (menuItem) {
          let unitPrice = menuItem.basePrice;
          if (itemInput.variantId) {
            const v = menuItem.variants.find((vr) => vr.id === itemInput.variantId);
            if (v) unitPrice = v.price;
          }
          const itemGross = unitPrice.mul(itemInput.quantity);
          subtotal = subtotal.add(itemGross);
          candidateItems.push({
            menuItemId: menuItem.id,
            variantId: itemInput.variantId,
            categoryId: menuItem.categoryId,
            name: menuItem.name,
            quantity: itemInput.quantity,
            unitPrice,
            itemGrossTotal: itemGross,
          });
        }
      }
    }

    const eligibility = await PromotionEngine.checkEligibility(
      promo,
      {
        restaurantId,
        orderType: input.orderType,
        customerId: input.customerId,
        items: candidateItems,
        subtotal,
      },
      new Date(),
    );

    if (!eligibility.eligible) {
      throw new AppError(
        eligibility.reason || 'Promo code cannot be applied to this order',
        HttpStatus.BAD_REQUEST,
      );
    }

    let estimatedDiscount = new Prisma.Decimal(0);
    if (candidateItems.length > 0) {
      const calc = PromotionEngine.calculatePromotionDiscount(promo, candidateItems, subtotal);
      estimatedDiscount = calc.discount;
    }

    return {
      isValid: true,
      promotion: {
        id: promo.id,
        name: promo.name,
        code: promo.code,
        type: promo.type,
        targetType: promo.targetType,
        discountValue: promo.discountValue.toNumber(),
        maxDiscountAmount: promo.maxDiscountAmount ? promo.maxDiscountAmount.toNumber() : null,
        minOrderAmount: promo.minOrderAmount ? promo.minOrderAmount.toNumber() : null,
        isStackable: promo.isStackable,
      },
      estimatedDiscount: estimatedDiscount.toNumber(),
    };
  }

  // ---------------------------------------------------------------------------
  // 9. List Promotion Usages
  // ---------------------------------------------------------------------------
  public static async listUsages(
    restaurantId: string,
    promotionId: string,
    query: { page?: number; limit?: number },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const promotion = await prisma.promotion.findFirst({
      where: { id: promotionId, restaurantId },
    });

    if (!promotion) {
      throw new AppError('Promotion not found', HttpStatus.NOT_FOUND);
    }

    const [total, usages] = await Promise.all([
      prisma.promotionUsage.count({ where: { promotionId, restaurantId } }),
      prisma.promotionUsage.findMany({
        where: { promotionId, restaurantId },
        skip,
        take: limit,
        include: {
          order: {
            select: {
              id: true,
              orderCode: true,
              orderType: true,
              grandTotal: true,
              createdAt: true,
            },
          },
          customer: { select: { id: true, name: true, phone: true } },
        },
        orderBy: { usedAt: 'desc' },
      }),
    ]);

    const formattedUsages = usages.map((u) => ({
      ...u,
      discountAmount: u.discountAmount.toNumber(),
      order: {
        ...u.order,
        grandTotal: u.order.grandTotal.toNumber(),
      },
    }));

    return {
      promotion: {
        id: promotion.id,
        name: promotion.name,
        code: promotion.code,
        usageCount: promotion.usageCount,
        usageLimit: promotion.usageLimit,
      },
      usages: formattedUsages,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // 10. Record Promotion Usages (Transactional helper called from OrderService)
  // ---------------------------------------------------------------------------
  public static async recordPromotionUsages(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    orderId: string,
    appliedPromotions: AppliedPromotionBreakdown[],
    customerId?: string | null,
  ) {
    for (const applied of appliedPromotions) {
      await tx.promotionUsage.create({
        data: {
          restaurantId,
          promotionId: applied.promotionId,
          orderId,
          customerId: customerId ?? null,
          discountAmount: applied.discountAmount,
          details: {
            name: applied.name,
            code: applied.code,
            type: applied.type,
            targetType: applied.targetType,
          },
        },
      });

      await tx.promotion.update({
        where: { id: applied.promotionId },
        data: {
          usageCount: { increment: 1 },
        },
      });
    }
  }
}
