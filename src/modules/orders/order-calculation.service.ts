import { Prisma } from '@prisma/client';

export interface CalculatedItemModifier {
  modifierId: string;
  modifierGroupId?: string | null;
  name: string;
  priceAdjustment: Prisma.Decimal;
}

export interface CalculatedOrderItem {
  menuItemId: string;
  variantId?: string | null;
  itemName: string;
  variantName?: string | null;
  quantity: number;
  unitPrice: Prisma.Decimal;
  modifiersPrice: Prisma.Decimal;
  itemGrossTotal: Prisma.Decimal;
  discountType?: 'PERCENTAGE' | 'FIXED_AMOUNT' | null;
  discountValue?: Prisma.Decimal | null;
  discountAmount: Prisma.Decimal;
  itemNetTotal: Prisma.Decimal;
  specialInstructions?: string | null;
  modifiers: CalculatedItemModifier[];
}

export interface OrderCalculationInput {
  items: CalculatedOrderItem[];
  orderDiscountType?: 'PERCENTAGE' | 'FIXED_AMOUNT' | null;
  orderDiscountValue?: number | Prisma.Decimal | null;
  orderDiscountReason?: string | null;
  promoCode?: string | null;
  promotionDiscount?: number | Prisma.Decimal | null;
  loyaltyPointsRedeemed?: number | null;
  loyaltyDiscount?: number | Prisma.Decimal | null;
  taxRate?: number | Prisma.Decimal | null;
  taxInclusive?: boolean;
  serviceChargeRate?: number | Prisma.Decimal | null;
  serviceChargeEnabled?: boolean;
  deliveryCharge?: number | Prisma.Decimal | null;
  packagingCharge?: number | Prisma.Decimal | null;
}

export interface OrderCalculationResult {
  subtotal: Prisma.Decimal;
  itemDiscountsTotal: Prisma.Decimal;
  orderDiscountType: 'PERCENTAGE' | 'FIXED_AMOUNT' | null;
  orderDiscountValue: Prisma.Decimal | null;
  orderDiscountAmount: Prisma.Decimal;
  orderDiscountReason: string | null;
  promoCode: string | null;
  promotionDiscount: Prisma.Decimal;
  loyaltyPointsRedeemed: number;
  loyaltyDiscount: Prisma.Decimal;
  totalDiscount: Prisma.Decimal;
  discountedSubtotal: Prisma.Decimal;
  taxRate: Prisma.Decimal | null;
  taxInclusive: boolean;
  taxAmount: Prisma.Decimal;
  serviceChargeRate: Prisma.Decimal | null;
  serviceChargeAmount: Prisma.Decimal;
  deliveryCharge: Prisma.Decimal;
  packagingCharge: Prisma.Decimal;
  roundingAmount: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
}

export class OrderCalculationService {
  /**
   * Calculates a single order item's financial values (gross, discount, net).
   */
  public static calculateItemTotals(params: {
    unitPrice: Prisma.Decimal | number;
    quantity: number;
    modifiers: CalculatedItemModifier[];
    discountType?: 'PERCENTAGE' | 'FIXED_AMOUNT' | null | undefined;
    discountValue?: Prisma.Decimal | number | null | undefined;
  }): {
    unitPrice: Prisma.Decimal;
    modifiersPrice: Prisma.Decimal;
    itemGrossTotal: Prisma.Decimal;
    discountType: 'PERCENTAGE' | 'FIXED_AMOUNT' | null;
    discountValue: Prisma.Decimal | null;
    discountAmount: Prisma.Decimal;
    itemNetTotal: Prisma.Decimal;
  } {
    const unitPriceDec = new Prisma.Decimal(params.unitPrice);
    const modifiersSum = params.modifiers.reduce(
      (sum, mod) => sum.add(mod.priceAdjustment),
      new Prisma.Decimal(0),
    );

    const pricePerUnit = unitPriceDec.add(modifiersSum);
    const itemGrossTotal = pricePerUnit.mul(params.quantity);

    let discountAmount = new Prisma.Decimal(0);
    let discountValueDec: Prisma.Decimal | null = null;
    const discountType = params.discountType ?? null;

    if (params.discountValue !== undefined && params.discountValue !== null && discountType) {
      discountValueDec = new Prisma.Decimal(params.discountValue);
      if (discountType === 'PERCENTAGE') {
        const rate = Prisma.Decimal.min(new Prisma.Decimal(100), discountValueDec).div(100);
        discountAmount = itemGrossTotal.mul(rate);
      } else {
        // FIXED_AMOUNT
        discountAmount = Prisma.Decimal.min(itemGrossTotal, discountValueDec);
      }
    }

    const itemNetTotal = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      itemGrossTotal.sub(discountAmount),
    );

    return {
      unitPrice: unitPriceDec,
      modifiersPrice: modifiersSum,
      itemGrossTotal,
      discountType,
      discountValue: discountValueDec,
      discountAmount,
      itemNetTotal,
    };
  }

  /**
   * Calculates overall order financial breakdown with tax, discounts, and charges.
   */
  public static calculateOrderTotals(input: OrderCalculationInput): OrderCalculationResult {
    // 1. Calculate items subtotal and item-level discounts
    let subtotal = new Prisma.Decimal(0);
    let itemDiscountsTotal = new Prisma.Decimal(0);

    for (const item of input.items) {
      subtotal = subtotal.add(item.itemGrossTotal);
      itemDiscountsTotal = itemDiscountsTotal.add(item.discountAmount);
    }

    const subtotalAfterItemDiscounts = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      subtotal.sub(itemDiscountsTotal),
    );

    // 2. Order-level discount
    let orderDiscountAmount = new Prisma.Decimal(0);
    let orderDiscountValueDec: Prisma.Decimal | null = null;
    const orderDiscountType = input.orderDiscountType ?? null;

    if (
      input.orderDiscountValue !== undefined &&
      input.orderDiscountValue !== null &&
      orderDiscountType
    ) {
      orderDiscountValueDec = new Prisma.Decimal(input.orderDiscountValue);
      if (orderDiscountType === 'PERCENTAGE') {
        const rate = Prisma.Decimal.min(new Prisma.Decimal(100), orderDiscountValueDec).div(100);
        orderDiscountAmount = subtotalAfterItemDiscounts.mul(rate);
      } else {
        // FIXED_AMOUNT
        orderDiscountAmount = Prisma.Decimal.min(subtotalAfterItemDiscounts, orderDiscountValueDec);
      }
    }

    const promotionDiscountDec = input.promotionDiscount
      ? new Prisma.Decimal(input.promotionDiscount)
      : new Prisma.Decimal(0);

    const loyaltyDiscountDec = input.loyaltyDiscount
      ? new Prisma.Decimal(input.loyaltyDiscount)
      : new Prisma.Decimal(0);

    const loyaltyPointsRedeemed = input.loyaltyPointsRedeemed ?? 0;

    const totalDiscount = itemDiscountsTotal
      .add(orderDiscountAmount)
      .add(promotionDiscountDec)
      .add(loyaltyDiscountDec);

    const discountedSubtotal = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      subtotal.sub(totalDiscount),
    );

    // 3. Service Charge
    let serviceChargeAmount = new Prisma.Decimal(0);
    let serviceChargeRateDec: Prisma.Decimal | null = null;

    if (input.serviceChargeEnabled && input.serviceChargeRate) {
      serviceChargeRateDec = new Prisma.Decimal(input.serviceChargeRate);
      if (serviceChargeRateDec.greaterThan(0)) {
        serviceChargeAmount = discountedSubtotal.mul(serviceChargeRateDec.div(100));
      }
    }

    // 4. Tax Calculation
    const taxInclusive = input.taxInclusive ?? false;
    let taxAmount = new Prisma.Decimal(0);
    let taxRateDec: Prisma.Decimal | null = null;

    if (input.taxRate !== undefined && input.taxRate !== null) {
      taxRateDec = new Prisma.Decimal(input.taxRate);
      if (taxRateDec.greaterThan(0)) {
        const taxableBase = discountedSubtotal.add(serviceChargeAmount);
        if (taxInclusive) {
          // Inclusive Tax: Tax = Base - (Base / (1 + Rate/100))
          const factor = new Prisma.Decimal(1).add(taxRateDec.div(100));
          const netBase = taxableBase.div(factor);
          taxAmount = taxableBase.sub(netBase);
        } else {
          // Exclusive Tax: Tax = Base * Rate/100
          taxAmount = taxableBase.mul(taxRateDec.div(100));
        }
      }
    }

    // 5. Delivery & Packaging Charges
    const deliveryCharge = new Prisma.Decimal(input.deliveryCharge ?? 0);
    const packagingCharge = new Prisma.Decimal(input.packagingCharge ?? 0);
    const roundingAmount = new Prisma.Decimal(0);

    // 6. Grand Total
    let grandTotal = discountedSubtotal
      .add(taxInclusive ? new Prisma.Decimal(0) : taxAmount)
      .add(serviceChargeAmount)
      .add(deliveryCharge)
      .add(packagingCharge)
      .add(roundingAmount);

    grandTotal = Prisma.Decimal.max(new Prisma.Decimal(0), grandTotal);

    return {
      subtotal: subtotal.toDecimalPlaces(2),
      itemDiscountsTotal: itemDiscountsTotal.toDecimalPlaces(2),
      orderDiscountType,
      orderDiscountValue: orderDiscountValueDec ? orderDiscountValueDec.toDecimalPlaces(2) : null,
      orderDiscountAmount: orderDiscountAmount.toDecimalPlaces(2),
      orderDiscountReason: input.orderDiscountReason ?? null,
      promoCode: input.promoCode ?? null,
      promotionDiscount: promotionDiscountDec.toDecimalPlaces(2),
      loyaltyPointsRedeemed,
      loyaltyDiscount: loyaltyDiscountDec.toDecimalPlaces(2),
      totalDiscount: totalDiscount.toDecimalPlaces(2),
      discountedSubtotal: discountedSubtotal.toDecimalPlaces(2),
      taxRate: taxRateDec ? taxRateDec.toDecimalPlaces(2) : null,
      taxInclusive,
      taxAmount: taxAmount.toDecimalPlaces(2),
      serviceChargeRate: serviceChargeRateDec ? serviceChargeRateDec.toDecimalPlaces(2) : null,
      serviceChargeAmount: serviceChargeAmount.toDecimalPlaces(2),
      deliveryCharge: deliveryCharge.toDecimalPlaces(2),
      packagingCharge: packagingCharge.toDecimalPlaces(2),
      roundingAmount: roundingAmount.toDecimalPlaces(2),
      grandTotal: grandTotal.toDecimalPlaces(2),
    };
  }
}
