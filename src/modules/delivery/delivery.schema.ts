import { z } from 'zod';

export const deliveryOrderStatusEnum = z.enum([
  'PENDING',
  'PREPARING',
  'READY',
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED',
  'FAILED',
]);
export type DeliveryOrderStatusType = z.infer<typeof deliveryOrderStatusEnum>;

export const deliveryPaymentStatusEnum = z.enum(['PENDING', 'PAID']);
export type DeliveryPaymentStatusType = z.infer<typeof deliveryPaymentStatusEnum>;

// =============================================================================
// Customer Schemas
// =============================================================================

export const customerPhoneQuerySchema = z.object({
  phone: z.string().trim().min(1, 'Phone number is required').max(30),
});

export const customerIdParamSchema = z.object({
  id: z.string().uuid('Invalid customer ID format'),
});

export const createCustomerSchema = z
  .object({
    name: z.string().trim().min(1, 'Customer name is required').max(100),
    phone: z.string().trim().min(1, 'Phone number is required').max(30),
    notes: z.string().trim().max(500).nullable().optional(),
    address: z.string().trim().max(300).optional(),
    landmark: z.string().trim().max(200).nullable().optional(),
    deliveryZoneId: z.string().uuid('Invalid delivery zone ID').nullable().optional(),
  })
  .strict();

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const addCustomerAddressSchema = z
  .object({
    address: z.string().trim().min(1, 'Address is required').max(300),
    landmark: z.string().trim().max(200).nullable().optional(),
    deliveryZoneId: z.string().uuid('Invalid delivery zone ID').nullable().optional(),
    isDefault: z.boolean().optional().default(false),
  })
  .strict();

export type AddCustomerAddressInput = z.infer<typeof addCustomerAddressSchema>;

export const listCustomersQuerySchema = z.object({
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

// =============================================================================
// Delivery Zone Schemas
// =============================================================================

export const deliveryZoneIdParamSchema = z.object({
  id: z.string().uuid('Invalid delivery zone ID format'),
});

export const createDeliveryZoneSchema = z
  .object({
    name: z.string().trim().min(1, 'Zone name is required').max(100),
    deliveryCharge: z.number().min(0, 'Delivery charge cannot be negative').default(0),
    estimatedMinutes: z.number().int().min(1).max(300).nullable().optional(),
    isActive: z.boolean().optional().default(true),
  })
  .strict();

export type CreateDeliveryZoneInput = z.infer<typeof createDeliveryZoneSchema>;

export const updateDeliveryZoneSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    deliveryCharge: z.number().min(0).optional(),
    estimatedMinutes: z.number().int().min(1).max(300).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export type UpdateDeliveryZoneInput = z.infer<typeof updateDeliveryZoneSchema>;

// =============================================================================
// Delivery Order Schemas
// =============================================================================

export const deliveryOrderIdParamSchema = z.object({
  id: z.string().uuid('Invalid delivery order ID format'),
});

export const createDeliveryOrderItemSchema = z
  .object({
    menuItemId: z.string().uuid('Invalid menu item ID format'),
    variantId: z.string().uuid('Invalid variant ID format').nullable().optional(),
    quantity: z.number().int().min(1, 'Quantity must be at least 1').max(100).default(1),
    specialInstructions: z.string().trim().max(200).nullable().optional(),
    modifierIds: z.array(z.string().uuid('Invalid modifier ID format')).optional().default([]),
  })
  .strict();

export type CreateDeliveryOrderItemInput = z.infer<typeof createDeliveryOrderItemSchema>;

export const createDeliveryOrderSchema = z
  .object({
    customerName: z.string().trim().min(1, 'Customer name is required').max(100),
    customerPhone: z.string().trim().min(1, 'Customer phone is required').max(30),
    deliveryAddress: z.string().trim().min(1, 'Delivery address is required').max(300),
    landmark: z.string().trim().max(200).nullable().optional(),
    deliveryZoneId: z.string().uuid('Invalid delivery zone ID').nullable().optional(),
    flatDeliveryFee: z.number().min(0).optional(),
    packagingCharge: z.number().min(0).optional().default(0),
    paymentMethod: z.string().trim().max(50).optional().default('CASH'),
    specialInstructions: z.string().trim().max(500).nullable().optional(),
    isAggregator: z.boolean().optional().default(false),
    aggregatorName: z.string().trim().max(100).nullable().optional(),
    aggregatorReference: z.string().trim().max(100).nullable().optional(),
    riderId: z.string().uuid('Invalid rider ID').nullable().optional(),
    items: z.array(createDeliveryOrderItemSchema).min(1, 'At least one order item is required'),
  })
  .strict();

export type CreateDeliveryOrderInput = z.infer<typeof createDeliveryOrderSchema>;

export const updateDeliveryStatusSchema = z
  .object({
    status: z.enum(['PREPARING', 'READY', 'DISPATCHED', 'DELIVERED', 'FAILED']),
    riderId: z.string().uuid('Invalid rider ID').optional(),
    markPaid: z.boolean().optional(),
  })
  .strict();

export type UpdateDeliveryStatusInput = z.infer<typeof updateDeliveryStatusSchema>;

export const assignRiderSchema = z
  .object({
    riderId: z.string().uuid('Invalid rider ID format'),
  })
  .strict();

export type AssignRiderInput = z.infer<typeof assignRiderSchema>;

export const cancelDeliveryOrderSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(1, 'Cancellation reason is required')
      .max(255, 'Cancellation reason cannot exceed 255 characters'),
  })
  .strict();

export type CancelDeliveryOrderInput = z.infer<typeof cancelDeliveryOrderSchema>;

export const listDeliveryOrdersQuerySchema = z.object({
  status: deliveryOrderStatusEnum.optional(),
  riderId: z.string().uuid().optional(),
  businessDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Business date must be in YYYY-MM-DD format')
    .optional(),
  search: z.string().trim().max(50).optional(),
  isSettled: z
    .string()
    .optional()
    .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined)),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? Math.max(1, parseInt(val, 10)) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(val, 10))) : 20)),
});

export type ListDeliveryOrdersQueryInput = z.infer<typeof listDeliveryOrdersQuerySchema>;

// =============================================================================
// Rider Reconciliation & Settlement Schemas
// =============================================================================

export const riderIdParamSchema = z.object({
  riderId: z.string().uuid('Invalid rider ID format'),
});

export const createRiderSettlementSchema = z
  .object({
    riderId: z.string().uuid('Invalid rider ID format'),
    orderIds: z
      .array(z.string().uuid('Invalid order ID format'))
      .min(1, 'At least one order must be settled'),
    collectedAmount: z.number().min(0, 'Collected amount cannot be negative'),
    remittedAmount: z.number().min(0, 'Remitted amount cannot be negative'),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export type CreateRiderSettlementInput = z.infer<typeof createRiderSettlementSchema>;
