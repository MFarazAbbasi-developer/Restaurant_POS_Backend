import { Router } from 'express';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { requirePermission } from '../../common/middlewares/permission.middleware.js';
import { validateRequest } from '../../common/middlewares/validate.middleware.js';
import { LoyaltyController } from './loyalty.controller.js';
import {
  updateLoyaltyProgramSchema,
  createLoyaltyTierSchema,
  updateLoyaltyTierSchema,
  loyaltyTierIdParamSchema,
  enrollCustomerSchema,
  customerIdParamSchema,
  previewRedemptionSchema,
  manualPointAdjustmentSchema,
  listLoyaltyAccountsQuerySchema,
  listLoyaltyTransactionsQuerySchema,
} from './loyalty.schema.js';

const router = Router();

// Require authentication for all loyalty endpoints
router.use(authenticate);

// -----------------------------------------------------------------------------
// Program Configuration
// -----------------------------------------------------------------------------
router.get('/program', requirePermission('loyalty.view'), LoyaltyController.getProgram);

router.put(
  '/program',
  requirePermission('loyalty.manage'),
  validateRequest({ body: updateLoyaltyProgramSchema }),
  LoyaltyController.updateProgram,
);

// -----------------------------------------------------------------------------
// Program Summary Analytics
// -----------------------------------------------------------------------------
router.get('/summary', requirePermission('loyalty.view'), LoyaltyController.getSummary);

// -----------------------------------------------------------------------------
// Loyalty Tiers
// -----------------------------------------------------------------------------
router.get('/tiers', requirePermission('loyalty.view'), LoyaltyController.listTiers);

router.post(
  '/tiers',
  requirePermission('loyalty.manage'),
  validateRequest({ body: createLoyaltyTierSchema }),
  LoyaltyController.createTier,
);

router.put(
  '/tiers/:id',
  requirePermission('loyalty.manage'),
  validateRequest({ params: loyaltyTierIdParamSchema, body: updateLoyaltyTierSchema }),
  LoyaltyController.updateTier,
);

router.delete(
  '/tiers/:id',
  requirePermission('loyalty.manage'),
  validateRequest({ params: loyaltyTierIdParamSchema }),
  LoyaltyController.deleteTier,
);

// -----------------------------------------------------------------------------
// Customer Accounts & Enrollment
// -----------------------------------------------------------------------------
router.get(
  '/accounts',
  requirePermission('loyalty.view'),
  validateRequest({ query: listLoyaltyAccountsQuerySchema }),
  LoyaltyController.listAccounts,
);

router.get(
  '/customers/:customerId',
  requirePermission('loyalty.view'),
  validateRequest({ params: customerIdParamSchema }),
  LoyaltyController.getCustomerAccount,
);

router.post(
  '/enroll',
  requirePermission('loyalty.manage'),
  validateRequest({ body: enrollCustomerSchema }),
  LoyaltyController.enrollCustomer,
);

// -----------------------------------------------------------------------------
// Pre-Checkout Redemption Preview
// -----------------------------------------------------------------------------
router.post(
  '/preview-redemption',
  requirePermission('loyalty.view'),
  validateRequest({ body: previewRedemptionSchema }),
  LoyaltyController.previewRedemption,
);

// -----------------------------------------------------------------------------
// Manual Point Adjustment (Direct permission or Manager PIN authorized)
// -----------------------------------------------------------------------------
router.post(
  '/adjust',
  validateRequest({ body: manualPointAdjustmentSchema }),
  LoyaltyController.manualAdjustment,
);

// -----------------------------------------------------------------------------
// Transaction Ledger History
// -----------------------------------------------------------------------------
router.get(
  '/transactions',
  requirePermission('loyalty.view'),
  validateRequest({ query: listLoyaltyTransactionsQuerySchema }),
  LoyaltyController.listTransactions,
);

export const loyaltyRouter = router;
