import { z } from 'zod';

export const listStaffQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  roleId: z.string().uuid('Invalid role ID format').optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  sortBy: z.enum(['name', 'username', 'createdAt', 'lastLoginAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ListStaffQueryInput = z.infer<typeof listStaffQuerySchema>;

export const staffIdParamSchema = z.object({
  id: z.string().uuid('Invalid staff ID format'),
});

export type StaffIdParamInput = z.infer<typeof staffIdParamSchema>;

export const createStaffSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(100, 'Name cannot exceed 100 characters'),
    username: z
      .string()
      .trim()
      .min(3, 'Username must be at least 3 characters')
      .max(30, 'Username cannot exceed 30 characters')
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        'Username can only contain alphanumeric characters, underscores, and hyphens',
      ),
    phone: z.string().trim().max(50, 'Phone cannot exceed 50 characters').optional(),
    pin: z.string().regex(/^\d{4,8}$/, 'PIN must be between 4 and 8 digits'),
    password: z.string().min(8, 'Password must be at least 8 characters').max(100).optional(),
    roleIds: z
      .array(z.string().uuid('Invalid role ID format'))
      .min(1, 'At least one role must be assigned to staff'),
  })
  .strict();

export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const updateStaffSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name cannot be empty')
      .max(100, 'Name cannot exceed 100 characters')
      .optional(),
    username: z
      .string()
      .trim()
      .min(3, 'Username must be at least 3 characters')
      .max(30, 'Username cannot exceed 30 characters')
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        'Username can only contain alphanumeric characters, underscores, and hyphens',
      )
      .optional(),
    phone: z.string().trim().max(50, 'Phone cannot exceed 50 characters').nullable().optional(),
  })
  .strict();

export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

export const updateStaffStatusSchema = z
  .object({
    isActive: z.boolean({ required_error: 'isActive is required' }),
  })
  .strict();

export type UpdateStaffStatusInput = z.infer<typeof updateStaffStatusSchema>;

export const updateStaffPinSchema = z
  .object({
    pin: z
      .string({ required_error: 'PIN is required' })
      .regex(/^\d{4,8}$/, 'PIN must be between 4 and 8 digits'),
  })
  .strict();

export type UpdateStaffPinInput = z.infer<typeof updateStaffPinSchema>;

export const updateStaffRolesSchema = z
  .object({
    roleIds: z
      .array(z.string().uuid('Invalid role ID format'))
      .min(1, 'At least one role must be assigned to staff'),
  })
  .strict();

export type UpdateStaffRolesInput = z.infer<typeof updateStaffRolesSchema>;
