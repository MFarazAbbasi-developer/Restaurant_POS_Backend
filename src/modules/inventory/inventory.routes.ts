import { Router } from 'express';
import { InventoryController } from './inventory.controller.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { requirePermission } from '../../common/middlewares/permission.middleware.js';
import { validateRequest } from '../../common/middlewares/validate.middleware.js';
import {
  createLocationSchema,
  updateLocationSchema,
  locationIdParamSchema,
  createSupplierSchema,
  updateSupplierSchema,
  supplierIdParamSchema,
  createInventoryItemSchema,
  updateInventoryItemSchema,
  listInventoryItemsQuerySchema,
  inventoryItemIdParamSchema,
  upsertRecipeSchema,
  menuItemRecipeParamSchema,
  recipeIdParamSchema,
  createPurchaseOrderSchema,
  listPurchasesQuerySchema,
  purchaseOrderIdParamSchema,
  createStockAdjustmentSchema,
  listAdjustmentsQuerySchema,
  adjustmentIdParamSchema,
  createStockWastageSchema,
  listWastageQuerySchema,
  wastageIdParamSchema,
  createStockTransferSchema,
  listTransfersQuerySchema,
  transferIdParamSchema,
  listLedgerQuerySchema,
} from './inventory.schema.js';

export const inventoryRouter = Router();

// -----------------------------------------------------------------------------
// 1. Stock Locations
// -----------------------------------------------------------------------------
inventoryRouter.get(
  '/locations',
  authenticate,
  requirePermission('inventory.view'),
  InventoryController.listLocations,
);

inventoryRouter.post(
  '/locations',
  authenticate,
  requirePermission('inventory.manage'),
  validateRequest({ body: createLocationSchema }),
  InventoryController.createLocation,
);

inventoryRouter.get(
  '/locations/:id',
  authenticate,
  requirePermission('inventory.view'),
  validateRequest({ params: locationIdParamSchema }),
  InventoryController.getLocation,
);

inventoryRouter.patch(
  '/locations/:id',
  authenticate,
  requirePermission('inventory.manage'),
  validateRequest({
    params: locationIdParamSchema,
    body: updateLocationSchema,
  }),
  InventoryController.updateLocation,
);

inventoryRouter.delete(
  '/locations/:id',
  authenticate,
  requirePermission('inventory.manage'),
  validateRequest({ params: locationIdParamSchema }),
  InventoryController.deleteLocation,
);

// -----------------------------------------------------------------------------
// 2. Suppliers
// -----------------------------------------------------------------------------
inventoryRouter.get(
  '/suppliers',
  authenticate,
  requirePermission('inventory.view'),
  InventoryController.listSuppliers,
);

inventoryRouter.post(
  '/suppliers',
  authenticate,
  requirePermission('inventory.manage'),
  validateRequest({ body: createSupplierSchema }),
  InventoryController.createSupplier,
);

inventoryRouter.get(
  '/suppliers/:id',
  authenticate,
  requirePermission('inventory.view'),
  validateRequest({ params: supplierIdParamSchema }),
  InventoryController.getSupplier,
);

inventoryRouter.patch(
  '/suppliers/:id',
  authenticate,
  requirePermission('inventory.manage'),
  validateRequest({
    params: supplierIdParamSchema,
    body: updateSupplierSchema,
  }),
  InventoryController.updateSupplier,
);

inventoryRouter.delete(
  '/suppliers/:id',
  authenticate,
  requirePermission('inventory.manage'),
  validateRequest({ params: supplierIdParamSchema }),
  InventoryController.deleteSupplier,
);

// -----------------------------------------------------------------------------
// 3. Inventory Items
// -----------------------------------------------------------------------------
inventoryRouter.get(
  '/items',
  authenticate,
  requirePermission('inventory.view'),
  validateRequest({ query: listInventoryItemsQuerySchema }),
  InventoryController.listItems,
);

inventoryRouter.post(
  '/items',
  authenticate,
  requirePermission('inventory.manage'),
  validateRequest({ body: createInventoryItemSchema }),
  InventoryController.createItem,
);

inventoryRouter.get(
  '/items/:id',
  authenticate,
  requirePermission('inventory.view'),
  validateRequest({ params: inventoryItemIdParamSchema }),
  InventoryController.getItem,
);

inventoryRouter.patch(
  '/items/:id',
  authenticate,
  requirePermission('inventory.manage'),
  validateRequest({
    params: inventoryItemIdParamSchema,
    body: updateInventoryItemSchema,
  }),
  InventoryController.updateItem,
);

inventoryRouter.delete(
  '/items/:id',
  authenticate,
  requirePermission('inventory.manage'),
  validateRequest({ params: inventoryItemIdParamSchema }),
  InventoryController.deleteItem,
);

// -----------------------------------------------------------------------------
// 4. Recipes / Bill of Materials (BOM)
// -----------------------------------------------------------------------------
inventoryRouter.post(
  '/recipes',
  authenticate,
  requirePermission('inventory.manage'),
  validateRequest({ body: upsertRecipeSchema }),
  InventoryController.upsertRecipe,
);

inventoryRouter.get(
  '/recipes/menu-item/:menuItemId',
  authenticate,
  requirePermission('inventory.view'),
  validateRequest({ params: menuItemRecipeParamSchema }),
  InventoryController.getMenuItemRecipes,
);

inventoryRouter.delete(
  '/recipes/:id',
  authenticate,
  requirePermission('inventory.manage'),
  validateRequest({ params: recipeIdParamSchema }),
  InventoryController.deleteRecipe,
);

// -----------------------------------------------------------------------------
// 5. Purchases & Receiving
// -----------------------------------------------------------------------------
inventoryRouter.post(
  '/purchases',
  authenticate,
  requirePermission('inventory.receive'),
  validateRequest({ body: createPurchaseOrderSchema }),
  InventoryController.createPurchaseOrder,
);

inventoryRouter.get(
  '/purchases',
  authenticate,
  requirePermission('inventory.view'),
  validateRequest({ query: listPurchasesQuerySchema }),
  InventoryController.listPurchases,
);

inventoryRouter.get(
  '/purchases/:id',
  authenticate,
  requirePermission('inventory.view'),
  validateRequest({ params: purchaseOrderIdParamSchema }),
  InventoryController.getPurchase,
);

// -----------------------------------------------------------------------------
// 6. Stock Adjustments
// -----------------------------------------------------------------------------
inventoryRouter.post(
  '/adjustments',
  authenticate,
  requirePermission('inventory.adjust'),
  validateRequest({ body: createStockAdjustmentSchema }),
  InventoryController.createStockAdjustment,
);

inventoryRouter.get(
  '/adjustments',
  authenticate,
  requirePermission('inventory.view'),
  validateRequest({ query: listAdjustmentsQuerySchema }),
  InventoryController.listAdjustments,
);

inventoryRouter.get(
  '/adjustments/:id',
  authenticate,
  requirePermission('inventory.view'),
  validateRequest({ params: adjustmentIdParamSchema }),
  InventoryController.getAdjustment,
);

// -----------------------------------------------------------------------------
// 7. Stock Wastage
// -----------------------------------------------------------------------------
inventoryRouter.post(
  '/wastage',
  authenticate,
  requirePermission('inventory.waste'),
  validateRequest({ body: createStockWastageSchema }),
  InventoryController.createStockWastage,
);

inventoryRouter.get(
  '/wastage',
  authenticate,
  requirePermission('inventory.view'),
  validateRequest({ query: listWastageQuerySchema }),
  InventoryController.listWastage,
);

inventoryRouter.get(
  '/wastage/:id',
  authenticate,
  requirePermission('inventory.view'),
  validateRequest({ params: wastageIdParamSchema }),
  InventoryController.getWastage,
);

// -----------------------------------------------------------------------------
// 8. Stock Transfers
// -----------------------------------------------------------------------------
inventoryRouter.post(
  '/transfers',
  authenticate,
  requirePermission('inventory.transfer'),
  validateRequest({ body: createStockTransferSchema }),
  InventoryController.createStockTransfer,
);

inventoryRouter.get(
  '/transfers',
  authenticate,
  requirePermission('inventory.view'),
  validateRequest({ query: listTransfersQuerySchema }),
  InventoryController.listTransfers,
);

inventoryRouter.get(
  '/transfers/:id',
  authenticate,
  requirePermission('inventory.view'),
  validateRequest({ params: transferIdParamSchema }),
  InventoryController.getTransfer,
);

// -----------------------------------------------------------------------------
// 9. Stock Movement Ledger
// -----------------------------------------------------------------------------
inventoryRouter.get(
  '/ledger',
  authenticate,
  requirePermission('inventory.view'),
  validateRequest({ query: listLedgerQuerySchema }),
  InventoryController.listLedger,
);

// -----------------------------------------------------------------------------
// 10. Summaries, Low-Stock & Valuation
// -----------------------------------------------------------------------------
inventoryRouter.get(
  '/summary',
  authenticate,
  requirePermission('inventory.view'),
  InventoryController.getSummary,
);

inventoryRouter.get(
  '/low-stock',
  authenticate,
  requirePermission('inventory.view'),
  InventoryController.getLowStock,
);

inventoryRouter.get(
  '/valuation',
  authenticate,
  requirePermission('inventory.view'),
  InventoryController.getValuation,
);
