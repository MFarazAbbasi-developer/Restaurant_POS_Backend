import { Router } from 'express';
import { RestaurantController } from './restaurant.controller.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { requirePermission } from '../../common/middlewares/permission.middleware.js';
import { validateRequest } from '../../common/middlewares/validate.middleware.js';
import { updateRestaurantSchema } from './restaurant.schema.js';

export const restaurantRouter = Router();

// 1. Get current restaurant configuration
restaurantRouter.get(
  '/',
  authenticate,
  requirePermission('settings.view'),
  RestaurantController.getRestaurant,
);

// 2. Update restaurant identity and settings
restaurantRouter.patch(
  '/',
  authenticate,
  requirePermission('settings.manage'),
  validateRequest({ body: updateRestaurantSchema }),
  RestaurantController.updateRestaurant,
);
