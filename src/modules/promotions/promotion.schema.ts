import { z } from 'zod';

export const PromotionTypeEnum = z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'BUY_X_GET_Y', 'FREE_ITEM']);
export type PromotionType = z.infer<typeof PromotionTypeEnum>;

export const PromotionTargetTypeEnum = z.enum(['ORDER', 'ITEM', 'CATEGORY']);
export type PromotionTargetType = z.infer<typeof PromotionTargetTypeEnum>;

export const OrderTypeEnum = z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']);
export type OrderType = z.infer<typeof OrderTypeEnum>;

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const basePromotionSchema = z.object({
  name: z.string().trim().min(1, 'Promotion name is required').max(100),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'Promo code must be at least 2 characters')
    .max(30, 'Promo code cannot exceed 30 characters')
    .regex(
      /^[A-Z0-9_-]+$/,
      'Promo code can only contain letters, numbers, hyphens, and underscores',
    )
    .optional()
    .nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  type: PromotionTypeEnum.default('PERCENTAGE'),
  targetType: PromotionTargetTypeEnum.default('ORDER'),
  discountValue: z
    .number({ invalid_type_error: 'Discount value must be a number' })
    .min(0, 'Discount value cannot be negative')
    .default(0),
  maxDiscountAmount: z
    .number()
    .positive('Maximum discount amount must be greater than 0')
    .optional()
    .nullable(),
  minOrderAmount: z
    .number()
    .min(0, 'Minimum order amount cannot be negative')
    .optional()
    .nullable(),
  minQuantity: z
    .number()
    .int()
    .positive('Minimum quantity must be at least 1')
    .optional()
    .nullable(),
  buyQuantity: z.number().int().positive('Buy quantity must be at least 1').optional().nullable(),
  getQuantity: z.number().int().positive('Get quantity must be at least 1').optional().nullable(),
  getDiscountPercentage: z
    .number()
    .min(0)
    .max(100, 'Reward discount percentage cannot exceed 100%')
    .default(100)
    .optional()
    .nullable(),
  orderTypes: z.array(OrderTypeEnum).optional().nullable(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional().nullable(),
  startDate: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/))
    .optional()
    .nullable(),
  endDate: z
    .string()
    .datetime({ offset: true })
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/))
    .optional()
    .nullable(),
  startTime: z
    .string()
    .regex(timeRegex, 'Start time must be in HH:MM format (24h)')
    .optional()
    .nullable(),
  endTime: z
    .string()
    .regex(timeRegex, 'End time must be in HH:MM format (24h)')
    .optional()
    .nullable(),
  isActive: z.boolean().default(true),
  isAutoApply: z.boolean().default(false),
  isStackable: z.boolean().default(false),
  priority: z.number().int().min(0).default(0),
  usageLimit: z
    .number()
    .int()
    .positive('Global usage limit must be at least 1')
    .optional()
    .nullable(),
  perCustomerLimit: z
    .number()
    .int()
    .positive('Per customer limit must be at least 1')
    .optional()
    .nullable(),
  customerId: z.string().uuid('Invalid customer ID format').optional().nullable(),
  menuItemIds: z.array(z.string().uuid('Invalid menu item ID')).optional().default([]),
  categoryIds: z.array(z.string().uuid('Invalid category ID')).optional().default([]),
});

export const createPromotionSchema = basePromotionSchema
  .refine(
    (data) => {
      if (data.type === 'PERCENTAGE' && data.discountValue > 100) {
        return false;
      }
      return true;
    },
    {
      message: 'Percentage discount cannot exceed 100%',
      path: ['discountValue'],
    },
  )
  .refine(
    (data) => {
      if (data.type === 'BUY_X_GET_Y') {
        return Boolean(data.buyQuantity && data.getQuantity);
      }
      return true;
    },
    {
      message: 'Buy quantity and Get quantity are required for BUY_X_GET_Y promotions',
      path: ['buyQuantity'],
    },
  )
  .refine(
    (data) => {
      if (data.targetType === 'ITEM' && (!data.menuItemIds || data.menuItemIds.length === 0)) {
        return false;
      }
      return true;
    },
    {
      message: 'At least one menu item ID must be provided when targetType is ITEM',
      path: ['menuItemIds'],
    },
  )
  .refine(
    (data) => {
      if (data.targetType === 'CATEGORY' && (!data.categoryIds || data.categoryIds.length === 0)) {
        return false;
      }
      return true;
    },
    {
      message: 'At least one category ID must be provided when targetType is CATEGORY',
      path: ['categoryIds'],
    },
  );

export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;

export const updatePromotionSchema = basePromotionSchema.partial();
export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>;

export const listPromotionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  type: PromotionTypeEnum.optional(),
  targetType: PromotionTargetTypeEnum.optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  isAutoApply: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  orderType: OrderTypeEnum.optional(),
  hasCode: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export type ListPromotionsQuery = z.infer<typeof listPromotionsQuerySchema>;

export const previewPromotionItemSchema = z.object({
  menuItemId: z.string().uuid('Invalid menu item ID format'),
  variantId: z.string().uuid('Invalid variant ID format').optional().nullable(),
  quantity: z.number().int().positive('Item quantity must be at least 1'),
  unitPrice: z.number().min(0).optional(),
  modifiersPrice: z.number().min(0).optional(),
  modifierIds: z.array(z.string().uuid()).optional().default([]),
});

export const previewPromotionsSchema = z.object({
  orderType: OrderTypeEnum.default('DINE_IN'),
  customerId: z.string().uuid('Invalid customer ID').optional().nullable(),
  promoCode: z.string().trim().toUpperCase().optional().nullable(),
  items: z
    .array(previewPromotionItemSchema)
    .min(1, 'At least one item required to preview promotions'),
  orderDiscountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).optional().nullable(),
  orderDiscountValue: z.number().min(0).optional().nullable(),
});
export type PreviewPromotionsInput = z.infer<typeof previewPromotionsSchema>;

export const validatePromoCodeSchema = z.object({
  code: z.string().trim().toUpperCase().min(1, 'Promo code is required'),
  orderType: OrderTypeEnum.default('DINE_IN'),
  customerId: z.string().uuid('Invalid customer ID').optional().nullable(),
  items: z.array(previewPromotionItemSchema).optional().default([]),
});
export type ValidatePromoCodeInput = z.infer<typeof validatePromoCodeSchema>;

export const promotionIdParamSchema = z.object({
  id: z.string().uuid('Invalid promotion ID format'),
});
