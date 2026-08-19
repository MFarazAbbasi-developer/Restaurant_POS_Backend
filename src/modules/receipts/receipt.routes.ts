import { Router } from 'express';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { requirePermission } from '../../common/middlewares/permission.middleware.js';
import { validateRequest } from '../../common/middlewares/validate.middleware.js';
import { ReceiptController } from './receipt.controller.js';
import {
  orderIdParamSchema,
  customerReceiptQuerySchema,
  kitchenTicketQuerySchema,
  reprintReceiptSchema,
  previewReceiptQuerySchema,
} from './receipt.schema.js';

export const receiptsRouter = Router();

// All receipt endpoints require valid authentication
receiptsRouter.use(authenticate);

receiptsRouter.get(
  '/preview',
  requirePermission('receipts.view'),
  validateRequest({ query: previewReceiptQuerySchema }),
  ReceiptController.getPreviewReceipt,
);

receiptsRouter.get(
  '/orders/:orderId/customer',
  requirePermission('receipts.view'),
  validateRequest({
    params: orderIdParamSchema,
    query: customerReceiptQuerySchema,
  }),
  ReceiptController.getCustomerReceipt,
);

receiptsRouter.get(
  '/orders/:orderId/kitchen',
  requirePermission('receipts.view'),
  validateRequest({
    params: orderIdParamSchema,
    query: kitchenTicketQuerySchema,
  }),
  ReceiptController.getKitchenTicket,
);

receiptsRouter.post(
  '/orders/:orderId/reprint',
  requirePermission('receipts.reprint'),
  validateRequest({
    params: orderIdParamSchema,
    body: reprintReceiptSchema,
  }),
  ReceiptController.reprintReceipt,
);
