import { z } from 'zod';

export const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

// -----------------------------------------------------------------------------
// 1. Stock Location Schemas
// -----------------------------------------------------------------------------
export const createLocationSchema = z.object({
  name: z.string().trim().min(1, 'Location name is required').max(100),
  code: z.string().trim().max(50).optional(),
  isDefault: z.boolean().optional(),
});

export const updateLocationSchema = createLocationSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const locationIdParamSchema = z.object({
  id: z.string().uuid('Invalid location ID format'),
});

// -----------------------------------------------------------------------------
// 2. Supplier Schemas
// -----------------------------------------------------------------------------
export const createSupplierSchema = z.object({
  name: z.string().trim().min(1, 'Supplier name is required').max(150),
  contactPerson: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(50).optional(),
  email: z.string().trim().email('Invalid email address').optional().or(z.literal('')),
  address: z.string().trim().max(255).optional(),
  taxNumber: z.string().trim().max(50).optional(),
});

export const updateSupplierSchema = createSupplierSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const supplierIdParamSchema = z.object({
  id: z.string().uuid('Invalid supplier ID format'),
});

// -----------------------------------------------------------------------------
// 3. Inventory Item Schemas
// -----------------------------------------------------------------------------
export const createInventoryItemSchema = z.object({
  itemCode: z.string().trim().min(1, 'Item code / SKU is required').max(50),
  name: z.string().trim().min(1, 'Item name is required').max(150),
  description: z.string().trim().max(500).optional(),
  unit: z.string().trim().min(1, 'Unit is required').max(20).default('PCS'),
  costPerUnit: z.number().min(0, 'Cost per unit cannot be negative').default(0),
  currentStock: z.number().min(0, 'Current stock cannot be negative').default(0),
  minStockLevel: z.number().min(0, 'Min stock level cannot be negative').default(0),
  targetStockLevel: z.number().min(0, 'Target stock level cannot be negative').optional(),
  locationId: z.string().uuid('Invalid location ID format').optional(),
  supplierId: z.string().uuid('Invalid supplier ID format').optional(),
});

export const updateInventoryItemSchema = createInventoryItemSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const listInventoryItemsQuerySchema = z.object({
  supplierId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  lowStock: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
  search: z.string().trim().max(100).optional(),
  isActive: z
    .preprocess(
      (val) => (val === undefined ? undefined : val === 'true' || val === true),
      z.boolean(),
    )
    .optional(),
  page: z
    .preprocess(
      (val) => (val === undefined ? 1 : parseInt(String(val), 10)),
      z.number().int().min(1),
    )
    .default(1),
  limit: z
    .preprocess(
      (val) => (val === undefined ? 20 : parseInt(String(val), 10)),
      z.number().int().min(1).max(100),
    )
    .default(20),
});

export const inventoryItemIdParamSchema = z.object({
  id: z.string().uuid('Invalid inventory item ID format'),
});

// -----------------------------------------------------------------------------
// 4. Recipe / Bill of Materials (BOM) Schemas
// -----------------------------------------------------------------------------
export const upsertRecipeSchema = z
  .object({
    menuItemId: z.string().uuid('Invalid menu item ID format').optional(),
    variantId: z.string().uuid('Invalid variant ID format').optional(),
    modifierId: z.string().uuid('Invalid modifier ID format').optional(),
    inventoryItemId: z.string().uuid('Invalid inventory item ID format'),
    quantity: z.number().positive('Recipe ingredient quantity must be greater than 0'),
    wastePercentage: z.number().min(0).max(100).default(0),
  })
  .refine((data) => data.menuItemId || data.variantId || data.modifierId, {
    message: 'Recipe must be linked to a menuItemId, variantId, or modifierId',
  });

export const menuItemRecipeParamSchema = z.object({
  menuItemId: z.string().uuid('Invalid menu item ID format'),
});

export const recipeIdParamSchema = z.object({
  id: z.string().uuid('Invalid recipe ID format'),
});

// -----------------------------------------------------------------------------
// 5. Purchase Order / Receiving Schemas
// -----------------------------------------------------------------------------
export const purchaseItemInputSchema = z.object({
  inventoryItemId: z.string().uuid('Invalid inventory item ID format'),
  quantity: z.number().positive('Quantity must be greater than 0'),
  unitCost: z.number().min(0, 'Unit cost cannot be negative'),
});

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid('Invalid supplier ID format').optional(),
  locationId: z.string().uuid('Invalid location ID format').optional(),
  invoiceNumber: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(purchaseItemInputSchema).min(1, 'At least one purchase item is required'),
});

export const listPurchasesQuerySchema = z.object({
  supplierId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  startDate: z.string().regex(dateRegex).optional(),
  endDate: z.string().regex(dateRegex).optional(),
  page: z
    .preprocess(
      (val) => (val === undefined ? 1 : parseInt(String(val), 10)),
      z.number().int().min(1),
    )
    .default(1),
  limit: z
    .preprocess(
      (val) => (val === undefined ? 20 : parseInt(String(val), 10)),
      z.number().int().min(1).max(100),
    )
    .default(20),
});

export const purchaseOrderIdParamSchema = z.object({
  id: z.string().uuid('Invalid purchase order ID format'),
});

// -----------------------------------------------------------------------------
// 6. Stock Adjustment Schemas
// -----------------------------------------------------------------------------
export const stockAdjustmentItemInputSchema = z.object({
  inventoryItemId: z.string().uuid('Invalid inventory item ID format'),
  actualStock: z.number().min(0, 'Actual counted stock cannot be negative'),
});

export const createStockAdjustmentSchema = z.object({
  locationId: z.string().uuid('Invalid location ID format').optional(),
  reason: z.string().trim().min(3, 'Adjustment reason is required').max(255),
  notes: z.string().trim().max(500).optional(),
  items: z
    .array(stockAdjustmentItemInputSchema)
    .min(1, 'At least one item is required for adjustment'),
});

export const listAdjustmentsQuerySchema = z.object({
  locationId: z.string().uuid().optional(),
  startDate: z.string().regex(dateRegex).optional(),
  endDate: z.string().regex(dateRegex).optional(),
  page: z
    .preprocess(
      (val) => (val === undefined ? 1 : parseInt(String(val), 10)),
      z.number().int().min(1),
    )
    .default(1),
  limit: z
    .preprocess(
      (val) => (val === undefined ? 20 : parseInt(String(val), 10)),
      z.number().int().min(1).max(100),
    )
    .default(20),
});

export const adjustmentIdParamSchema = z.object({
  id: z.string().uuid('Invalid adjustment ID format'),
});

// -----------------------------------------------------------------------------
// 7. Stock Wastage Schemas
// -----------------------------------------------------------------------------
export const stockWastageItemInputSchema = z.object({
  inventoryItemId: z.string().uuid('Invalid inventory item ID format'),
  quantity: z.number().positive('Wasted quantity must be greater than 0'),
  unitCost: z.number().min(0).optional(),
  itemReason: z.string().trim().max(255).optional(),
});

export const createStockWastageSchema = z.object({
  locationId: z.string().uuid('Invalid location ID format').optional(),
  reason: z.enum(['EXPIRED', 'SPOILED', 'PREPARATION_ERROR', 'DAMAGED', 'CONTAMINATED', 'OTHER']),
  notes: z.string().trim().max(500).optional(),
  items: z.array(stockWastageItemInputSchema).min(1, 'At least one wasted item is required'),
});

export const listWastageQuerySchema = z.object({
  locationId: z.string().uuid().optional(),
  reason: z.string().optional(),
  startDate: z.string().regex(dateRegex).optional(),
  endDate: z.string().regex(dateRegex).optional(),
  page: z
    .preprocess(
      (val) => (val === undefined ? 1 : parseInt(String(val), 10)),
      z.number().int().min(1),
    )
    .default(1),
  limit: z
    .preprocess(
      (val) => (val === undefined ? 20 : parseInt(String(val), 10)),
      z.number().int().min(1).max(100),
    )
    .default(20),
});

export const wastageIdParamSchema = z.object({
  id: z.string().uuid('Invalid wastage ID format'),
});

// -----------------------------------------------------------------------------
// 8. Stock Transfer Schemas
// -----------------------------------------------------------------------------
export const stockTransferItemInputSchema = z.object({
  inventoryItemId: z.string().uuid('Invalid inventory item ID format'),
  quantity: z.number().positive('Transfer quantity must be greater than 0'),
});

export const createStockTransferSchema = z
  .object({
    fromLocationId: z.string().uuid('Invalid fromLocationId format'),
    toLocationId: z.string().uuid('Invalid toLocationId format'),
    notes: z.string().trim().max(500).optional(),
    items: z
      .array(stockTransferItemInputSchema)
      .min(1, 'At least one item is required for transfer'),
  })
  .refine((data) => data.fromLocationId !== data.toLocationId, {
    message: 'Destination location must be different from source location',
    path: ['toLocationId'],
  });

export const listTransfersQuerySchema = z.object({
  fromLocationId: z.string().uuid().optional(),
  toLocationId: z.string().uuid().optional(),
  startDate: z.string().regex(dateRegex).optional(),
  endDate: z.string().regex(dateRegex).optional(),
  page: z
    .preprocess(
      (val) => (val === undefined ? 1 : parseInt(String(val), 10)),
      z.number().int().min(1),
    )
    .default(1),
  limit: z
    .preprocess(
      (val) => (val === undefined ? 20 : parseInt(String(val), 10)),
      z.number().int().min(1).max(100),
    )
    .default(20),
});

export const transferIdParamSchema = z.object({
  id: z.string().uuid('Invalid transfer ID format'),
});

// -----------------------------------------------------------------------------
// 9. Stock Movement Ledger Schemas
// -----------------------------------------------------------------------------
export const listLedgerQuerySchema = z.object({
  inventoryItemId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  type: z
    .enum([
      'PURCHASE_RECEIPT',
      'SALE_CONSUMPTION',
      'ORDER_VOID_RETURN',
      'ADJUSTMENT_INCREASE',
      'ADJUSTMENT_DECREASE',
      'WASTAGE',
      'TRANSFER_IN',
      'TRANSFER_OUT',
    ])
    .optional(),
  referenceType: z.string().optional(),
  startDate: z.string().regex(dateRegex).optional(),
  endDate: z.string().regex(dateRegex).optional(),
  page: z
    .preprocess(
      (val) => (val === undefined ? 1 : parseInt(String(val), 10)),
      z.number().int().min(1),
    )
    .default(1),
  limit: z
    .preprocess(
      (val) => (val === undefined ? 20 : parseInt(String(val), 10)),
      z.number().int().min(1).max(100),
    )
    .default(20),
});

// Types
export type CreateLocationInput = z.infer<typeof createLocationSchema>;
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;
export type ListInventoryItemsQuery = z.infer<typeof listInventoryItemsQuerySchema>;

export type UpsertRecipeInput = z.infer<typeof upsertRecipeSchema>;

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type ListPurchasesQuery = z.infer<typeof listPurchasesQuerySchema>;

export type CreateStockAdjustmentInput = z.infer<typeof createStockAdjustmentSchema>;
export type ListAdjustmentsQuery = z.infer<typeof listAdjustmentsQuerySchema>;

export type CreateStockWastageInput = z.infer<typeof createStockWastageSchema>;
export type ListWastageQuery = z.infer<typeof listWastageQuerySchema>;

export type CreateStockTransferInput = z.infer<typeof createStockTransferSchema>;
export type ListTransfersQuery = z.infer<typeof listTransfersQuerySchema>;

export type ListLedgerQuery = z.infer<typeof listLedgerQuerySchema>;
