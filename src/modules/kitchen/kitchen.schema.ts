import { z } from 'zod';

export const OrderKitchenStatusEnum = z.enum(['PREPARING', 'READY', 'SERVED']);
export const ItemKitchenStatusEnum = z.enum(['PENDING', 'PREPARING', 'READY', 'SERVED']);
export const OrderTypeEnum = z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']);

// 1. Kitchen Station Schemas
export const createKitchenStationSchema = z.object({
  name: z.string().trim().min(2, 'Station name must be at least 2 characters').max(100),
  code: z.string().trim().max(20).optional(),
  displayOrder: z.number().int().min(0).default(0),
  categoryIds: z.array(z.string().uuid('Invalid category ID format')).optional().default([]),
});

export const updateKitchenStationSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  code: z.string().trim().max(20).optional(),
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  categoryIds: z.array(z.string().uuid('Invalid category ID format')).optional(),
});

export const stationIdParamSchema = z.object({
  id: z.string().uuid('Invalid station ID format'),
});

// 2. Kitchen Order & Item Bump Schemas
export const updateOrderKitchenStatusSchema = z.object({
  status: OrderKitchenStatusEnum,
});

export const updateItemKitchenStatusSchema = z.object({
  status: ItemKitchenStatusEnum,
  kitchenNotes: z.string().trim().max(500).optional(),
});

export const orderIdParamSchema = z.object({
  id: z.string().uuid('Invalid order ID format'),
});

export const orderItemParamSchema = z.object({
  orderId: z.string().uuid('Invalid order ID format'),
  itemId: z.string().uuid('Invalid item ID format'),
});

export const recallSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

// 3. Kitchen Queue Filter Query Schema
export const kitchenQueueQuerySchema = z.object({
  orderType: OrderTypeEnum.optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'ALL_ACTIVE']).optional(),
  stationId: z.string().uuid('Invalid station ID format').optional(),
  categoryId: z.string().uuid('Invalid category ID format').optional(),
  search: z.string().trim().optional(),
  page: z
    .preprocess(
      (val) => (val === undefined ? 1 : parseInt(String(val), 10)),
      z.number().int().min(1),
    )
    .default(1),
  limit: z
    .preprocess(
      (val) => (val === undefined ? 50 : parseInt(String(val), 10)),
      z.number().int().min(1).max(100),
    )
    .default(50),
});

export type CreateKitchenStationInput = z.infer<typeof createKitchenStationSchema>;
export type UpdateKitchenStationInput = z.infer<typeof updateKitchenStationSchema>;
export type UpdateOrderKitchenStatusInput = z.infer<typeof updateOrderKitchenStatusSchema>;
export type UpdateItemKitchenStatusInput = z.infer<typeof updateItemKitchenStatusSchema>;
export type KitchenQueueQuery = z.infer<typeof kitchenQueueQuerySchema>;
export type RecallInput = z.infer<typeof recallSchema>;
