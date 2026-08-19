import { Router } from 'express';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { requirePermission } from '../../common/middlewares/permission.middleware.js';
import { validateRequest } from '../../common/middlewares/validate.middleware.js';
import { KitchenController } from './kitchen.controller.js';
import {
  createKitchenStationSchema,
  updateKitchenStationSchema,
  stationIdParamSchema,
  updateOrderKitchenStatusSchema,
  updateItemKitchenStatusSchema,
  orderIdParamSchema,
  orderItemParamSchema,
  kitchenQueueQuerySchema,
  recallSchema,
} from './kitchen.schema.js';

export const kitchenRouter = Router();

// All kitchen endpoints require valid authentication
kitchenRouter.use(authenticate);

// -----------------------------------------------------------------------------
// 1. Kitchen Queue & Order Bump Operations
// -----------------------------------------------------------------------------

kitchenRouter.get(
  '/queue',
  requirePermission('kitchen.view'),
  validateRequest({ query: kitchenQueueQuerySchema }),
  KitchenController.getKitchenQueue,
);

kitchenRouter.get(
  '/performance',
  requirePermission('kitchen.view'),
  KitchenController.getKitchenPerformance,
);

kitchenRouter.get(
  '/orders/:id',
  requirePermission('kitchen.view'),
  validateRequest({ params: orderIdParamSchema }),
  KitchenController.getKitchenOrderById,
);

kitchenRouter.patch(
  '/orders/:id/status',
  requirePermission('kitchen.update'),
  validateRequest({
    params: orderIdParamSchema,
    body: updateOrderKitchenStatusSchema,
  }),
  KitchenController.updateOrderKitchenStatus,
);

kitchenRouter.post(
  '/orders/:id/recall',
  requirePermission('kitchen.update'),
  validateRequest({
    params: orderIdParamSchema,
    body: recallSchema,
  }),
  KitchenController.recallOrder,
);

kitchenRouter.patch(
  '/orders/:orderId/items/:itemId/status',
  requirePermission('kitchen.update'),
  validateRequest({
    params: orderItemParamSchema,
    body: updateItemKitchenStatusSchema,
  }),
  KitchenController.updateItemKitchenStatus,
);

kitchenRouter.post(
  '/orders/:orderId/items/:itemId/recall',
  requirePermission('kitchen.update'),
  validateRequest({
    params: orderItemParamSchema,
    body: recallSchema,
  }),
  KitchenController.recallItem,
);

// -----------------------------------------------------------------------------
// 2. Kitchen Stations Management
// -----------------------------------------------------------------------------

kitchenRouter.post(
  '/stations',
  requirePermission('kitchen.manage'),
  validateRequest({ body: createKitchenStationSchema }),
  KitchenController.createStation,
);

kitchenRouter.get('/stations', requirePermission('kitchen.view'), KitchenController.listStations);

kitchenRouter.get(
  '/stations/:id',
  requirePermission('kitchen.view'),
  validateRequest({ params: stationIdParamSchema }),
  KitchenController.getStationById,
);

kitchenRouter.patch(
  '/stations/:id',
  requirePermission('kitchen.manage'),
  validateRequest({
    params: stationIdParamSchema,
    body: updateKitchenStationSchema,
  }),
  KitchenController.updateStation,
);

kitchenRouter.delete(
  '/stations/:id',
  requirePermission('kitchen.manage'),
  validateRequest({ params: stationIdParamSchema }),
  KitchenController.deleteStation,
);
