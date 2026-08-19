import { z } from 'zod';

export const LoyaltyTransactionTypeEnum = z.enum([
  'EARN',
  'REDEEM',
  'MANUAL_ADJUSTMENT',
  'REFUND_REVERSAL',
  'EXPIRY',
]);
export type LoyaltyTransactionType = z.infer<typeof LoyaltyTransactionTypeEnum>;

export const LoyaltyRoundingModeEnum = z.enum(['FLOOR', 'ROUND', 'CEIL']);
export type LoyaltyRoundingMode = z.infer<typeof LoyaltyRoundingModeEnum>;

// -----------------------------------------------------------------------------
// 1. Loyalty Program Configuration Schemas
// -----------------------------------------------------------------------------
export const updateLoyaltyProgramSchema = z.object({
  isEnabled: z.boolean().optional(),
  programName: z.string().trim().min(1, 'Program name is required').max(100).optional(),
  pointsPerCurrencyUnit: z
    .number({ invalid_type_error: 'Points per currency unit must be a number' })
    .min(0, 'Points per currency unit cannot be negative')
    .optional(),
  redemptionRate: z
    .number({ invalid_type_error: 'Redemption rate must be a number' })
    .positive('Redemption rate must be greater than 0')
    .optional(),
  minPointsToRedeem: z
    .number()
    .int('Minimum points to redeem must be an integer')
    .min(0, 'Minimum points to redeem cannot be negative')
    .optional(),
  maxPointsPerOrder: z
    .number()
    .int('Maximum points per order must be an integer')
    .positive('Maximum points per order must be greater than 0')
    .optional()
    .nullable(),
  maxDiscountPercentage: z
    .number()
    .min(1, 'Maximum discount percentage must be at least 1%')
    .max(100, 'Maximum discount percentage cannot exceed 100%')
    .optional(),
  pointsExpiryDays: z
    .number()
    .int('Points expiry days must be an integer')
    .positive('Points expiry days must be greater than 0')
    .optional()
    .nullable(),
  roundingMode: LoyaltyRoundingModeEnum.optional(),
  minOrderSubtotal: z.number().min(0, 'Minimum order subtotal cannot be negative').optional(),
});

export type UpdateLoyaltyProgramInput = z.infer<typeof updateLoyaltyProgramSchema>;

// -----------------------------------------------------------------------------
// 2. Loyalty Tier Schemas
// -----------------------------------------------------------------------------
export const createLoyaltyTierSchema = z.object({
  name: z.string().trim().min(1, 'Tier name is required').max(50),
  minPoints: z
    .number()
    .int('Minimum points must be an integer')
    .min(0, 'Minimum points cannot be negative')
    .default(0),
  multiplier: z
    .number()
    .min(1.0, 'Points multiplier must be at least 1.0')
    .max(10.0, 'Points multiplier cannot exceed 10.0')
    .default(1.0),
  discountPercentage: z
    .number()
    .min(0, 'Discount percentage cannot be negative')
    .max(100, 'Discount percentage cannot exceed 100%')
    .default(0),
  color: z
    .string()
    .trim()
    .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, 'Color must be a valid hex code (e.g. #FFD700)')
    .optional()
    .nullable(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export type CreateLoyaltyTierInput = z.infer<typeof createLoyaltyTierSchema>;

export const updateLoyaltyTierSchema = createLoyaltyTierSchema.partial();
export type UpdateLoyaltyTierInput = z.infer<typeof updateLoyaltyTierSchema>;

export const loyaltyTierIdParamSchema = z.object({
  id: z.string().uuid('Invalid tier ID format'),
});

// -----------------------------------------------------------------------------
// 3. Customer Enrollment & Account Schemas
// -----------------------------------------------------------------------------
export const enrollCustomerSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID format'),
  initialPoints: z.number().int().min(0).optional().default(0),
});

export type EnrollCustomerInput = z.infer<typeof enrollCustomerSchema>;

export const customerIdParamSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID format'),
});

// -----------------------------------------------------------------------------
// 4. Redemption Preview Schema
// -----------------------------------------------------------------------------
export const previewRedemptionSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID format'),
  subtotal: z
    .number({ invalid_type_error: 'Subtotal must be a number' })
    .min(0, 'Subtotal cannot be negative'),
  pointsToRedeem: z
    .number()
    .int('Points to redeem must be an integer')
    .positive('Points to redeem must be greater than 0')
    .optional(),
});

export type PreviewRedemptionInput = z.infer<typeof previewRedemptionSchema>;

// -----------------------------------------------------------------------------
// 5. Manual Points Adjustment Schema
// -----------------------------------------------------------------------------
export const manualPointAdjustmentSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID format'),
  points: z
    .number()
    .int('Adjustment points must be a non-zero integer')
    .refine((val) => val !== 0, { message: 'Adjustment points cannot be 0' }),
  reason: z.string().trim().min(2, 'Reason is required for manual adjustments').max(255),
  managerPin: z
    .string()
    .regex(/^\d{4,6}$/, 'Manager PIN must be 4 to 6 digits')
    .optional(),
});

export type ManualPointAdjustmentInput = z.infer<typeof manualPointAdjustmentSchema>;

// -----------------------------------------------------------------------------
// 6. Query / Filter Schemas
// -----------------------------------------------------------------------------
export const listLoyaltyAccountsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  tierId: z.string().uuid().optional(),
  isActive: z
    .string()
    .optional()
    .transform((val) => (val === undefined ? undefined : val === 'true')),
});

export type ListLoyaltyAccountsQuery = z.infer<typeof listLoyaltyAccountsQuerySchema>;

export const listLoyaltyTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  customerId: z.string().uuid().optional(),
  type: LoyaltyTransactionTypeEnum.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type ListLoyaltyTransactionsQuery = z.infer<typeof listLoyaltyTransactionsQuerySchema>;
