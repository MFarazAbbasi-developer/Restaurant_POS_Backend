import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { OrderType } from './promotion.schema.js';

export interface PromotionCandidateItem {
  id?: string;
  menuItemId: string;
  variantId?: string | null | undefined;
  categoryId?: string | null | undefined;
  name?: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  modifiersPrice?: Prisma.Decimal;
  itemGrossTotal: Prisma.Decimal;
}

export interface PromotionEvaluationContext {
  restaurantId: string;
  orderType: OrderType;
  customerId?: string | null | undefined;
  promoCode?: string | null | undefined;
  items: PromotionCandidateItem[];
  subtotal: Prisma.Decimal;
  currentTime?: Date;
}

export interface AppliedPromotionBreakdown {
  promotionId: string;
  name: string;
  code?: string | null;
  type: string;
  targetType: string;
  discountAmount: Prisma.Decimal;
  details?: Record<string, unknown>;
}

export interface PromotionEvaluationResult {
  isQualified: boolean;
  totalPromotionDiscount: Prisma.Decimal;
  appliedPromotions: AppliedPromotionBreakdown[];
  itemPromotions: Map<string, Prisma.Decimal>; // key: menuItemId or item index, value: discount
  appliedPromoCode?: string | null;
}

export class PromotionEngine {
  /**
   * Evaluates all active promotions against the given order context and returns optimal discount breakdown.
   */
  public static async evaluatePromotions(
    context: PromotionEvaluationContext,
  ): Promise<PromotionEvaluationResult> {
    const now = context.currentTime ?? new Date();

    // 1. Fetch menu item category map if items don't have categoryId populated
    const itemIdsToFetch = context.items.filter((it) => !it.categoryId).map((it) => it.menuItemId);

    const categoryMap = new Map<string, string>();
    if (itemIdsToFetch.length > 0) {
      const menuItems = await prisma.menuItem.findMany({
        where: { id: { in: itemIdsToFetch } },
        select: { id: true, categoryId: true },
      });
      for (const mi of menuItems) {
        categoryMap.set(mi.id, mi.categoryId);
      }
    }

    // Enrich items with categoryId
    const enrichedItems: PromotionCandidateItem[] = context.items.map((it) => ({
      ...it,
      categoryId: it.categoryId ?? categoryMap.get(it.menuItemId) ?? null,
    }));

    // 2. Fetch all active promotions for the restaurant
    const allPromotions = await prisma.promotion.findMany({
      where: {
        restaurantId: context.restaurantId,
        isActive: true,
      },
      include: {
        menuItems: { select: { menuItemId: true } },
        categories: { select: { categoryId: true } },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });

    if (allPromotions.length === 0) {
      return {
        isQualified: false,
        totalPromotionDiscount: new Prisma.Decimal(0),
        appliedPromotions: [],
        itemPromotions: new Map(),
      };
    }

    // 3. Filter candidates based on eligibility
    const eligiblePromotionsWithSavings: {
      promotion: (typeof allPromotions)[0];
      discount: Prisma.Decimal;
      itemDiscounts: Map<string, Prisma.Decimal>;
      isCodeMatch: boolean;
    }[] = [];

    for (const promo of allPromotions) {
      const eligibility = await this.checkEligibility(promo, context, now);
      if (!eligibility.eligible) {
        continue;
      }

      // Check code matching
      const isCodePromo = Boolean(promo.code);
      const isCodeMatch =
        isCodePromo &&
        Boolean(context.promoCode) &&
        promo.code!.toUpperCase() === context.promoCode!.toUpperCase();

      // If promotion requires a code and this isn't the entered code, skip it
      if (isCodePromo && !isCodeMatch) {
        continue;
      }

      // If it's not a code promo and not auto-apply, skip unless explicitly entered
      if (!isCodePromo && !promo.isAutoApply) {
        continue;
      }

      // Calculate discount for this promo
      const calcResult = this.calculatePromotionDiscount(promo, enrichedItems, context.subtotal);
      if (calcResult.discount.greaterThan(0)) {
        eligiblePromotionsWithSavings.push({
          promotion: promo,
          discount: calcResult.discount,
          itemDiscounts: calcResult.itemDiscounts,
          isCodeMatch,
        });
      }
    }

    if (eligiblePromotionsWithSavings.length === 0) {
      return {
        isQualified: false,
        totalPromotionDiscount: new Prisma.Decimal(0),
        appliedPromotions: [],
        itemPromotions: new Map(),
      };
    }

    // 4. Resolve conflicts and stacking
    // Explicit promo code match gets highest precedence
    const codeMatchPromo = eligiblePromotionsWithSavings.find((p) => p.isCodeMatch);

    let selectedPromotions: typeof eligiblePromotionsWithSavings = [];

    if (codeMatchPromo) {
      // If the code promotion is stackable, combine with other stackable auto promotions
      if (codeMatchPromo.promotion.isStackable) {
        selectedPromotions.push(codeMatchPromo);
        for (const p of eligiblePromotionsWithSavings) {
          if (p.promotion.id !== codeMatchPromo.promotion.id && p.promotion.isStackable) {
            selectedPromotions.push(p);
          }
        }
      } else {
        selectedPromotions = [codeMatchPromo];
      }
    } else {
      // Sort: highest priority first, then highest savings
      eligiblePromotionsWithSavings.sort((a, b) => {
        if (b.promotion.priority !== a.promotion.priority) {
          return b.promotion.priority - a.promotion.priority;
        }
        return b.discount.comparedTo(a.discount);
      });

      const topPromo = eligiblePromotionsWithSavings[0];
      if (topPromo && topPromo.promotion.isStackable) {
        selectedPromotions = eligiblePromotionsWithSavings.filter((p) => p.promotion.isStackable);
      } else if (topPromo) {
        selectedPromotions = [topPromo];
      }
    }

    // 5. Aggregate discounts and ensure total discount never exceeds subtotal
    let totalDiscount = new Prisma.Decimal(0);
    const appliedPromosBreakdown: AppliedPromotionBreakdown[] = [];
    const aggregatedItemDiscounts = new Map<string, Prisma.Decimal>();

    for (const sel of selectedPromotions) {
      // Remaining subtotal available for discounting
      const remainingSubtotal = Prisma.Decimal.max(
        new Prisma.Decimal(0),
        context.subtotal.sub(totalDiscount),
      );

      const effectiveDiscount = Prisma.Decimal.min(sel.discount, remainingSubtotal);
      if (effectiveDiscount.greaterThan(0)) {
        totalDiscount = totalDiscount.add(effectiveDiscount);

        appliedPromosBreakdown.push({
          promotionId: sel.promotion.id,
          name: sel.promotion.name,
          code: sel.promotion.code,
          type: sel.promotion.type,
          targetType: sel.promotion.targetType,
          discountAmount: effectiveDiscount.toDecimalPlaces(2),
        });

        // Merge item discounts
        sel.itemDiscounts.forEach((amt, key) => {
          const current = aggregatedItemDiscounts.get(key) ?? new Prisma.Decimal(0);
          aggregatedItemDiscounts.set(key, current.add(amt).toDecimalPlaces(2));
        });
      }
    }

    return {
      isQualified: appliedPromosBreakdown.length > 0,
      totalPromotionDiscount: totalDiscount.toDecimalPlaces(2),
      appliedPromotions: appliedPromosBreakdown,
      itemPromotions: aggregatedItemDiscounts,
      appliedPromoCode: codeMatchPromo?.promotion.code ?? null,
    };
  }

  /**
   * Checks whether a single promotion meets contextual qualification rules.
   */
  public static async checkEligibility(
    promotion: {
      id: string;
      restaurantId: string;
      isActive: boolean;
      startDate: Date | null;
      endDate: Date | null;
      startTime: string | null;
      endTime: string | null;
      daysOfWeek: unknown;
      orderTypes: unknown;
      minOrderAmount: Prisma.Decimal | null;
      usageLimit: number | null;
      usageCount: number;
      perCustomerLimit: number | null;
      customerId: string | null;
    },
    context: PromotionEvaluationContext,
    now: Date = new Date(),
  ): Promise<{ eligible: boolean; reason?: string }> {
    // 1. Active flag
    if (!promotion.isActive) {
      return { eligible: false, reason: 'Promotion is inactive' };
    }

    // 2. Date window
    if (promotion.startDate && now < promotion.startDate) {
      return { eligible: false, reason: 'Promotion has not started yet' };
    }
    if (promotion.endDate && now > promotion.endDate) {
      return { eligible: false, reason: 'Promotion has expired' };
    }

    // 3. Days of week check
    if (Array.isArray(promotion.daysOfWeek) && promotion.daysOfWeek.length > 0) {
      const currentDay = now.getDay();
      if (!promotion.daysOfWeek.includes(currentDay)) {
        return { eligible: false, reason: 'Promotion is not active on this day of the week' };
      }
    }

    // 4. Time of day check (HH:MM)
    if (promotion.startTime || promotion.endTime) {
      const currentHours = String(now.getHours()).padStart(2, '0');
      const currentMinutes = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${currentHours}:${currentMinutes}`;

      if (promotion.startTime && currentTimeStr < promotion.startTime) {
        return { eligible: false, reason: `Promotion is only active after ${promotion.startTime}` };
      }
      if (promotion.endTime && currentTimeStr > promotion.endTime) {
        return { eligible: false, reason: `Promotion ended at ${promotion.endTime}` };
      }
    }

    // 5. Order type check
    if (Array.isArray(promotion.orderTypes) && promotion.orderTypes.length > 0) {
      if (!promotion.orderTypes.includes(context.orderType)) {
        return {
          eligible: false,
          reason: `Promotion is not valid for ${context.orderType} orders`,
        };
      }
    }

    // 6. Customer-exclusive check
    if (promotion.customerId && promotion.customerId !== context.customerId) {
      return { eligible: false, reason: 'Promotion is exclusive to another customer' };
    }

    // 7. Global usage limit
    if (promotion.usageLimit !== null && promotion.usageCount >= promotion.usageLimit) {
      return { eligible: false, reason: 'Promotion global usage limit has been reached' };
    }

    // 8. Per-customer usage limit
    if (promotion.perCustomerLimit !== null && context.customerId) {
      const userUsageCount = await prisma.promotionUsage.count({
        where: {
          promotionId: promotion.id,
          customerId: context.customerId,
        },
      });

      if (userUsageCount >= promotion.perCustomerLimit) {
        return {
          eligible: false,
          reason: 'Customer has reached the maximum usage limit for this promotion',
        };
      }
    }

    // 9. Minimum order subtotal check
    if (promotion.minOrderAmount) {
      if (context.subtotal.lessThan(promotion.minOrderAmount)) {
        return {
          eligible: false,
          reason: `Minimum order amount of ${promotion.minOrderAmount.toFixed(2)} required`,
        };
      }
    }

    return { eligible: true };
  }

  /**
   * Calculates the exact monetary discount for an eligible promotion.
   */
  public static calculatePromotionDiscount(
    promotion: {
      type: string;
      targetType: string;
      discountValue: Prisma.Decimal;
      maxDiscountAmount: Prisma.Decimal | null;
      minQuantity: number | null;
      buyQuantity: number | null;
      getQuantity: number | null;
      getDiscountPercentage: Prisma.Decimal | null;
      menuItems?: { menuItemId: string }[];
      categories?: { categoryId: string }[];
    },
    items: PromotionCandidateItem[],
    subtotal: Prisma.Decimal,
  ): { discount: Prisma.Decimal; itemDiscounts: Map<string, Prisma.Decimal> } {
    const itemDiscounts = new Map<string, Prisma.Decimal>();
    let totalDiscount = new Prisma.Decimal(0);

    // Filter matching items based on targetType
    let qualifyingItems: PromotionCandidateItem[] = [];

    if (promotion.targetType === 'ORDER') {
      qualifyingItems = items;
    } else if (promotion.targetType === 'ITEM') {
      const targetMenuItemIds = new Set((promotion.menuItems ?? []).map((m) => m.menuItemId));
      qualifyingItems = items.filter((it) => targetMenuItemIds.has(it.menuItemId));
    } else if (promotion.targetType === 'CATEGORY') {
      const targetCategoryIds = new Set((promotion.categories ?? []).map((c) => c.categoryId));
      qualifyingItems = items.filter((it) => it.categoryId && targetCategoryIds.has(it.categoryId));
    }

    if (qualifyingItems.length === 0) {
      return { discount: new Prisma.Decimal(0), itemDiscounts };
    }

    // Check minQuantity if required
    if (promotion.minQuantity && promotion.minQuantity > 0) {
      const totalQualifyingQty = qualifyingItems.reduce((sum, it) => sum + it.quantity, 0);
      if (totalQualifyingQty < promotion.minQuantity) {
        return { discount: new Prisma.Decimal(0), itemDiscounts };
      }
    }

    // Compute discount by PromotionType
    if (promotion.type === 'PERCENTAGE') {
      const qualifyingGross = qualifyingItems.reduce(
        (sum, it) => sum.add(it.itemGrossTotal),
        new Prisma.Decimal(0),
      );

      const rate = Prisma.Decimal.min(new Prisma.Decimal(100), promotion.discountValue).div(100);
      let disc = qualifyingGross.mul(rate);

      if (promotion.maxDiscountAmount && disc.greaterThan(promotion.maxDiscountAmount)) {
        disc = promotion.maxDiscountAmount;
      }

      totalDiscount = Prisma.Decimal.min(disc, qualifyingGross);

      // Distribute proportionally across qualifying items
      if (qualifyingGross.greaterThan(0)) {
        for (const item of qualifyingItems) {
          const itemPortion = item.itemGrossTotal.div(qualifyingGross).mul(totalDiscount);
          itemDiscounts.set(item.menuItemId, itemPortion.toDecimalPlaces(2));
        }
      }
    } else if (promotion.type === 'FIXED_AMOUNT') {
      const qualifyingGross = qualifyingItems.reduce(
        (sum, it) => sum.add(it.itemGrossTotal),
        new Prisma.Decimal(0),
      );

      let disc = promotion.discountValue;
      if (promotion.maxDiscountAmount && disc.greaterThan(promotion.maxDiscountAmount)) {
        disc = promotion.maxDiscountAmount;
      }

      totalDiscount = Prisma.Decimal.min(disc, qualifyingGross);

      // Distribute across qualifying items
      if (qualifyingGross.greaterThan(0)) {
        for (const item of qualifyingItems) {
          const itemPortion = item.itemGrossTotal.div(qualifyingGross).mul(totalDiscount);
          itemDiscounts.set(item.menuItemId, itemPortion.toDecimalPlaces(2));
        }
      }
    } else if (promotion.type === 'BUY_X_GET_Y') {
      // Buy X Get Y (e.g. Buy 2 Get 1 Free or at Z% discount)
      const buyQty = promotion.buyQuantity ?? 1;
      const getQty = promotion.getQuantity ?? 1;
      const setSize = buyQty + getQty;
      const getDiscRate = (promotion.getDiscountPercentage ?? new Prisma.Decimal(100)).div(100);

      // Expand qualifying items into individual unit portions sorted by unit price ascending (cheapest free)
      const individualUnits: { menuItemId: string; unitPrice: Prisma.Decimal }[] = [];
      for (const item of qualifyingItems) {
        const singleUnitPrice = item.itemGrossTotal.div(item.quantity);
        for (let i = 0; i < item.quantity; i++) {
          individualUnits.push({
            menuItemId: item.menuItemId,
            unitPrice: singleUnitPrice,
          });
        }
      }

      // Sort ascending so discount applies to cheapest items in sets
      individualUnits.sort((a, b) => a.unitPrice.comparedTo(b.unitPrice));

      const totalUnits = individualUnits.length;
      const completedSets = Math.floor(totalUnits / setSize);

      if (completedSets > 0) {
        const freeUnitsCount = completedSets * getQty;
        const discountedUnits = individualUnits.slice(0, freeUnitsCount);

        for (const unit of discountedUnits) {
          const unitDisc = unit.unitPrice.mul(getDiscRate);
          totalDiscount = totalDiscount.add(unitDisc);

          const cur = itemDiscounts.get(unit.menuItemId) ?? new Prisma.Decimal(0);
          itemDiscounts.set(unit.menuItemId, cur.add(unitDisc).toDecimalPlaces(2));
        }
      }
    } else if (promotion.type === 'FREE_ITEM') {
      // Free item gives 100% discount on cheapest qualifying item
      if (qualifyingItems.length > 0 && qualifyingItems[0]) {
        // Find cheapest item
        let cheapest = qualifyingItems[0];
        for (const it of qualifyingItems) {
          const itPrice = it.itemGrossTotal.div(it.quantity);
          const chPrice = cheapest.itemGrossTotal.div(cheapest.quantity);
          if (itPrice.lessThan(chPrice)) {
            cheapest = it;
          }
        }
        const freeVal = cheapest.itemGrossTotal.div(cheapest.quantity);
        totalDiscount = freeVal;
        itemDiscounts.set(cheapest.menuItemId, freeVal.toDecimalPlaces(2));
      }
    }

    // Safety constraint: discount cannot exceed subtotal
    totalDiscount = Prisma.Decimal.min(totalDiscount, subtotal).toDecimalPlaces(2);

    return { discount: totalDiscount, itemDiscounts };
  }
}
