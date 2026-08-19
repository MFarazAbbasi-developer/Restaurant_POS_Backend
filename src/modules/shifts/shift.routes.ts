import { Router } from 'express';
import { ShiftController } from './shift.controller.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { requirePermission } from '../../common/middlewares/permission.middleware.js';
import { validateRequest } from '../../common/middlewares/validate.middleware.js';
import {
  cashAdjustmentSchema,
  cashDropSchema,
  closeShiftSchema,
  listShiftsQuerySchema,
  openShiftSchema,
  shiftIdParamSchema,
} from './shift.schema.js';

export const shiftsRouter = Router();

// 1. Open a new register shift
shiftsRouter.post(
  '/open',
  authenticate,
  requirePermission('shifts.open'),
  validateRequest({ body: openShiftSchema }),
  ShiftController.openShift,
);

// 2. Get current active shift for logged-in cashier
shiftsRouter.get(
  '/current',
  authenticate,
  requirePermission('shifts.view'),
  ShiftController.getCurrentShift,
);

// 3. Perform a cash drop / safe deposit on current shift
shiftsRouter.post(
  '/current/cash-drop',
  authenticate,
  requirePermission('shifts.view'),
  validateRequest({ body: cashDropSchema }),
  ShiftController.recordCashDrop,
);

// 4. Record a cash adjustment (Pay In / Pay Out) on current shift
shiftsRouter.post(
  '/current/adjustment',
  authenticate,
  requirePermission('shifts.view'),
  validateRequest({ body: cashAdjustmentSchema }),
  ShiftController.recordCashAdjustment,
);

// 5. Close and settle current shift
shiftsRouter.post(
  '/current/close',
  authenticate,
  requirePermission('shifts.close'),
  validateRequest({ body: closeShiftSchema }),
  ShiftController.closeShift,
);

// 6. Get shift settlement summary report
shiftsRouter.get(
  '/:id/summary',
  authenticate,
  requirePermission('shifts.view'),
  validateRequest({ params: shiftIdParamSchema }),
  ShiftController.getShiftSummary,
);

// 7. Get shift by ID
shiftsRouter.get(
  '/:id',
  authenticate,
  requirePermission('shifts.view'),
  validateRequest({ params: shiftIdParamSchema }),
  ShiftController.getShift,
);

// 8. List & filter shifts
shiftsRouter.get(
  '/',
  authenticate,
  requirePermission('shifts.view'),
  validateRequest({ query: listShiftsQuerySchema }),
  ShiftController.listShifts,
);
