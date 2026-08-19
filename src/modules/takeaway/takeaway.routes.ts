import { Router } from 'express';
import { TakeawayController } from './takeaway.controller.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { requirePermission } from '../../common/middlewares/permission.middleware.js';
import { validateRequest } from '../../common/middlewares/validate.middleware.js';
import {
  cancelTakeawayOrderSchema,
  createTakeawayOrderSchema,
  listTakeawayOrdersQuerySchema,
  takeawayOrderIdParamSchema,
  updateTakeawayStatusSchema,
} from './takeaway.schema.js';

export const takeawayRouter = Router();

// =============================================================================
// Takeaway Routes
// =============================================================================

// 1. Active Takeaway Queue (Fast POS Polling & Display)
takeawayRouter.get(
  '/queue',
  authenticate,
  requirePermission('orders.view'),
  TakeawayController.getActiveQueue,
);

// 2. Create Takeaway Order (Express Counter Flow)
takeawayRouter.post(
  '/orders',
  authenticate,
  requirePermission('orders.create'),
  validateRequest({ body: createTakeawayOrderSchema }),
  TakeawayController.createOrder,
);

// 3. List & Search Takeaway Orders
takeawayRouter.get(
  '/orders',
  authenticate,
  requirePermission('orders.view'),
  validateRequest({ query: listTakeawayOrdersQuerySchema }),
  TakeawayController.listOrders,
);

// 4. Get Single Takeaway Order by ID
takeawayRouter.get(
  '/orders/:id',
  authenticate,
  requirePermission('orders.view'),
  validateRequest({ params: takeawayOrderIdParamSchema }),
  TakeawayController.getOrder,
);

// 5. Update Takeaway Order Lifecycle Status
takeawayRouter.patch(
  '/orders/:id/status',
  authenticate,
  requirePermission('orders.update'),
  validateRequest({
    params: takeawayOrderIdParamSchema,
    body: updateTakeawayStatusSchema,
  }),
  TakeawayController.updateStatus,
);

// 6. Cancel Takeaway Order
takeawayRouter.post(
  '/orders/:id/cancel',
  authenticate,
  requirePermission('orders.cancel'),
  validateRequest({
    params: takeawayOrderIdParamSchema,
    body: cancelTakeawayOrderSchema,
  }),
  TakeawayController.cancelOrder,
);
