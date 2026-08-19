import { Router } from 'express';
import { OrderController } from './order.controller.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { requirePermission } from '../../common/middlewares/permission.middleware.js';
import { validateRequest } from '../../common/middlewares/validate.middleware.js';
import {
  addOrderItemsSchema,
  applyOrderDiscountSchema,
  cancelOrderSchema,
  createOrderSchema,
  listOrdersQuerySchema,
  orderIdParamSchema,
  orderItemParamSchema,
  tableIdParamSchema,
  updateOrderStatusSchema,
  voidOrderItemSchema,
  voidOrderSchema,
} from './order.schema.js';

export const ordersRouter = Router();

// 1. Get Daily Summary Metrics
ordersRouter.get(
  '/summary/daily',
  authenticate,
  requirePermission('orders.view'),
  OrderController.getDailySummary,
);

// 2. Get Active Orders for a Dining Table
ordersRouter.get(
  '/table/:tableId',
  authenticate,
  requirePermission('orders.view'),
  validateRequest({ params: tableIdParamSchema }),
  OrderController.getTableOrders,
);

// 3. List & Filter Orders
ordersRouter.get(
  '/',
  authenticate,
  requirePermission('orders.view'),
  validateRequest({ query: listOrdersQuerySchema }),
  OrderController.listOrders,
);

// 4. Create a new Order
ordersRouter.post(
  '/',
  authenticate,
  requirePermission('orders.create'),
  validateRequest({ body: createOrderSchema }),
  OrderController.createOrder,
);

// 5. Get Order by ID
ordersRouter.get(
  '/:id',
  authenticate,
  requirePermission('orders.view'),
  validateRequest({ params: orderIdParamSchema }),
  OrderController.getOrder,
);

// 6. Add Items to an Active Order
ordersRouter.patch(
  '/:id/items',
  authenticate,
  requirePermission('orders.update'),
  validateRequest({
    params: orderIdParamSchema,
    body: addOrderItemsSchema,
  }),
  OrderController.addItems,
);

// 7. Void a Single Item in an Order
ordersRouter.post(
  '/:id/items/:itemId/void',
  authenticate,
  requirePermission('orders.update'),
  validateRequest({
    params: orderItemParamSchema,
    body: voidOrderItemSchema,
  }),
  OrderController.voidItem,
);

// 8. Apply Order-Level Discount
ordersRouter.post(
  '/:id/discount',
  authenticate,
  requirePermission('orders.update'),
  validateRequest({
    params: orderIdParamSchema,
    body: applyOrderDiscountSchema,
  }),
  OrderController.applyDiscount,
);

// 9. Update Order Lifecycle Status
ordersRouter.patch(
  '/:id/status',
  authenticate,
  requirePermission('orders.update'),
  validateRequest({
    params: orderIdParamSchema,
    body: updateOrderStatusSchema,
  }),
  OrderController.updateStatus,
);

// 10. Cancel Order
ordersRouter.post(
  '/:id/cancel',
  authenticate,
  requirePermission('orders.cancel'),
  validateRequest({
    params: orderIdParamSchema,
    body: cancelOrderSchema,
  }),
  OrderController.cancelOrder,
);

// 11. Void Entire Order
ordersRouter.post(
  '/:id/void',
  authenticate,
  requirePermission('orders.update'),
  validateRequest({
    params: orderIdParamSchema,
    body: voidOrderSchema,
  }),
  OrderController.voidOrder,
);
