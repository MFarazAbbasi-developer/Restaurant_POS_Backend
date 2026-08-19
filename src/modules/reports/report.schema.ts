import { z } from 'zod';

export const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const baseReportFilterSchema = z.object({
  startDate: z.string().regex(dateRegex, 'startDate must be in YYYY-MM-DD format').optional(),
  endDate: z.string().regex(dateRegex, 'endDate must be in YYYY-MM-DD format').optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const orderTypeFilterSchema = baseReportFilterSchema.extend({
  orderType: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']).optional(),
});

export const paymentMethodFilterSchema = baseReportFilterSchema.extend({
  paymentMethod: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'DIGITAL_WALLET', 'OTHER']).optional(),
});

export const itemsRankingFilterSchema = baseReportFilterSchema.extend({
  categoryId: z.string().uuid('Invalid category ID format').optional(),
  sortBy: z.enum(['quantity', 'revenue']).default('revenue'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
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

export type BaseReportFilter = z.infer<typeof baseReportFilterSchema>;
export type OrderTypeFilter = z.infer<typeof orderTypeFilterSchema>;
export type PaymentMethodFilter = z.infer<typeof paymentMethodFilterSchema>;
export type ItemsRankingFilter = z.infer<typeof itemsRankingFilterSchema>;
