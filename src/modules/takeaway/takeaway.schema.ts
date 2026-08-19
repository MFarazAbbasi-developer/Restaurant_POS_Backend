import { z } from 'zod';

export const takeawayOrderStatusEnum = z.enum([
  'PENDING',
  'PREPARING',
  'READY',
  'COMPLETED',
  'CANCELLED',
]);
export type TakeawayOrderStatusType = z.infer<typeof takeawayOrderStatusEnum>;

export const takeawayPaymentStatusEnum = z.enum(['PAID', 'PENDING']);
export type TakeawayPaymentStatusType = z.infer<typeof takeawayPaymentStatusEnum>;

export const takeawayOrderIdParamSchema = z.object({
  id: z.string().uuid('Invalid takeaway order ID format'),
});

export const createTakeawayOrderItemSchema = z
  .object({
    menuItemId: z.string().uuid('Invalid menu item ID format'),
    variantId: z.string().uuid('Invalid variant ID format').nullable().optional(),
    quantity: z
      .number()
      .int()
      .min(1, 'Quantity must be at least 1')
      .max(100, 'Quantity cannot exceed 100')
      .default(1),
    specialInstructions: z
      .string()
      .trim()
      .max(200, 'Instructions cannot exceed 200 characters')
      .nullable()
      .optional(),
    modifierIds: z.array(z.string().uuid('Invalid modifier ID format')).optional().default([]),
  })
  .strict();

export type CreateTakeawayOrderItemInput = z.infer<typeof createTakeawayOrderItemSchema>;

export const createTakeawayOrderSchema = z
  .object({
    customerName: z
      .string()
      .trim()
      .min(1, 'Customer name is required')
      .max(100, 'Customer name cannot exceed 100 characters'),
    customerPhone: z
      .string()
      .trim()
      .max(20, 'Phone number cannot exceed 20 characters')
      .nullable()
      .optional(),
    isPayOnPickup: z.boolean().optional().default(false),
    paymentMethod: z.string().trim().max(50).optional().default('CASH'),
    specialInstructions: z
      .string()
      .trim()
      .max(500, 'Special instructions cannot exceed 500 characters')
      .nullable()
      .optional(),
    items: z.array(createTakeawayOrderItemSchema).min(1, 'At least one order item is required'),
  })
  .strict();

export type CreateTakeawayOrderInput = z.infer<typeof createTakeawayOrderSchema>;

export const updateTakeawayStatusSchema = z
  .object({
    status: z.enum(['PREPARING', 'READY', 'COMPLETED']),
    markPaid: z.boolean().optional(),
  })
  .strict();

export type UpdateTakeawayStatusInput = z.infer<typeof updateTakeawayStatusSchema>;

export const cancelTakeawayOrderSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(1, 'Cancellation reason is required')
      .max(255, 'Cancellation reason cannot exceed 255 characters'),
  })
  .strict();

export type CancelTakeawayOrderInput = z.infer<typeof cancelTakeawayOrderSchema>;

export const listTakeawayOrdersQuerySchema = z.object({
  status: takeawayOrderStatusEnum.optional(),
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

export type ListTakeawayOrdersQueryInput = z.infer<typeof listTakeawayOrdersQuerySchema>;
