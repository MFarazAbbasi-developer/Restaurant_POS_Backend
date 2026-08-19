import { z } from 'zod';

export const orderTypeEnum = z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']);
export const orderStatusEnum = z.enum([
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'SERVED',
  'COMPLETED',
  'CANCELLED',
  'VOIDED',
]);
export const orderPaymentStatusEnum = z.enum(['UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUNDED']);
export const discountTypeEnum = z.enum(['PERCENTAGE', 'FIXED_AMOUNT']);

export const orderItemInputSchema = z
  .object({
    menuItemId: z.string().uuid('Invalid menu item ID'),
    variantId: z.string().uuid('Invalid variant ID').optional(),
    quantity: z.number().int().min(1, 'Quantity must be at least 1').max(100).default(1),
    modifierIds: z.array(z.string().uuid('Invalid modifier ID')).optional().default([]),
    discountType: discountTypeEnum.optional(),
    discountValue: z.number().min(0, 'Discount value cannot be negative').optional(),
    specialInstructions: z.string().trim().max(255).optional(),
  })
  .strict();

export const createOrderSchema = z
  .object({
    orderType: orderTypeEnum.default('DINE_IN'),
    items: z.array(orderItemInputSchema).min(1, 'Order must contain at least one item'),
    tableId: z.string().uuid('Invalid table ID').optional(),
    tableOrderId: z.string().uuid('Invalid table order ID').optional(),
    guestCount: z.number().int().min(1).max(100).optional().default(1),
    customerId: z.string().uuid('Invalid customer ID').optional(),
    customerName: z.string().trim().min(1).max(100).optional(),
    customerPhone: z.string().trim().min(3).max(30).optional(),
    deliveryAddress: z.string().trim().min(3).max(255).optional(),
    deliveryZoneId: z.string().uuid('Invalid delivery zone ID').optional(),
    flatDeliveryFee: z.number().min(0).optional(),
    packagingCharge: z.number().min(0).optional(),
    notes: z.string().trim().max(500).optional(),
    promoCode: z.string().trim().toUpperCase().optional(),
    pointsToRedeem: z.number().int().min(1, 'Points to redeem must be at least 1').optional(),
    paymentMethod: z.string().trim().max(50).optional().default('CASH'),
    isAggregator: z.boolean().optional().default(false),
    aggregatorName: z.string().trim().max(100).optional(),
    aggregatorReference: z.string().trim().max(100).optional(),
  })
  .strict();

export const addOrderItemsSchema = z
  .object({
    items: z.array(orderItemInputSchema).min(1, 'At least one item is required'),
  })
  .strict();

export const voidOrderItemSchema = z
  .object({
    voidReason: z.string().trim().min(1, 'Void reason is required').max(255),
    managerPin: z.string().trim().min(4).max(6).optional(),
  })
  .strict();

export const applyOrderDiscountSchema = z
  .object({
    discountType: discountTypeEnum,
    discountValue: z.number().min(0, 'Discount value cannot be negative'),
    discountReason: z.string().trim().min(1, 'Discount reason is required').max(255),
    managerPin: z.string().trim().min(4).max(6).optional(),
  })
  .strict();

export const updateOrderStatusSchema = z
  .object({
    status: orderStatusEnum,
  })
  .strict();

export const cancelOrderSchema = z
  .object({
    reason: z.string().trim().min(1, 'Cancellation reason is required').max(255),
  })
  .strict();

export const voidOrderSchema = z
  .object({
    voidReason: z.string().trim().min(1, 'Void reason is required').max(255),
    managerPin: z.string().trim().min(4).max(6).optional(),
  })
  .strict();

export const listOrdersQuerySchema = z.object({
  status: orderStatusEnum.optional(),
  orderType: orderTypeEnum.optional(),
  paymentStatus: orderPaymentStatusEnum.optional(),
  tableId: z.string().uuid().optional(),
  businessDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Business date must be in YYYY-MM-DD format')
    .optional(),
  search: z.string().trim().max(50).optional(),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? Math.max(1, parseInt(val, 10)) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(val, 10))) : 20)),
});

export const orderIdParamSchema = z.object({
  id: z.string().uuid('Invalid order ID format'),
});

export const orderItemParamSchema = z.object({
  id: z.string().uuid('Invalid order ID format'),
  itemId: z.string().uuid('Invalid item ID format'),
});

export const tableIdParamSchema = z.object({
  tableId: z.string().uuid('Invalid table ID format'),
});
