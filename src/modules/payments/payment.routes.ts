import { Router } from 'express';
import { PaymentController } from './payment.controller.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { requirePermission } from '../../common/middlewares/permission.middleware.js';
import { validateRequest } from '../../common/middlewares/validate.middleware.js';
import {
  createPaymentSchema,
  createRefundSchema,
  listPaymentsQuerySchema,
  orderPaymentParamSchema,
  paymentIdParamSchema,
} from './payment.schema.js';

export const paymentsRouter = Router();

// 1. Process payment against an order
paymentsRouter.post(
  '/',
  authenticate,
  requirePermission('payments.create'),
  validateRequest({ body: createPaymentSchema }),
  PaymentController.processPayment,
);

// 2. List & Filter payments
paymentsRouter.get(
  '/',
  authenticate,
  requirePermission('payments.view'),
  validateRequest({ query: listPaymentsQuerySchema }),
  PaymentController.listPayments,
);

// 3. Get all payments and refunds for a specific order
paymentsRouter.get(
  '/order/:orderId',
  authenticate,
  requirePermission('payments.view'),
  validateRequest({ params: orderPaymentParamSchema }),
  PaymentController.getOrderPayments,
);

// 4. Get payment by ID
paymentsRouter.get(
  '/:id',
  authenticate,
  requirePermission('payments.view'),
  validateRequest({ params: paymentIdParamSchema }),
  PaymentController.getPayment,
);

// 5. Refund payment
paymentsRouter.post(
  '/:id/refund',
  authenticate,
  requirePermission('payments.create'),
  validateRequest({
    params: paymentIdParamSchema,
    body: createRefundSchema,
  }),
  PaymentController.refundPayment,
);
