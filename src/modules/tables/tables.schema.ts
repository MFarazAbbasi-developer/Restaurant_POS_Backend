import { z } from 'zod';

// =============================================================================
// 1. Zones / Seating Floors
// =============================================================================

export const zoneIdParamSchema = z.object({
  id: z.string().uuid('Invalid zone ID format'),
});

export const createZoneSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Zone name is required')
      .max(100, 'Zone name cannot exceed 100 characters'),
    description: z
      .string()
      .trim()
      .max(500, 'Description cannot exceed 500 characters')
      .nullable()
      .optional(),
    sortOrder: z.number().int().min(0, 'Sort order must be non-negative').optional().default(0),
    isActive: z.boolean().optional().default(true),
  })
  .strict();

export type CreateZoneInput = z.infer<typeof createZoneSchema>;

export const updateZoneSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Zone name cannot be empty')
      .max(100, 'Zone name cannot exceed 100 characters')
      .optional(),
    description: z
      .string()
      .trim()
      .max(500, 'Description cannot exceed 500 characters')
      .nullable()
      .optional(),
    sortOrder: z.number().int().min(0, 'Sort order must be non-negative').optional(),
  })
  .strict();

export type UpdateZoneInput = z.infer<typeof updateZoneSchema>;

export const updateZoneStatusSchema = z
  .object({
    isActive: z.boolean({ required_error: 'isActive is required' }),
  })
  .strict();

export type UpdateZoneStatusInput = z.infer<typeof updateZoneStatusSchema>;

export const reorderZonesSchema = z
  .object({
    items: z
      .array(
        z.object({
          id: z.string().uuid('Invalid zone ID format'),
          sortOrder: z.number().int().min(0, 'Sort order must be non-negative'),
        }),
      )
      .min(1, 'At least one item must be provided for reordering'),
  })
  .strict();

export type ReorderZonesInput = z.infer<typeof reorderZonesSchema>;

// =============================================================================
// 2. Tables
// =============================================================================

export const tableStatusEnum = z.enum([
  'AVAILABLE',
  'OCCUPIED',
  'BILL_PRINTED',
  'RESERVED',
  'CLEANING',
]);
export type TableStatusType = z.infer<typeof tableStatusEnum>;

export const tableIdParamSchema = z.object({
  id: z.string().uuid('Invalid table ID format'),
});

export const listTablesQuerySchema = z.object({
  zoneId: z.string().uuid('Invalid zone ID format').optional(),
  status: tableStatusEnum.optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  search: z.string().trim().max(50).optional(),
});

export type ListTablesQueryInput = z.infer<typeof listTablesQuerySchema>;

export const createTableSchema = z
  .object({
    zoneId: z.string().uuid('Invalid zone ID format'),
    name: z
      .string()
      .trim()
      .min(1, 'Table name/number is required')
      .max(50, 'Table name cannot exceed 50 characters'),
    capacity: z
      .number()
      .int()
      .min(1, 'Capacity must be at least 1')
      .max(100, 'Capacity cannot exceed 100')
      .default(4),
    sortOrder: z.number().int().min(0, 'Sort order must be non-negative').optional().default(0),
    isActive: z.boolean().optional().default(true),
  })
  .strict();

export type CreateTableInput = z.infer<typeof createTableSchema>;

export const updateTableSchema = z
  .object({
    zoneId: z.string().uuid('Invalid zone ID format').optional(),
    name: z
      .string()
      .trim()
      .min(1, 'Table name cannot be empty')
      .max(50, 'Table name cannot exceed 50 characters')
      .optional(),
    capacity: z
      .number()
      .int()
      .min(1, 'Capacity must be at least 1')
      .max(100, 'Capacity cannot exceed 100')
      .optional(),
    sortOrder: z.number().int().min(0, 'Sort order must be non-negative').optional(),
  })
  .strict();

export type UpdateTableInput = z.infer<typeof updateTableSchema>;

export const updateTableStatusSchema = z
  .object({
    status: tableStatusEnum,
  })
  .strict();

export type UpdateTableStatusInput = z.infer<typeof updateTableStatusSchema>;

// =============================================================================
// 3. Table Transfer & Merge
// =============================================================================

export const transferTableSchema = z
  .object({
    fromTableId: z.string().uuid('Invalid source table ID format'),
    toTableId: z.string().uuid('Invalid destination table ID format'),
    targetStatus: z.enum(['OCCUPIED', 'BILL_PRINTED']).optional().default('OCCUPIED'),
  })
  .strict()
  .refine((data) => data.fromTableId !== data.toTableId, {
    message: 'Source and destination tables must be different',
    path: ['toTableId'],
  });

export type TransferTableInput = z.infer<typeof transferTableSchema>;

export const mergeTablesSchema = z
  .object({
    primaryTableId: z.string().uuid('Invalid primary table ID format'),
    secondaryTableIds: z
      .array(z.string().uuid('Invalid secondary table ID format'))
      .min(1, 'At least one secondary table is required for merging'),
  })
  .strict()
  .refine((data) => !data.secondaryTableIds.includes(data.primaryTableId), {
    message: 'Primary table cannot be included in secondary tables list',
    path: ['secondaryTableIds'],
  });

export type MergeTablesInput = z.infer<typeof mergeTablesSchema>;

// =============================================================================
// 4. Table Orders / Sub-bills
// =============================================================================

export const tableOrderStatusEnum = z.enum(['ACTIVE', 'BILL_PRINTED', 'CLOSED', 'CANCELLED']);
export type TableOrderStatusType = z.infer<typeof tableOrderStatusEnum>;

export const createTableOrderSchema = z
  .object({
    subBillName: z
      .string()
      .trim()
      .max(100, 'Sub-bill name cannot exceed 100 characters')
      .nullable()
      .optional(),
    guestCount: z.number().int().min(1, 'Guest count must be at least 1').max(100).default(1),
    notes: z.string().trim().max(500, 'Notes cannot exceed 500 characters').nullable().optional(),
  })
  .strict();

export type CreateTableOrderInput = z.infer<typeof createTableOrderSchema>;

export const updateTableOrderStatusSchema = z
  .object({
    status: tableOrderStatusEnum,
  })
  .strict();

export type UpdateTableOrderStatusInput = z.infer<typeof updateTableOrderStatusSchema>;

export const tableOrderParamSchema = z.object({
  id: z.string().uuid('Invalid table ID format'),
  orderId: z.string().uuid('Invalid order ID format'),
});
