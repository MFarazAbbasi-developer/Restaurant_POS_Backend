import { Router } from 'express';
import { healthRouter } from '../modules/health/health.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { restaurantRouter } from '../modules/restaurant/restaurant.routes.js';
import { staffRouter } from '../modules/staff/staff.routes.js';
import { menuRouter } from '../modules/menu/menu.routes.js';
import { zonesRouter, tablesRouter } from '../modules/tables/tables.routes.js';
import { takeawayRouter } from '../modules/takeaway/takeaway.routes.js';
import { customerRouter, deliveryRouter } from '../modules/delivery/delivery.routes.js';
import { ordersRouter } from '../modules/orders/order.routes.js';
import { paymentsRouter } from '../modules/payments/payment.routes.js';
import { shiftsRouter } from '../modules/shifts/shift.routes.js';
import { kitchenRouter } from '../modules/kitchen/kitchen.routes.js';
import { receiptsRouter } from '../modules/receipts/receipt.routes.js';
import { reportsRouter } from '../modules/reports/report.routes.js';
import { inventoryRouter } from '../modules/inventory/inventory.routes.js';
import { promotionRouter } from '../modules/promotions/promotion.routes.js';
import { loyaltyRouter } from '../modules/loyalty/loyalty.routes.js';
import { reservationsRouter } from '../modules/reservations/reservations.routes.js';
import { purchasingRouter } from '../modules/purchasing/purchasing.routes.js';
import { expensesRouter } from '../modules/expenses/expenses.routes.js';
import { setupRouter } from '../modules/setup/setup.routes.js';

export const apiRouter = Router();

// 1. Health check module
apiRouter.use('/health', healthRouter);

// 1b. First-run setup (unauthenticated; locked after first restaurant exists)
apiRouter.use('/setup', setupRouter);

// 2. Authentication & Session Management module
apiRouter.use('/auth', authRouter);

// 3. Restaurant Configuration module
apiRouter.use('/restaurant', restaurantRouter);

// 4. Staff Management module
apiRouter.use('/staff', staffRouter);

// 5. Menu Management module
apiRouter.use('/menu', menuRouter);

// 6. Table & Floor Management module
apiRouter.use('/zones', zonesRouter);
apiRouter.use('/tables', tablesRouter);

// 7. Takeaway Management module
apiRouter.use('/takeaway', takeawayRouter);

// 8. Customer & Delivery Management module
apiRouter.use('/customers', customerRouter);
apiRouter.use('/delivery', deliveryRouter);

// 9. Core Order & Billing module
apiRouter.use('/orders', ordersRouter);

// 10. Payments & Cash Management modules
apiRouter.use('/payments', paymentsRouter);
apiRouter.use('/shifts', shiftsRouter);

// 11. Kitchen Display System (KDS) & Operations module
apiRouter.use('/kitchen', kitchenRouter);

// 12. Receipt & Printing Management module
apiRouter.use('/receipts', receiptsRouter);

// 13. Reporting & Analytics module
apiRouter.use('/reports', reportsRouter);

// 14. Inventory & Stock Management module
apiRouter.use('/inventory', inventoryRouter);

// 15. Discounts & Promotions module
apiRouter.use('/promotions', promotionRouter);

// 16. Loyalty & Customer Rewards module
apiRouter.use('/loyalty', loyaltyRouter);

// 17. Reservations & Table Bookings module
apiRouter.use('/reservations', reservationsRouter);

// 18. Purchasing & Supplier Management module
apiRouter.use('/purchasing', purchasingRouter);

// 19. Expenses & Expense Management module
apiRouter.use('/expenses', expensesRouter);

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
