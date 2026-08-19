import { z } from 'zod';

export const PurchaseOrderStatusEnum = z.enum([
  'DRAFT',
  'ORDERED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
]);
export type PurchaseOrderStatusType = z.infer<typeof PurchaseOrderStatusEnum>;

// -----------------------------------------------------------------------------
// 1. Supplier Schemas
// -----------------------------------------------------------------------------
export const createSupplierSchema = z
  .object({
    name: z.string().trim().min(1, 'Supplier name is required').max(100),
    contactPerson: z.string().trim().max(100).optional().nullable(),
    phone: z.string().trim().max(30).optional().nullable(),
    email: z.string().trim().email('Invalid email address').optional().nullable(),
    address: z.string().trim().max(255).optional().nullable(),
    taxNumber: z.string().trim().max(50).optional().nullable(),
    isActive: z.boolean().optional().default(true),
  })
  .strict();

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = createSupplierSchema.partial();
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

export const supplierIdParamSchema = z.object({
  id: z.string().uuid('Invalid supplier ID format'),
});

export const listSuppliersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;

// -----------------------------------------------------------------------------
// 2. Purchase Order Schemas
// -----------------------------------------------------------------------------
export const purchaseOrderItemInputSchema = z.object({
  inventoryItemId: z.string().uuid('Invalid inventory item ID format'),
  quantity: z
    .number({ invalid_type_error: 'Quantity must be a number' })
    .positive('Quantity ordered must be greater than 0'),
  unitCost: z
    .number({ invalid_type_error: 'Unit cost must be a number' })
    .min(0, 'Unit cost cannot be negative'),
  taxRate: z
    .number({ invalid_type_error: 'Tax rate must be a number' })
    .min(0, 'Tax rate cannot be negative')
    .max(100, 'Tax rate cannot exceed 100%')
    .optional()
    .default(0),
  discountRate: z
    .number({ invalid_type_error: 'Discount rate must be a number' })
    .min(0, 'Discount rate cannot be negative')
    .max(100, 'Discount rate cannot exceed 100%')
    .optional()
    .default(0),
});

export const createPurchaseOrderSchema = z
  .object({
    supplierId: z.string().uuid('Invalid supplier ID format').optional().nullable(),
    locationId: z.string().uuid('Invalid location ID format').optional().nullable(),
    invoiceNumber: z.string().trim().max(50).optional().nullable(),
    expectedDeliveryDate: z.string().trim().optional().nullable(),
    status: z.enum(['DRAFT', 'ORDERED', 'RECEIVED']).optional().default('ORDERED'),
    notes: z.string().trim().max(500).optional().nullable(),
    items: z
      .array(purchaseOrderItemInputSchema)
      .min(1, 'Purchase order must contain at least one item'),
  })
  .strict();

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

export const updatePurchaseOrderSchema = z
  .object({
    supplierId: z.string().uuid('Invalid supplier ID format').optional().nullable(),
    locationId: z.string().uuid('Invalid location ID format').optional().nullable(),
    invoiceNumber: z.string().trim().max(50).optional().nullable(),
    expectedDeliveryDate: z.string().trim().optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
    items: z.array(purchaseOrderItemInputSchema).optional(),
  })
  .strict();

export type UpdatePurchaseOrderInput = z.infer<typeof updatePurchaseOrderSchema>;

export const purchaseOrderIdParamSchema = z.object({
  id: z.string().uuid('Invalid purchase order ID format'),
});

// -----------------------------------------------------------------------------
// 3. Goods Receiving & Returns Schemas
// -----------------------------------------------------------------------------
export const receiveGoodsItemSchema = z.object({
  purchaseOrderItemId: z.string().uuid('Invalid purchase order item ID format'),
  quantityReceived: z
    .number({ invalid_type_error: 'Quantity received must be a number' })
    .positive('Quantity received must be greater than 0'),
});

export const receiveGoodsSchema = z
  .object({
    invoiceNumber: z.string().trim().max(50).optional().nullable(),
    receivedLocationId: z
      .string()
      .uuid('Invalid received location ID format')
      .optional()
      .nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
    items: z.array(receiveGoodsItemSchema).min(1, 'Must specify at least one item to receive'),
  })
  .strict();

export type ReceiveGoodsInput = z.infer<typeof receiveGoodsSchema>;

export const purchaseReturnItemSchema = z.object({
  purchaseOrderItemId: z.string().uuid('Invalid purchase order item ID format'),
  quantity: z
    .number({ invalid_type_error: 'Quantity returned must be a number' })
    .positive('Quantity returned must be greater than 0'),
});

export const createPurchaseReturnSchema = z
  .object({
    reason: z.string().trim().min(1, 'Return reason is required').max(255),
    notes: z.string().trim().max(500).optional().nullable(),
    items: z.array(purchaseReturnItemSchema).min(1, 'Must specify at least one item to return'),
  })
  .strict();

export type CreatePurchaseReturnInput = z.infer<typeof createPurchaseReturnSchema>;

// -----------------------------------------------------------------------------
// 4. Query & Analytics Schemas
// -----------------------------------------------------------------------------
export const listPurchasesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: PurchaseOrderStatusEnum.optional(),
  supplierId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  search: z.string().trim().optional(),
});

export type ListPurchasesQuery = z.infer<typeof listPurchasesQuerySchema>;

export const purchasingSummaryQuerySchema = z.object({
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  supplierId: z.string().uuid().optional(),
});

export type PurchasingSummaryQuery = z.infer<typeof purchasingSummaryQuerySchema>;
