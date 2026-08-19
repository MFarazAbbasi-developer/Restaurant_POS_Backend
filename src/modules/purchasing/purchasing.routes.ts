import { Router } from 'express';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { requirePermission } from '../../common/middlewares/permission.middleware.js';
import { validateRequest } from '../../common/middlewares/validate.middleware.js';
import { PurchasingController } from './purchasing.controller.js';
import {
  createSupplierSchema,
  updateSupplierSchema,
  supplierIdParamSchema,
  listSuppliersQuerySchema,
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  purchaseOrderIdParamSchema,
  receiveGoodsSchema,
  createPurchaseReturnSchema,
  listPurchasesQuerySchema,
  purchasingSummaryQuerySchema,
} from './purchasing.schema.js';

const router = Router();

// Require authentication for all purchasing endpoints
router.use(authenticate);

// =============================================================================
// 1. Supplier Routes
// =============================================================================
router.get(
  '/suppliers',
  requirePermission('purchasing.view'),
  validateRequest({ query: listSuppliersQuerySchema }),
  PurchasingController.listSuppliers,
);

router.post(
  '/suppliers',
  requirePermission('suppliers.manage'),
  validateRequest({ body: createSupplierSchema }),
  PurchasingController.createSupplier,
);

router.get(
  '/suppliers/:id',
  requirePermission('purchasing.view'),
  validateRequest({ params: supplierIdParamSchema }),
  PurchasingController.getSupplier,
);

router.put(
  '/suppliers/:id',
  requirePermission('suppliers.manage'),
  validateRequest({ params: supplierIdParamSchema, body: updateSupplierSchema }),
  PurchasingController.updateSupplier,
);

router.delete(
  '/suppliers/:id',
  requirePermission('suppliers.manage'),
  validateRequest({ params: supplierIdParamSchema }),
  PurchasingController.deleteSupplier,
);

router.get(
  '/suppliers/:id/history',
  requirePermission('purchasing.view'),
  validateRequest({ params: supplierIdParamSchema }),
  PurchasingController.getSupplierPurchaseHistory,
);

// =============================================================================
// 2. Purchase Orders Workflow Routes
// =============================================================================
router.get(
  '/orders',
  requirePermission('purchasing.view'),
  validateRequest({ query: listPurchasesQuerySchema }),
  PurchasingController.listPurchaseOrders,
);

router.post(
  '/orders',
  requirePermission('purchasing.manage'),
  validateRequest({ body: createPurchaseOrderSchema }),
  PurchasingController.createPurchaseOrder,
);

router.get(
  '/orders/:id',
  requirePermission('purchasing.view'),
  validateRequest({ params: purchaseOrderIdParamSchema }),
  PurchasingController.getPurchaseOrder,
);

router.put(
  '/orders/:id',
  requirePermission('purchasing.manage'),
  validateRequest({ params: purchaseOrderIdParamSchema, body: updatePurchaseOrderSchema }),
  PurchasingController.updatePurchaseOrder,
);

router.post(
  '/orders/:id/order',
  requirePermission('purchasing.manage'),
  validateRequest({ params: purchaseOrderIdParamSchema }),
  PurchasingController.orderPurchaseOrder,
);

router.post(
  '/orders/:id/receive',
  requirePermission('purchasing.receive'),
  validateRequest({ params: purchaseOrderIdParamSchema, body: receiveGoodsSchema }),
  PurchasingController.receiveGoods,
);

router.post(
  '/orders/:id/returns',
  requirePermission('purchasing.receive'),
  validateRequest({ params: purchaseOrderIdParamSchema, body: createPurchaseReturnSchema }),
  PurchasingController.createPurchaseReturn,
);

router.post(
  '/orders/:id/cancel',
  requirePermission('purchasing.manage'),
  validateRequest({ params: purchaseOrderIdParamSchema }),
  PurchasingController.cancelPurchaseOrder,
);

// =============================================================================
// 3. Analytics & Summary Route
// =============================================================================
router.get(
  '/summary',
  requirePermission('purchasing.view'),
  validateRequest({ query: purchasingSummaryQuerySchema }),
  PurchasingController.getPurchasingSummary,
);

export const purchasingRouter = router;
