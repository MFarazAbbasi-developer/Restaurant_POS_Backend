import { z } from 'zod';

// =============================================================================
// 1. Categories
// =============================================================================

export const categoryIdParamSchema = z.object({
  id: z.string().uuid('Invalid category ID format'),
});

export const createCategorySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Category name is required')
      .max(100, 'Name cannot exceed 100 characters'),
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

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Category name cannot be empty')
      .max(100, 'Name cannot exceed 100 characters')
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

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const updateCategoryStatusSchema = z
  .object({
    isActive: z.boolean({ required_error: 'isActive is required' }),
  })
  .strict();

export type UpdateCategoryStatusInput = z.infer<typeof updateCategoryStatusSchema>;

export const reorderCategoriesSchema = z
  .object({
    items: z
      .array(
        z.object({
          id: z.string().uuid('Invalid category ID format'),
          sortOrder: z.number().int().min(0, 'Sort order must be non-negative'),
        }),
      )
      .min(1, 'At least one item must be provided for reordering'),
  })
  .strict();

export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>;

// =============================================================================
// 2. Menu Items
// =============================================================================

export const menuItemIdParamSchema = z.object({
  id: z.string().uuid('Invalid menu item ID format'),
});

export const listMenuItemsQuerySchema = z.object({
  categoryId: z.string().uuid('Invalid category ID format').optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  isAvailable: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sortBy: z.enum(['name', 'itemCode', 'sortOrder', 'basePrice', 'createdAt']).default('sortOrder'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

export type ListMenuItemsQueryInput = z.infer<typeof listMenuItemsQuerySchema>;

export const createMenuItemSchema = z
  .object({
    categoryId: z.string().uuid('Invalid category ID format'),
    itemCode: z
      .string()
      .trim()
      .min(1, 'Item code is required')
      .max(50, 'Item code cannot exceed 50 characters')
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        'Item code must only contain alphanumeric characters, underscores, or hyphens',
      ),
    name: z
      .string()
      .trim()
      .min(1, 'Item name is required')
      .max(150, 'Name cannot exceed 150 characters'),
    urduName: z
      .string()
      .trim()
      .max(150, 'Urdu name cannot exceed 150 characters')
      .nullable()
      .optional(),
    description: z
      .string()
      .trim()
      .max(1000, 'Description cannot exceed 1000 characters')
      .nullable()
      .optional(),
    basePrice: z.number().min(0, 'Base price cannot be negative').default(0),
    taxRate: z
      .number()
      .min(0, 'Tax rate cannot be negative')
      .max(100, 'Tax rate cannot exceed 100%')
      .nullable()
      .optional(),
    sortOrder: z.number().int().min(0, 'Sort order must be non-negative').optional().default(0),
    isActive: z.boolean().optional().default(true),
    isAvailable: z.boolean().optional().default(true),
  })
  .strict();

export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;

export const updateMenuItemSchema = z
  .object({
    categoryId: z.string().uuid('Invalid category ID format').optional(),
    itemCode: z
      .string()
      .trim()
      .min(1, 'Item code cannot be empty')
      .max(50, 'Item code cannot exceed 50 characters')
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        'Item code must only contain alphanumeric characters, underscores, or hyphens',
      )
      .optional(),
    name: z
      .string()
      .trim()
      .min(1, 'Item name cannot be empty')
      .max(150, 'Name cannot exceed 150 characters')
      .optional(),
    urduName: z
      .string()
      .trim()
      .max(150, 'Urdu name cannot exceed 150 characters')
      .nullable()
      .optional(),
    description: z
      .string()
      .trim()
      .max(1000, 'Description cannot exceed 1000 characters')
      .nullable()
      .optional(),
    basePrice: z.number().min(0, 'Base price cannot be negative').optional(),
    taxRate: z
      .number()
      .min(0, 'Tax rate cannot be negative')
      .max(100, 'Tax rate cannot exceed 100%')
      .nullable()
      .optional(),
    sortOrder: z.number().int().min(0, 'Sort order must be non-negative').optional(),
  })
  .strict();

export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;

export const updateMenuItemStatusSchema = z
  .object({
    isActive: z.boolean({ required_error: 'isActive is required' }),
  })
  .strict();

export type UpdateMenuItemStatusInput = z.infer<typeof updateMenuItemStatusSchema>;

export const updateMenuItemAvailabilitySchema = z
  .object({
    isAvailable: z.boolean({ required_error: 'isAvailable is required' }),
  })
  .strict();

export type UpdateMenuItemAvailabilityInput = z.infer<typeof updateMenuItemAvailabilitySchema>;

// =============================================================================
// 3. Portion / Price Variants
// =============================================================================

export const itemVariantParamSchema = z.object({
  itemId: z.string().uuid('Invalid menu item ID format'),
});

export const variantIdParamSchema = z.object({
  id: z.string().uuid('Invalid variant ID format'),
});

export const createVariantSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Variant name is required')
      .max(100, 'Variant name cannot exceed 100 characters'),
    price: z.number().min(0, 'Variant price cannot be negative'),
    sortOrder: z.number().int().min(0, 'Sort order must be non-negative').optional().default(0),
    isActive: z.boolean().optional().default(true),
  })
  .strict();

export type CreateVariantInput = z.infer<typeof createVariantSchema>;

export const updateVariantSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Variant name cannot be empty')
      .max(100, 'Variant name cannot exceed 100 characters')
      .optional(),
    price: z.number().min(0, 'Variant price cannot be negative').optional(),
    sortOrder: z.number().int().min(0, 'Sort order must be non-negative').optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;

// =============================================================================
// 4. Modifier Groups
// =============================================================================

export const modifierGroupIdParamSchema = z.object({
  id: z.string().uuid('Invalid modifier group ID format'),
});

export const createModifierGroupSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Modifier group name is required')
      .max(100, 'Name cannot exceed 100 characters'),
    selectionType: z.enum(['SINGLE', 'MULTIPLE']).default('SINGLE'),
    minSelections: z.number().int().min(0, 'Min selections must be non-negative').default(0),
    maxSelections: z.number().int().min(1, 'Max selections must be at least 1').default(1),
    sortOrder: z.number().int().min(0, 'Sort order must be non-negative').optional().default(0),
    isActive: z.boolean().optional().default(true),
  })
  .strict()
  .refine((data) => data.maxSelections >= data.minSelections, {
    message: 'Max selections must be greater than or equal to min selections',
    path: ['maxSelections'],
  });

export type CreateModifierGroupInput = z.infer<typeof createModifierGroupSchema>;

export const updateModifierGroupSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Modifier group name cannot be empty')
      .max(100, 'Name cannot exceed 100 characters')
      .optional(),
    selectionType: z.enum(['SINGLE', 'MULTIPLE']).optional(),
    minSelections: z.number().int().min(0, 'Min selections must be non-negative').optional(),
    maxSelections: z.number().int().min(1, 'Max selections must be at least 1').optional(),
    sortOrder: z.number().int().min(0, 'Sort order must be non-negative').optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.minSelections !== undefined && data.maxSelections !== undefined) {
        return data.maxSelections >= data.minSelections;
      }
      return true;
    },
    {
      message: 'Max selections must be greater than or equal to min selections',
      path: ['maxSelections'],
    },
  );

export type UpdateModifierGroupInput = z.infer<typeof updateModifierGroupSchema>;

export const updateModifierGroupStatusSchema = z
  .object({
    isActive: z.boolean({ required_error: 'isActive is required' }),
  })
  .strict();

export type UpdateModifierGroupStatusInput = z.infer<typeof updateModifierGroupStatusSchema>;

// =============================================================================
// 5. Modifiers
// =============================================================================

export const groupModifierParamSchema = z.object({
  groupId: z.string().uuid('Invalid modifier group ID format'),
});

export const modifierIdParamSchema = z.object({
  id: z.string().uuid('Invalid modifier ID format'),
});

export const createModifierSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Modifier name is required')
      .max(100, 'Name cannot exceed 100 characters'),
    priceAdjustment: z.number().min(0, 'Price adjustment cannot be negative').default(0),
    sortOrder: z.number().int().min(0, 'Sort order must be non-negative').optional().default(0),
    isActive: z.boolean().optional().default(true),
  })
  .strict();

export type CreateModifierInput = z.infer<typeof createModifierSchema>;

export const updateModifierSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Modifier name cannot be empty')
      .max(100, 'Name cannot exceed 100 characters')
      .optional(),
    priceAdjustment: z.number().min(0, 'Price adjustment cannot be negative').optional(),
    sortOrder: z.number().int().min(0, 'Sort order must be non-negative').optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export type UpdateModifierInput = z.infer<typeof updateModifierSchema>;

// =============================================================================
// 6. Item ↔ Modifier Group Linking
// =============================================================================

export const linkItemModifierGroupSchema = z
  .object({
    modifierGroupId: z.string().uuid('Invalid modifier group ID format'),
    sortOrder: z.number().int().min(0, 'Sort order must be non-negative').optional().default(0),
    isRequired: z.boolean().optional().default(false),
    minSelections: z.number().int().min(0).nullable().optional(),
    maxSelections: z.number().int().min(1).nullable().optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.minSelections != null && data.maxSelections != null) {
        return data.maxSelections >= data.minSelections;
      }
      return true;
    },
    {
      message: 'Max selections must be greater than or equal to min selections',
      path: ['maxSelections'],
    },
  );

export type LinkItemModifierGroupInput = z.infer<typeof linkItemModifierGroupSchema>;

export const itemModifierGroupParamSchema = z.object({
  itemId: z.string().uuid('Invalid menu item ID format'),
  groupId: z.string().uuid('Invalid modifier group ID format'),
});
