import { z } from 'zod';

export const PaymentMethodEnum = z.enum([
  'CASH',
  'CARD',
  'BANK_TRANSFER',
  'DIGITAL_WALLET',
  'OTHER',
]);
export type PaymentMethodType = z.infer<typeof PaymentMethodEnum>;

export const ExpenseStatusEnum = z.enum(['RECORDED', 'VOIDED']);
export type ExpenseStatusType = z.infer<typeof ExpenseStatusEnum>;

// -----------------------------------------------------------------------------
// 1. Expense Category Schemas
// -----------------------------------------------------------------------------
export const createExpenseCategorySchema = z
  .object({
    name: z.string().trim().min(1, 'Category name is required').max(100),
    description: z.string().trim().max(255).optional().nullable(),
    isActive: z.boolean().optional().default(true),
  })
  .strict();

export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>;

export const updateExpenseCategorySchema = createExpenseCategorySchema.partial();
export type UpdateExpenseCategoryInput = z.infer<typeof updateExpenseCategorySchema>;

export const categoryIdParamSchema = z.object({
  id: z.string().uuid('Invalid category ID format'),
});

export const listCategoriesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  search: z.string().trim().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;

// -----------------------------------------------------------------------------
// 2. Expense Schemas
// -----------------------------------------------------------------------------
export const createExpenseSchema = z
  .object({
    categoryId: z.string().uuid('Invalid expense category ID format'),
    amount: z
      .number({ invalid_type_error: 'Amount must be a number' })
      .positive('Expense amount must be greater than 0'),
    paymentMethod: PaymentMethodEnum.optional().default('CASH'),
    description: z.string().trim().min(1, 'Expense description is required').max(255),
    date: z.string().trim().optional().nullable(),
    businessDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Business date must be YYYY-MM-DD')
      .optional()
      .nullable(),
    supplierId: z.string().uuid('Invalid supplier ID format').optional().nullable(),
    shiftId: z.string().uuid('Invalid shift ID format').optional().nullable(),
    reference: z.string().trim().max(100).optional().nullable(),
    receiptUrl: z.string().trim().max(255).optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const updateExpenseSchema = z
  .object({
    categoryId: z.string().uuid('Invalid expense category ID format').optional(),
    description: z.string().trim().min(1).max(255).optional(),
    reference: z.string().trim().max(100).optional().nullable(),
    receiptUrl: z.string().trim().max(255).optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export const expenseIdParamSchema = z.object({
  id: z.string().uuid('Invalid expense ID format'),
});

export const voidExpenseSchema = z
  .object({
    reason: z.string().trim().min(1, 'Void reason is required').max(255),
    managerPin: z.string().trim().optional(),
  })
  .strict();

export type VoidExpenseInput = z.infer<typeof voidExpenseSchema>;

// -----------------------------------------------------------------------------
// 3. Query & Summary Schemas
// -----------------------------------------------------------------------------
export const listExpensesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  businessDate: z.string().trim().optional(),
  categoryId: z.string().uuid().optional(),
  paymentMethod: PaymentMethodEnum.optional(),
  status: ExpenseStatusEnum.optional(),
  supplierId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(),
  search: z.string().trim().optional(),
});

export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;

export const expensesSummaryQuerySchema = z.object({
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  businessDate: z.string().trim().optional(),
  categoryId: z.string().uuid().optional(),
  paymentMethod: PaymentMethodEnum.optional(),
  supplierId: z.string().uuid().optional(),
});

export type ExpensesSummaryQuery = z.infer<typeof expensesSummaryQuerySchema>;
