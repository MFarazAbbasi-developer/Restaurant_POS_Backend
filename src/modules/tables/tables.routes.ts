import { Router } from 'express';
import { TablesController } from './tables.controller.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { requirePermission } from '../../common/middlewares/permission.middleware.js';
import { validateRequest } from '../../common/middlewares/validate.middleware.js';
import {
  createTableOrderSchema,
  createTableSchema,
  createZoneSchema,
  listTablesQuerySchema,
  mergeTablesSchema,
  reorderZonesSchema,
  tableIdParamSchema,
  tableOrderParamSchema,
  transferTableSchema,
  updateTableOrderStatusSchema,
  updateTableSchema,
  updateTableStatusSchema,
  updateZoneSchema,
  updateZoneStatusSchema,
  zoneIdParamSchema,
} from './tables.schema.js';

// =============================================================================
// Zones Router
// =============================================================================
export const zonesRouter = Router();

zonesRouter.get('/', authenticate, requirePermission('tables.view'), TablesController.listZones);

zonesRouter.post(
  '/',
  authenticate,
  requirePermission('tables.manage'),
  validateRequest({ body: createZoneSchema }),
  TablesController.createZone,
);

zonesRouter.patch(
  '/reorder',
  authenticate,
  requirePermission('tables.manage'),
  validateRequest({ body: reorderZonesSchema }),
  TablesController.reorderZones,
);

zonesRouter.get(
  '/:id',
  authenticate,
  requirePermission('tables.view'),
  validateRequest({ params: zoneIdParamSchema }),
  TablesController.getZone,
);

zonesRouter.patch(
  '/:id',
  authenticate,
  requirePermission('tables.manage'),
  validateRequest({ params: zoneIdParamSchema, body: updateZoneSchema }),
  TablesController.updateZone,
);

zonesRouter.patch(
  '/:id/status',
  authenticate,
  requirePermission('tables.manage'),
  validateRequest({ params: zoneIdParamSchema, body: updateZoneStatusSchema }),
  TablesController.updateZoneStatus,
);

zonesRouter.delete(
  '/:id',
  authenticate,
  requirePermission('tables.manage'),
  validateRequest({ params: zoneIdParamSchema }),
  TablesController.deleteZone,
);

// =============================================================================
// Tables Router
// =============================================================================
export const tablesRouter = Router();

tablesRouter.get(
  '/pos-view',
  authenticate,
  requirePermission('tables.view'),
  TablesController.getPosFloorView,
);

tablesRouter.get(
  '/',
  authenticate,
  requirePermission('tables.view'),
  validateRequest({ query: listTablesQuerySchema }),
  TablesController.listTables,
);

tablesRouter.post(
  '/',
  authenticate,
  requirePermission('tables.manage'),
  validateRequest({ body: createTableSchema }),
  TablesController.createTable,
);

tablesRouter.post(
  '/transfer',
  authenticate,
  requirePermission('tables.view'),
  validateRequest({ body: transferTableSchema }),
  TablesController.transferTable,
);

tablesRouter.post(
  '/merge',
  authenticate,
  requirePermission('tables.view'),
  validateRequest({ body: mergeTablesSchema }),
  TablesController.mergeTables,
);

tablesRouter.get(
  '/:id',
  authenticate,
  requirePermission('tables.view'),
  validateRequest({ params: tableIdParamSchema }),
  TablesController.getTable,
);

tablesRouter.patch(
  '/:id',
  authenticate,
  requirePermission('tables.manage'),
  validateRequest({ params: tableIdParamSchema, body: updateTableSchema }),
  TablesController.updateTable,
);

tablesRouter.patch(
  '/:id/status',
  authenticate,
  requirePermission('tables.view'),
  validateRequest({ params: tableIdParamSchema, body: updateTableStatusSchema }),
  TablesController.updateTableStatus,
);

tablesRouter.post(
  '/:id/unmerge',
  authenticate,
  requirePermission('tables.view'),
  validateRequest({ params: tableIdParamSchema }),
  TablesController.unmergeTable,
);

tablesRouter.delete(
  '/:id',
  authenticate,
  requirePermission('tables.manage'),
  validateRequest({ params: tableIdParamSchema }),
  TablesController.deleteTable,
);

// =============================================================================
// Table Orders / Sub-bills Routes
// =============================================================================
tablesRouter.post(
  '/:id/orders',
  authenticate,
  requirePermission('orders.create'),
  validateRequest({ params: tableIdParamSchema, body: createTableOrderSchema }),
  TablesController.createTableOrder,
);

tablesRouter.get(
  '/:id/orders',
  authenticate,
  requirePermission('orders.view'),
  validateRequest({ params: tableIdParamSchema }),
  TablesController.listTableOrders,
);

tablesRouter.patch(
  '/:id/orders/:orderId/status',
  authenticate,
  requirePermission('orders.update'),
  validateRequest({ params: tableOrderParamSchema, body: updateTableOrderStatusSchema }),
  TablesController.updateTableOrderStatus,
);
