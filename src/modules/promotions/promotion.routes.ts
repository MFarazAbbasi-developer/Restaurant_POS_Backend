import { Router } from 'express';
import { PromotionController } from './promotion.controller.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { requirePermission } from '../../common/middlewares/permission.middleware.js';
import { validateRequest } from '../../common/middlewares/validate.middleware.js';
import {
  createPromotionSchema,
  updatePromotionSchema,
  listPromotionsQuerySchema,
  previewPromotionsSchema,
  validatePromoCodeSchema,
  promotionIdParamSchema,
} from './promotion.schema.js';

const router = Router();

// Apply authentication middleware to all promotion endpoints
router.use(authenticate);

// -----------------------------------------------------------------------------
// Preview & Validation Endpoints (Accessible by cashier / staff creating orders)
// -----------------------------------------------------------------------------
router.post(
  '/preview',
  requirePermission('promotions.view'),
  validateRequest({ body: previewPromotionsSchema }),
  PromotionController.previewPromotions,
);

router.post(
  '/validate-code',
  requirePermission('promotions.apply'),
  validateRequest({ body: validatePromoCodeSchema }),
  PromotionController.validatePromoCode,
);

// -----------------------------------------------------------------------------
// Core Promotion Management
// -----------------------------------------------------------------------------
router.get(
  '/',
  requirePermission('promotions.view'),
  validateRequest({ query: listPromotionsQuerySchema }),
  PromotionController.listPromotions,
);

router.post(
  '/',
  requirePermission('promotions.manage'),
  validateRequest({ body: createPromotionSchema }),
  PromotionController.createPromotion,
);

router.get(
  '/:id',
  requirePermission('promotions.view'),
  validateRequest({ params: promotionIdParamSchema }),
  PromotionController.getPromotion,
);

router.put(
  '/:id',
  requirePermission('promotions.manage'),
  validateRequest({ params: promotionIdParamSchema, body: updatePromotionSchema }),
  PromotionController.updatePromotion,
);

router.delete(
  '/:id',
  requirePermission('promotions.manage'),
  validateRequest({ params: promotionIdParamSchema }),
  PromotionController.deletePromotion,
);

router.patch(
  '/:id/toggle-status',
  requirePermission('promotions.manage'),
  validateRequest({ params: promotionIdParamSchema }),
  PromotionController.toggleStatus,
);

router.get(
  '/:id/usages',
  requirePermission('promotions.view'),
  validateRequest({ params: promotionIdParamSchema }),
  PromotionController.listUsages,
);

export { router as promotionRouter };
