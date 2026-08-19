import { Router } from 'express';
import { MenuController } from './menu.controller.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { requirePermission } from '../../common/middlewares/permission.middleware.js';
import { validateRequest } from '../../common/middlewares/validate.middleware.js';
import {
  categoryIdParamSchema,
  createCategorySchema,
  createMenuItemSchema,
  createModifierGroupSchema,
  createModifierSchema,
  createVariantSchema,
  groupModifierParamSchema,
  itemModifierGroupParamSchema,
  itemVariantParamSchema,
  linkItemModifierGroupSchema,
  listMenuItemsQuerySchema,
  menuItemIdParamSchema,
  modifierGroupIdParamSchema,
  modifierIdParamSchema,
  reorderCategoriesSchema,
  updateCategorySchema,
  updateCategoryStatusSchema,
  updateMenuItemAvailabilitySchema,
  updateMenuItemSchema,
  updateMenuItemStatusSchema,
  updateModifierGroupSchema,
  updateModifierGroupStatusSchema,
  updateModifierSchema,
  updateVariantSchema,
  variantIdParamSchema,
} from './menu.schema.js';

export const menuRouter = Router();

// =============================================================================
// 1. POS Menu Route
// =============================================================================
menuRouter.get('/pos', authenticate, requirePermission('menu.view'), MenuController.getPosMenu);

// =============================================================================
// 2. Categories
// =============================================================================
menuRouter.post(
  '/categories',
  authenticate,
  requirePermission('menu.manage'),
  validateRequest({ body: createCategorySchema }),
  MenuController.createCategory,
);

menuRouter.get(
  '/categories',
  authenticate,
  requirePermission('menu.view'),
  MenuController.listCategories,
);

menuRouter.patch(
  '/categories/reorder',
  authenticate,
  requirePermission('menu.manage'),
  validateRequest({ body: reorderCategoriesSchema }),
  MenuController.reorderCategories,
);

menuRouter.get(
  '/categories/:id',
  authenticate,
  requirePermission('menu.view'),
  validateRequest({ params: categoryIdParamSchema }),
  MenuController.getCategory,
);

menuRouter.patch(
  '/categories/:id',
  authenticate,
  requirePermission('menu.manage'),
  validateRequest({ params: categoryIdParamSchema, body: updateCategorySchema }),
  MenuController.updateCategory,
);

menuRouter.patch(
  '/categories/:id/status',
  authenticate,
  requirePermission('menu.manage'),
  validateRequest({ params: categoryIdParamSchema, body: updateCategoryStatusSchema }),
  MenuController.updateCategoryStatus,
);

// =============================================================================
// 3. Menu Items
// =============================================================================
menuRouter.post(
  '/items',
  authenticate,
  requirePermission('menu.manage'),
  validateRequest({ body: createMenuItemSchema }),
  MenuController.createItem,
);

menuRouter.get(
  '/items',
  authenticate,
  requirePermission('menu.view'),
  validateRequest({ query: listMenuItemsQuerySchema }),
  MenuController.listItems,
);

menuRouter.get(
  '/items/:id',
  authenticate,
  requirePermission('menu.view'),
  validateRequest({ params: menuItemIdParamSchema }),
  MenuController.getItem,
);

menuRouter.patch(
  '/items/:id',
  authenticate,
  requirePermission('menu.manage'),
  validateRequest({ params: menuItemIdParamSchema, body: updateMenuItemSchema }),
  MenuController.updateItem,
);

menuRouter.patch(
  '/items/:id/status',
  authenticate,
  requirePermission('menu.manage'),
  validateRequest({ params: menuItemIdParamSchema, body: updateMenuItemStatusSchema }),
  MenuController.updateItemStatus,
);

menuRouter.patch(
  '/items/:id/availability',
  authenticate,
  requirePermission('menu.manage'),
  validateRequest({ params: menuItemIdParamSchema, body: updateMenuItemAvailabilitySchema }),
  MenuController.updateItemAvailability,
);

// =============================================================================
// 4. Portion / Price Variants
// =============================================================================
menuRouter.post(
  '/items/:itemId/variants',
  authenticate,
  requirePermission('menu.price_update'),
  validateRequest({ params: itemVariantParamSchema, body: createVariantSchema }),
  MenuController.createVariant,
);

menuRouter.patch(
  '/variants/:id',
  authenticate,
  requirePermission('menu.price_update'),
  validateRequest({ params: variantIdParamSchema, body: updateVariantSchema }),
  MenuController.updateVariant,
);

menuRouter.delete(
  '/variants/:id',
  authenticate,
  requirePermission('menu.manage'),
  validateRequest({ params: variantIdParamSchema }),
  MenuController.deleteVariant,
);

// =============================================================================
// 5. Modifier Groups
// =============================================================================
menuRouter.post(
  '/modifier-groups',
  authenticate,
  requirePermission('menu.manage'),
  validateRequest({ body: createModifierGroupSchema }),
  MenuController.createModifierGroup,
);

menuRouter.get(
  '/modifier-groups',
  authenticate,
  requirePermission('menu.view'),
  MenuController.listModifierGroups,
);

menuRouter.get(
  '/modifier-groups/:id',
  authenticate,
  requirePermission('menu.view'),
  validateRequest({ params: modifierGroupIdParamSchema }),
  MenuController.getModifierGroup,
);

menuRouter.patch(
  '/modifier-groups/:id',
  authenticate,
  requirePermission('menu.manage'),
  validateRequest({ params: modifierGroupIdParamSchema, body: updateModifierGroupSchema }),
  MenuController.updateModifierGroup,
);

menuRouter.patch(
  '/modifier-groups/:id/status',
  authenticate,
  requirePermission('menu.manage'),
  validateRequest({ params: modifierGroupIdParamSchema, body: updateModifierGroupStatusSchema }),
  MenuController.updateModifierGroupStatus,
);

// =============================================================================
// 6. Modifiers
// =============================================================================
menuRouter.post(
  '/modifier-groups/:groupId/modifiers',
  authenticate,
  requirePermission('menu.manage'),
  validateRequest({ params: groupModifierParamSchema, body: createModifierSchema }),
  MenuController.createModifier,
);

menuRouter.patch(
  '/modifiers/:id',
  authenticate,
  requirePermission('menu.manage'),
  validateRequest({ params: modifierIdParamSchema, body: updateModifierSchema }),
  MenuController.updateModifier,
);

menuRouter.delete(
  '/modifiers/:id',
  authenticate,
  requirePermission('menu.manage'),
  validateRequest({ params: modifierIdParamSchema }),
  MenuController.deleteModifier,
);

// =============================================================================
// 7. Item ↔ Modifier Group Linking
// =============================================================================
menuRouter.post(
  '/items/:itemId/modifier-groups',
  authenticate,
  requirePermission('menu.manage'),
  validateRequest({ params: itemVariantParamSchema, body: linkItemModifierGroupSchema }),
  MenuController.linkItemModifierGroup,
);

menuRouter.delete(
  '/items/:itemId/modifier-groups/:groupId',
  authenticate,
  requirePermission('menu.manage'),
  validateRequest({ params: itemModifierGroupParamSchema }),
  MenuController.unlinkItemModifierGroup,
);
