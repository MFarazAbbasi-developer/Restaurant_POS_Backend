import { Router } from 'express';
import { healthRouter } from '../modules/health/health.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';

export const apiRouter = Router();

// 1. Health check module
apiRouter.use('/health', healthRouter);

// 2. Authentication & Session Management module
apiRouter.use('/auth', authRouter);

/**
 * Future Business Modules:
 *
 * apiRouter.use('/restaurants', restaurantsRouter);
 * apiRouter.use('/users', usersRouter);
 * apiRouter.use('/menu', menuRouter);
 * apiRouter.use('/tables', tablesRouter);
 * apiRouter.use('/orders', ordersRouter);
 * apiRouter.use('/kitchen', kitchenRouter);
 * apiRouter.use('/billing', billingRouter);
 * apiRouter.use('/payments', paymentsRouter);
 * apiRouter.use('/shifts', shiftsRouter);
 * apiRouter.use('/inventory', inventoryRouter);
 * apiRouter.use('/customers', customersRouter);
 * apiRouter.use('/expenses', expensesRouter);
 * apiRouter.use('/reports', reportsRouter);
 */
