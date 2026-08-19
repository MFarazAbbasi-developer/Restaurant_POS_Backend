import { z } from 'zod';

export const paperWidthEnum = z.enum(['80mm', '58mm']);
export const sampleOrderTypeEnum = z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']);

export const orderIdParamSchema = z.object({
  orderId: z.string().uuid('Invalid order ID format'),
});

export const customerReceiptQuerySchema = z.object({
  paperWidth: paperWidthEnum.default('80mm'),
  includeTaxDetails: z
    .preprocess((val) => (val === undefined ? true : val === 'true' || val === true), z.boolean())
    .default(true),
});

export const kitchenTicketQuerySchema = z.object({
  stationId: z.string().uuid('Invalid station ID format').optional(),
  paperWidth: paperWidthEnum.default('80mm'),
});

export const reprintReceiptSchema = z.object({
  reason: z.string().trim().min(3, 'Reprint reason must be at least 3 characters').max(500),
  paperWidth: paperWidthEnum.default('80mm').optional(),
});

export const previewReceiptQuerySchema = z.object({
  paperWidth: paperWidthEnum.default('80mm'),
  sampleType: sampleOrderTypeEnum.default('DINE_IN'),
});

export type CustomerReceiptQuery = z.infer<typeof customerReceiptQuerySchema>;
export type KitchenTicketQuery = z.infer<typeof kitchenTicketQuerySchema>;
export type ReprintReceiptInput = z.infer<typeof reprintReceiptSchema>;
export type PreviewReceiptQuery = z.infer<typeof previewReceiptQuerySchema>;
