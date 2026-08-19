import { z } from 'zod';

export const ReservationStatusEnum = z.enum([
  'PENDING',
  'CONFIRMED',
  'SEATED',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
]);
export type ReservationStatusType = z.infer<typeof ReservationStatusEnum>;

// -----------------------------------------------------------------------------
// 1. Create Reservation Schema
// -----------------------------------------------------------------------------
export const createReservationSchema = z
  .object({
    customerName: z.string().trim().min(1, 'Customer name is required').max(100),
    customerPhone: z.string().trim().min(3, 'Customer phone is required').max(30),
    customerEmail: z.string().trim().email('Invalid email address').optional().nullable(),
    customerId: z.string().uuid('Invalid customer ID format').optional().nullable(),
    guestCount: z
      .number({ invalid_type_error: 'Guest count must be a number' })
      .int('Guest count must be an integer')
      .min(1, 'Guest count must be at least 1')
      .max(100, 'Guest count cannot exceed 100')
      .default(2),
    tableId: z.string().uuid('Invalid table ID format').optional().nullable(),
    reservationDate: z.string().trim().min(1, 'Reservation date is required'),
    startTime: z.string().trim().min(1, 'Start time is required'),
    durationMinutes: z
      .number({ invalid_type_error: 'Duration minutes must be a number' })
      .int('Duration must be an integer in minutes')
      .min(15, 'Duration must be at least 15 minutes')
      .max(480, 'Duration cannot exceed 8 hours (480 minutes)')
      .default(90),
    status: ReservationStatusEnum.optional().default('CONFIRMED'),
    specialRequests: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

export type CreateReservationInput = z.infer<typeof createReservationSchema>;

// -----------------------------------------------------------------------------
// 2. Update Reservation Schema
// -----------------------------------------------------------------------------
export const updateReservationSchema = z
  .object({
    customerName: z.string().trim().min(1).max(100).optional(),
    customerPhone: z.string().trim().min(3).max(30).optional(),
    customerEmail: z.string().trim().email().optional().nullable(),
    guestCount: z.number().int().min(1).max(100).optional(),
    tableId: z.string().uuid().optional().nullable(),
    reservationDate: z.string().trim().optional(),
    startTime: z.string().trim().optional(),
    durationMinutes: z.number().int().min(15).max(480).optional(),
    specialRequests: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

export type UpdateReservationInput = z.infer<typeof updateReservationSchema>;

// -----------------------------------------------------------------------------
// 3. Status Transition Schema
// -----------------------------------------------------------------------------
export const updateReservationStatusSchema = z
  .object({
    status: ReservationStatusEnum,
    cancelReason: z.string().trim().max(255).optional().nullable(),
  })
  .strict();

export type UpdateReservationStatusInput = z.infer<typeof updateReservationStatusSchema>;

// -----------------------------------------------------------------------------
// 4. Assign / Reassign Table Schema
// -----------------------------------------------------------------------------
export const assignTableSchema = z
  .object({
    tableId: z.string().uuid('Invalid table ID format'),
  })
  .strict();

export type AssignTableInput = z.infer<typeof assignTableSchema>;

// -----------------------------------------------------------------------------
// 5. Query / Availability Schemas
// -----------------------------------------------------------------------------
export const checkAvailabilityQuerySchema = z.object({
  reservationDate: z.string().trim().min(1, 'Reservation date is required'),
  startTime: z.string().trim().min(1, 'Start time is required'),
  durationMinutes: z.coerce.number().int().min(15).max(480).default(90),
  guestCount: z.coerce.number().int().min(1).max(100).default(2),
});

export type CheckAvailabilityQuery = z.infer<typeof checkAvailabilityQuerySchema>;

export const listReservationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  reservationDate: z.string().trim().optional(),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  status: ReservationStatusEnum.optional(),
  tableId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  search: z.string().trim().optional(),
});

export type ListReservationsQuery = z.infer<typeof listReservationsQuerySchema>;

export const reservationIdParamSchema = z.object({
  id: z.string().uuid('Invalid reservation ID format'),
});
