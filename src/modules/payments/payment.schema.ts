import { z } from 'zod';

export const PaymentMethodEnum = z.enum([
  'CASH',
  'CARD',
  'BANK_TRANSFER',
  'DIGITAL_WALLET',
  'OTHER',
]);

export const PaymentStatusEnum = z.enum(['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOIDED']);

export const createPaymentSchema = z
  .object({
    orderId: z.string().uuid('Invalid order ID format'),
    paymentMethod: PaymentMethodEnum.default('CASH'),
    amount: z.number().positive('Payment amount must be greater than 0'),
    amountTendered: z.number().positive('Amount tendered must be greater than 0').optional(),
    reference: z.string().trim().max(100).optional(),
    cardLast4: z
      .string()
      .trim()
      .length(4, 'Card last 4 digits must be exactly 4 digits')
      .regex(/^\d{4}$/, 'Card last 4 digits must be numeric')
      .optional(),
    cardBrand: z.string().trim().max(50).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine(
    (data) => {
      if (data.paymentMethod === 'CASH' && data.amountTendered !== undefined) {
        return data.amountTendered >= data.amount;
      }
      return true;
    },
    {
      message: 'Amount tendered cannot be less than the payment amount',
      path: ['amountTendered'],
    },
  );

export const createRefundSchema = z.object({
  amount: z.number().positive('Refund amount must be greater than 0'),
  reason: z.string().trim().min(3, 'Refund reason is mandatory (minimum 3 characters)').max(500),
  refundMethod: PaymentMethodEnum.optional(),
  reference: z.string().trim().max(100).optional(),
  managerPin: z
    .string()
    .length(4, 'Manager PIN must be exactly 4 digits')
    .regex(/^\d{4}$/, 'Manager PIN must be numeric')
    .optional(),
});

export const listPaymentsQuerySchema = z.object({
  orderId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(),
  paymentMethod: PaymentMethodEnum.optional(),
  status: PaymentStatusEnum.optional(),
  businessDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Business date must be in YYYY-MM-DD format')
    .optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
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

export const paymentIdParamSchema = z.object({
  id: z.string().uuid('Invalid payment ID format'),
});

export const orderPaymentParamSchema = z.object({
  orderId: z.string().uuid('Invalid order ID format'),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type CreateRefundInput = z.infer<typeof createRefundSchema>;
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
