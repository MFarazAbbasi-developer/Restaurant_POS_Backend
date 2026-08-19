import { Router } from 'express';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { requirePermission } from '../../common/middlewares/permission.middleware.js';
import { validateRequest } from '../../common/middlewares/validate.middleware.js';
import { ReportController } from './report.controller.js';
import {
  baseReportFilterSchema,
  orderTypeFilterSchema,
  paymentMethodFilterSchema,
  itemsRankingFilterSchema,
} from './report.schema.js';

export const reportsRouter = Router();

// All reporting endpoints require authentication and reports.view permission
reportsRouter.use(authenticate);
reportsRouter.use(requirePermission('reports.view'));

// 1. Executive Sales Summary
reportsRouter.get(
  '/sales-summary',
  validateRequest({ query: baseReportFilterSchema }),
  ReportController.getSalesSummary,
);

// 2. Sales by Order Type (Channel Breakdown)
reportsRouter.get(
  '/by-order-type',
  validateRequest({ query: orderTypeFilterSchema }),
  ReportController.getSalesByOrderType,
);

// 3. Sales by Payment Method
reportsRouter.get(
  '/by-payment-method',
  validateRequest({ query: paymentMethodFilterSchema }),
  ReportController.getSalesByPaymentMethod,
);

// 4. Product / Item Sales Ranking
reportsRouter.get(
  '/items-ranking',
  validateRequest({ query: itemsRankingFilterSchema }),
  ReportController.getItemsRanking,
);

// 5. Category Sales Summary
reportsRouter.get(
  '/by-category',
  validateRequest({ query: baseReportFilterSchema }),
  ReportController.getCategorySales,
);

// 6. Taxes, Discounts, Voids & Cancellations Audit
reportsRouter.get(
  '/financial-adjustments',
  validateRequest({ query: baseReportFilterSchema }),
  ReportController.getFinancialAdjustments,
);

// 7. Hourly Sales & Traffic Trends
reportsRouter.get(
  '/hourly-trends',
  validateRequest({ query: baseReportFilterSchema }),
  ReportController.getHourlyTrends,
);

// 8. Staff & Cashier Performance
reportsRouter.get(
  '/staff-performance',
  validateRequest({ query: baseReportFilterSchema }),
  ReportController.getStaffPerformance,
);

// 9. Shift Settlement Summary
reportsRouter.get(
  '/shifts-summary',
  validateRequest({ query: baseReportFilterSchema }),
  ReportController.getShiftsSummary,
);

// 10. Delivery & Takeaway Operations Performance
reportsRouter.get(
  '/operations-performance',
  validateRequest({ query: baseReportFilterSchema }),
  ReportController.getOperationsPerformance,
);
