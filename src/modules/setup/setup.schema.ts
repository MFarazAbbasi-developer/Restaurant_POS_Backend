import { z } from 'zod';

const restaurantSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Slug must be at least 3 characters')
  .max(50, 'Slug cannot exceed 50 characters')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Slug may only contain lowercase letters, numbers, and hyphens',
  );

export const completeSetupSchema = z
  .object({
    restaurant: z
      .object({
        name: z
          .string()
          .trim()
          .min(1, 'Restaurant name is required')
          .max(100, 'Restaurant name cannot exceed 100 characters'),
        slug: restaurantSlugSchema,
        legalName: z
          .string()
          .trim()
          .max(150, 'Legal name cannot exceed 150 characters')
          .optional(),
        phone: z.string().trim().max(50, 'Phone cannot exceed 50 characters').optional(),
        address: z.string().trim().max(255, 'Address cannot exceed 255 characters').optional(),
        currency: z
          .string()
          .trim()
          .length(3, 'Currency must be a 3-character ISO code')
          .regex(/^[A-Z]{3}$/, 'Currency must be 3 uppercase letters')
          .default('PKR'),
        timezone: z
          .string()
          .trim()
          .min(1, 'Timezone cannot be empty')
          .max(50, 'Timezone cannot exceed 50 characters')
          .default('Asia/Karachi'),
        taxRate: z
          .number()
          .min(0, 'Tax rate cannot be negative')
          .max(100, 'Tax rate cannot exceed 100%')
          .default(0),
      })
      .strict(),
    owner: z
      .object({
        name: z
          .string()
          .trim()
          .min(1, 'Owner name is required')
          .max(100, 'Owner name cannot exceed 100 characters'),
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
        password: z
          .string()
          .min(8, 'Password must be at least 8 characters')
          .max(100, 'Password cannot exceed 100 characters'),
      })
      .strict(),
  })
  .strict();

export type CompleteSetupInput = z.infer<typeof completeSetupSchema>;
