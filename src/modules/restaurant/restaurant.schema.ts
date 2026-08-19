import { z } from 'zod';

export const updateRestaurantSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Name cannot be empty')
      .max(100, 'Name cannot exceed 100 characters')
      .optional(),
    legalName: z.string().max(150, 'Legal name cannot exceed 150 characters').nullable().optional(),
    address: z.string().max(255, 'Address cannot exceed 255 characters').nullable().optional(),
    phone: z.string().max(50, 'Phone cannot exceed 50 characters').nullable().optional(),
    logo: z.string().max(500, 'Logo reference cannot exceed 500 characters').nullable().optional(),
    currency: z
      .string()
      .length(3, 'Currency must be a 3-character ISO code')
      .regex(/^[A-Z]{3}$/, 'Currency must be 3 uppercase letters')
      .optional(),
    timezone: z
      .string()
      .min(1, 'Timezone cannot be empty')
      .max(50, 'Timezone cannot exceed 50 characters')
      .optional(),
    taxNumber: z.string().max(50, 'Tax number cannot exceed 50 characters').nullable().optional(),
    taxRate: z
      .number()
      .min(0, 'Tax rate cannot be negative')
      .max(100, 'Tax rate cannot exceed 100%')
      .optional(),
    taxInclusive: z.boolean().optional(),
    serviceChargeRate: z
      .number()
      .min(0, 'Service charge rate cannot be negative')
      .max(100, 'Service charge rate cannot exceed 100%')
      .optional(),
    serviceChargeEnabled: z.boolean().optional(),
    dineInEnabled: z.boolean().optional(),
    takeawayEnabled: z.boolean().optional(),
    deliveryEnabled: z.boolean().optional(),
    receiptHeader: z
      .string()
      .max(500, 'Receipt header cannot exceed 500 characters')
      .nullable()
      .optional(),
    receiptFooter: z
      .string()
      .max(500, 'Receipt footer cannot exceed 500 characters')
      .nullable()
      .optional(),
    settings: z.record(z.unknown()).nullable().optional(),
  })
  .strict();

export type UpdateRestaurantInput = z.infer<typeof updateRestaurantSchema>;
