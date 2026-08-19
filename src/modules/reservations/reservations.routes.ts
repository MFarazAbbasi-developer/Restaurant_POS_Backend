import { Router } from 'express';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { requirePermission } from '../../common/middlewares/permission.middleware.js';
import { validateRequest } from '../../common/middlewares/validate.middleware.js';
import { ReservationsController } from './reservations.controller.js';
import {
  createReservationSchema,
  updateReservationSchema,
  updateReservationStatusSchema,
  assignTableSchema,
  checkAvailabilityQuerySchema,
  listReservationsQuerySchema,
  reservationIdParamSchema,
} from './reservations.schema.js';

const router = Router();

// Authentication required for all reservation endpoints
router.use(authenticate);

// -----------------------------------------------------------------------------
// Query & Availability Routes
// -----------------------------------------------------------------------------
router.get(
  '/',
  requirePermission('reservations.view'),
  validateRequest({ query: listReservationsQuerySchema }),
  ReservationsController.listReservations,
);

router.get(
  '/availability',
  requirePermission('reservations.view'),
  validateRequest({ query: checkAvailabilityQuerySchema }),
  ReservationsController.checkAvailability,
);

router.get(
  '/:id',
  requirePermission('reservations.view'),
  validateRequest({ params: reservationIdParamSchema }),
  ReservationsController.getReservation,
);

// -----------------------------------------------------------------------------
// Mutation & Lifecycle Routes
// -----------------------------------------------------------------------------
router.post(
  '/',
  requirePermission('reservations.manage'),
  validateRequest({ body: createReservationSchema }),
  ReservationsController.createReservation,
);

router.put(
  '/:id',
  requirePermission('reservations.manage'),
  validateRequest({ params: reservationIdParamSchema, body: updateReservationSchema }),
  ReservationsController.updateReservation,
);

router.put(
  '/:id/assign-table',
  requirePermission('reservations.manage'),
  validateRequest({ params: reservationIdParamSchema, body: assignTableSchema }),
  ReservationsController.assignTable,
);

router.patch(
  '/:id/status',
  requirePermission('reservations.status'),
  validateRequest({ params: reservationIdParamSchema, body: updateReservationStatusSchema }),
  ReservationsController.updateStatus,
);

export const reservationsRouter = router;
