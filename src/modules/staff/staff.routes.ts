import { Router } from 'express';
import { StaffController } from './staff.controller.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { requirePermission } from '../../common/middlewares/permission.middleware.js';
import { validateRequest } from '../../common/middlewares/validate.middleware.js';
import {
  createStaffSchema,
  listStaffQuerySchema,
  staffIdParamSchema,
  updateStaffPinSchema,
  updateStaffRolesSchema,
  updateStaffSchema,
  updateStaffStatusSchema,
} from './staff.schema.js';

export const staffRouter = Router();

// 1. List staff members
staffRouter.get(
  '/',
  authenticate,
  requirePermission('users.view'),
  validateRequest({ query: listStaffQuerySchema }),
  StaffController.listStaff,
);

// 2. List available restaurant roles
staffRouter.get('/roles', authenticate, requirePermission('users.view'), StaffController.listRoles);

// 3. Get staff member by ID
staffRouter.get(
  '/:id',
  authenticate,
  requirePermission('users.view'),
  validateRequest({ params: staffIdParamSchema }),
  StaffController.getStaffById,
);

// 4. Create new staff member
staffRouter.post(
  '/',
  authenticate,
  requirePermission('users.manage'),
  validateRequest({ body: createStaffSchema }),
  StaffController.createStaff,
);

// 5. Update staff profile details
staffRouter.patch(
  '/:id',
  authenticate,
  requirePermission('users.manage'),
  validateRequest({ params: staffIdParamSchema, body: updateStaffSchema }),
  StaffController.updateStaff,
);

// 6. Activate / Deactivate staff member
staffRouter.patch(
  '/:id/status',
  authenticate,
  requirePermission('users.manage'),
  validateRequest({ params: staffIdParamSchema, body: updateStaffStatusSchema }),
  StaffController.updateStaffStatus,
);

// 7. Reset / Change staff PIN
staffRouter.patch(
  '/:id/pin',
  authenticate,
  requirePermission('users.manage'),
  validateRequest({ params: staffIdParamSchema, body: updateStaffPinSchema }),
  StaffController.updateStaffPin,
);

// 8. Assign / Remove staff roles
staffRouter.patch(
  '/:id/roles',
  authenticate,
  requirePermission('users.manage'),
  validateRequest({ params: staffIdParamSchema, body: updateStaffRolesSchema }),
  StaffController.updateStaffRoles,
);
