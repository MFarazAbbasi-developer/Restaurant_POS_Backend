import { z } from 'zod';

export const ShiftStatusEnum = z.enum(['OPEN', 'CLOSED']);
export const CashAdjustmentTypeEnum = z.enum(['PAY_IN', 'PAY_OUT']);

export const openShiftSchema = z.object({
  openingCash: z.number().min(0, 'Opening cash balance cannot be negative').default(0),
  registerName: z
    .string()
    .trim()
    .max(100, 'Register name cannot exceed 100 characters')
    .default('Main Register'),
  notes: z.string().trim().max(500).optional(),
});

export const closeShiftSchema = z.object({
  actualClosingCash: z.number().min(0, 'Actual counted cash cannot be negative'),
  closingNotes: z.string().trim().max(500).optional(),
});

export const cashDropSchema = z.object({
  amount: z.number().positive('Cash drop amount must be greater than 0'),
  reason: z.string().trim().min(3, 'Reason is mandatory (minimum 3 characters)').max(500),
  managerPin: z
    .string()
    .length(4, 'Manager PIN must be exactly 4 digits')
    .regex(/^\d{4}$/, 'Manager PIN must be numeric')
    .optional(),
});

export const cashAdjustmentSchema = z.object({
  type: CashAdjustmentTypeEnum,
  amount: z.number().positive('Adjustment amount must be greater than 0'),
  reason: z.string().trim().min(3, 'Reason is mandatory (minimum 3 characters)').max(500),
  managerPin: z
    .string()
    .length(4, 'Manager PIN must be exactly 4 digits')
    .regex(/^\d{4}$/, 'Manager PIN must be numeric')
    .optional(),
});

export const listShiftsQuerySchema = z.object({
  cashierId: z.string().uuid().optional(),
  status: ShiftStatusEnum.optional(),
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

export const shiftIdParamSchema = z.object({
  id: z.string().uuid('Invalid shift ID format'),
});

export type OpenShiftInput = z.infer<typeof openShiftSchema>;
export type CloseShiftInput = z.infer<typeof closeShiftSchema>;
export type CashDropInput = z.infer<typeof cashDropSchema>;
export type CashAdjustmentInput = z.infer<typeof cashAdjustmentSchema>;
export type ListShiftsQuery = z.infer<typeof listShiftsQuerySchema>;
