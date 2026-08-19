import { Router } from 'express';
import { DeliveryController } from './delivery.controller.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { requirePermission } from '../../common/middlewares/permission.middleware.js';
import { validateRequest } from '../../common/middlewares/validate.middleware.js';
import {
  addCustomerAddressSchema,
  assignRiderSchema,
  cancelDeliveryOrderSchema,
  createCustomerSchema,
  createDeliveryOrderSchema,
  createDeliveryZoneSchema,
  createRiderSettlementSchema,
  customerIdParamSchema,
  customerPhoneQuerySchema,
  deliveryOrderIdParamSchema,
  deliveryZoneIdParamSchema,
  listCustomersQuerySchema,
  listDeliveryOrdersQuerySchema,
  riderIdParamSchema,
  updateCustomerSchema,
  updateDeliveryStatusSchema,
  updateDeliveryZoneSchema,
} from './delivery.schema.js';

// =============================================================================
// Customer Routes
// =============================================================================
export const customerRouter = Router();

// 1. Customer Lookup by Phone
customerRouter.get(
  '/lookup',
  authenticate,
  requirePermission('customer.view'),
  validateRequest({ query: customerPhoneQuerySchema }),
  DeliveryController.lookupCustomerByPhone,
);

// 2. List Customers
customerRouter.get(
  '/',
  authenticate,
  requirePermission('customer.view'),
  validateRequest({ query: listCustomersQuerySchema }),
  DeliveryController.listCustomers,
);

// 3. Create Customer
customerRouter.post(
  '/',
  authenticate,
  requirePermission('customer.manage'),
  validateRequest({ body: createCustomerSchema }),
  DeliveryController.createCustomer,
);

// 4. Update Customer Profile
customerRouter.patch(
  '/:id',
  authenticate,
  requirePermission('customer.manage'),
  validateRequest({ params: customerIdParamSchema, body: updateCustomerSchema }),
  DeliveryController.updateCustomer,
);

// 5. Add Customer Address
customerRouter.post(
  '/:id/addresses',
  authenticate,
  requirePermission('customer.manage'),
  validateRequest({ params: customerIdParamSchema, body: addCustomerAddressSchema }),
  DeliveryController.addCustomerAddress,
);

// =============================================================================
// Delivery Management Routes
// =============================================================================
export const deliveryRouter = Router();

// 1. Dispatcher Active Queue View
deliveryRouter.get(
  '/dispatcher',
  authenticate,
  requirePermission('delivery.view'),
  DeliveryController.getDispatcherQueue,
);

// 2. Create Delivery Order (Phone-in, WhatsApp, Aggregator)
deliveryRouter.post(
  '/orders',
  authenticate,
  requirePermission('delivery.create'),
  validateRequest({ body: createDeliveryOrderSchema }),
  DeliveryController.createOrder,
);

// 3. List & Filter Delivery Orders
deliveryRouter.get(
  '/orders',
  authenticate,
  requirePermission('delivery.view'),
  validateRequest({ query: listDeliveryOrdersQuerySchema }),
  DeliveryController.listOrders,
);

// 4. Get Delivery Order by ID
deliveryRouter.get(
  '/orders/:id',
  authenticate,
  requirePermission('delivery.view'),
  validateRequest({ params: deliveryOrderIdParamSchema }),
  DeliveryController.getOrder,
);

// 5. Update Delivery Status Lifecycle
deliveryRouter.patch(
  '/orders/:id/status',
  authenticate,
  requirePermission('delivery.update'),
  validateRequest({
    params: deliveryOrderIdParamSchema,
    body: updateDeliveryStatusSchema,
  }),
  DeliveryController.updateStatus,
);

// 6. Assign / Reassign Rider to Delivery Order
deliveryRouter.post(
  '/orders/:id/assign-rider',
  authenticate,
  requirePermission('delivery.dispatch'),
  validateRequest({
    params: deliveryOrderIdParamSchema,
    body: assignRiderSchema,
  }),
  DeliveryController.assignRider,
);

// 7. Cancel Delivery Order
deliveryRouter.post(
  '/orders/:id/cancel',
  authenticate,
  requirePermission('delivery.cancel'),
  validateRequest({
    params: deliveryOrderIdParamSchema,
    body: cancelDeliveryOrderSchema,
  }),
  DeliveryController.cancelOrder,
);

// 8. Delivery Zones
deliveryRouter.get(
  '/zones',
  authenticate,
  requirePermission('delivery.view'),
  DeliveryController.listDeliveryZones,
);

deliveryRouter.get(
  '/zones/:id',
  authenticate,
  requirePermission('delivery.view'),
  validateRequest({ params: deliveryZoneIdParamSchema }),
  DeliveryController.getDeliveryZone,
);

deliveryRouter.post(
  '/zones',
  authenticate,
  requirePermission('delivery.manage_zones'),
  validateRequest({ body: createDeliveryZoneSchema }),
  DeliveryController.createDeliveryZone,
);

deliveryRouter.patch(
  '/zones/:id',
  authenticate,
  requirePermission('delivery.manage_zones'),
  validateRequest({
    params: deliveryZoneIdParamSchema,
    body: updateDeliveryZoneSchema,
  }),
  DeliveryController.updateDeliveryZone,
);

// 9. Rider Operations & Reconciliation Ledger
deliveryRouter.get(
  '/riders',
  authenticate,
  requirePermission('delivery.view'),
  DeliveryController.listRiders,
);

deliveryRouter.get(
  '/riders/:riderId/active',
  authenticate,
  requirePermission('delivery.view'),
  validateRequest({ params: riderIdParamSchema }),
  DeliveryController.getRiderActiveDeliveries,
);

deliveryRouter.get(
  '/riders/:riderId/outstanding',
  authenticate,
  requirePermission('delivery.rider_settlement'),
  validateRequest({ params: riderIdParamSchema }),
  DeliveryController.getRiderOutstandingSummary,
);

deliveryRouter.post(
  '/riders/settle',
  authenticate,
  requirePermission('delivery.rider_settlement'),
  validateRequest({ body: createRiderSettlementSchema }),
  DeliveryController.recordRiderSettlement,
);

deliveryRouter.get(
  '/settlements',
  authenticate,
  requirePermission('delivery.rider_settlement'),
  DeliveryController.listSettlements,
);
