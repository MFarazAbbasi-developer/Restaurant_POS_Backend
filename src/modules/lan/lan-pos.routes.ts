import { Router } from 'express';
import { authRouter } from '../auth/auth.routes.js';
import { menuRouter } from '../menu/menu.routes.js';
import { zonesRouter, tablesRouter } from '../tables/tables.routes.js';
import { takeawayRouter } from '../takeaway/takeaway.routes.js';
import { customerRouter, deliveryRouter } from '../delivery/delivery.routes.js';
import { ordersRouter } from '../orders/order.routes.js';
import { paymentsRouter } from '../payments/payment.routes.js';
import { shiftsRouter } from '../shifts/shift.routes.js';
import { kitchenRouter } from '../kitchen/kitchen.routes.js';
import { receiptsRouter } from '../receipts/receipt.routes.js';
import {
  bindLanRestaurantFromRuntime,
  requireLanClientSignature,
  requireLanRuntimeEnabled,
} from './middlewares/lan-client-auth.middleware.js';
import { requireLanEntitlement } from './middlewares/lan-entitlement.middleware.js';

/**
 * Central LAN POS boundary (Phase 2D.5).
 *
 * Mounted at `/api/v1/lan/v1/pos/*`.
 * Plane B + entitlement + roster gates run BEFORE existing staff JWT / RBAC /
 * manager-PIN handlers on the nested routers. Local `/api/v1/*` routes are unchanged.
 *
 * Inventory (remote terminal day-to-day POS):
 * auth, menu, zones, tables, takeaway, customers, delivery, orders, payments,
 * shifts, kitchen, receipts.
 *
 * Explicitly NOT on this boundary (local/staff-only or deferred):
 * setup, health, staff admin, reports, inventory, purchasing, expenses,
 * promotions, loyalty, reservations, restaurant settings, LAN staff roster mgmt.
 */
export const lanPosRouter = Router();

lanPosRouter.use(requireLanRuntimeEnabled);
lanPosRouter.use(bindLanRestaurantFromRuntime);
lanPosRouter.use(requireLanClientSignature);
lanPosRouter.use(requireLanEntitlement);

lanPosRouter.use('/auth', authRouter);
lanPosRouter.use('/menu', menuRouter);
lanPosRouter.use('/zones', zonesRouter);
lanPosRouter.use('/tables', tablesRouter);
lanPosRouter.use('/takeaway', takeawayRouter);
lanPosRouter.use('/customers', customerRouter);
lanPosRouter.use('/delivery', deliveryRouter);
lanPosRouter.use('/orders', ordersRouter);
lanPosRouter.use('/payments', paymentsRouter);
lanPosRouter.use('/shifts', shiftsRouter);
lanPosRouter.use('/kitchen', kitchenRouter);
lanPosRouter.use('/receipts', receiptsRouter);
