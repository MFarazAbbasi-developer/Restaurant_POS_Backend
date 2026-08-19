import type { Request, Response, NextFunction } from 'express';
import { CategoryService } from './services/category.service.js';
import { ItemService } from './services/item.service.js';
import { VariantService } from './services/variant.service.js';
import { ModifierService } from './services/modifier.service.js';
import { PosMenuService } from './services/pos-menu.service.js';
import { ApiResponse } from '../../common/http/response.js';
import { HttpStatus } from '../../common/http/http-status.js';
import { UnauthorizedError } from '../../common/errors/app-error.js';
import type { ListMenuItemsQueryInput } from './menu.schema.js';

export class MenuController {
  // ===========================================================================
  // 1. Categories
  // ===========================================================================

  public static async listCategories(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const categories = await CategoryService.listCategories(req.user.restaurantId);
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Categories retrieved successfully',
        data: { categories },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const category = await CategoryService.getCategoryById(
        req.user.restaurantId,
        req.params.id as string,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Category retrieved successfully',
        data: { category },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async createCategory(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const category = await CategoryService.createCategory(
        req.user.restaurantId,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.CREATED,
        message: 'Category created successfully',
        data: { category },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateCategory(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const category = await CategoryService.updateCategory(
        req.user.restaurantId,
        req.params.id as string,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Category updated successfully',
        data: { category },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateCategoryStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const category = await CategoryService.updateCategoryStatus(
        req.user.restaurantId,
        req.params.id as string,
        req.body.isActive,
        req.user,
        clientIp,
      );
      const statusMsg = req.body.isActive ? 'activated' : 'deactivated';
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: `Category ${statusMsg} successfully`,
        data: { category },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async reorderCategories(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const categories = await CategoryService.reorderCategories(
        req.user.restaurantId,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Categories reordered successfully',
        data: { categories },
      });
    } catch (error) {
      next(error);
    }
  }

  // ===========================================================================
  // 2. Menu Items
  // ===========================================================================

  public static async listItems(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const query = req.query as unknown as ListMenuItemsQueryInput;
      const result = await ItemService.listItems(req.user.restaurantId, query);
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Menu items retrieved successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const item = await ItemService.getItemById(req.user.restaurantId, req.params.id as string);
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Menu item retrieved successfully',
        data: { item },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async createItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const item = await ItemService.createItem(
        req.user.restaurantId,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.CREATED,
        message: 'Menu item created successfully',
        data: { item },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const item = await ItemService.updateItem(
        req.user.restaurantId,
        req.params.id as string,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Menu item updated successfully',
        data: { item },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateItemStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const item = await ItemService.updateItemStatus(
        req.user.restaurantId,
        req.params.id as string,
        req.body.isActive,
        req.user,
        clientIp,
      );
      const statusMsg = req.body.isActive ? 'activated' : 'deactivated';
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: `Menu item ${statusMsg} successfully`,
        data: { item },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateItemAvailability(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const item = await ItemService.updateItemAvailability(
        req.user.restaurantId,
        req.params.id as string,
        req.body.isAvailable,
        req.user,
        clientIp,
      );
      const availMsg = req.body.isAvailable
        ? 'available (in stock)'
        : 'unavailable (86 / out of stock)';
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: `Menu item marked as ${availMsg}`,
        data: { item },
      });
    } catch (error) {
      next(error);
    }
  }

  // ===========================================================================
  // 3. Variants
  // ===========================================================================

  public static async createVariant(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const variant = await VariantService.createVariant(
        req.user.restaurantId,
        req.params.itemId as string,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.CREATED,
        message: 'Menu variant created successfully',
        data: { variant },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateVariant(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const variant = await VariantService.updateVariant(
        req.user.restaurantId,
        req.params.id as string,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Menu variant updated successfully',
        data: { variant },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async deleteVariant(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const result = await VariantService.deleteVariant(
        req.user.restaurantId,
        req.params.id as string,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Menu variant deleted successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // ===========================================================================
  // 4. Modifier Groups
  // ===========================================================================

  public static async listModifierGroups(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const modifierGroups = await ModifierService.listModifierGroups(req.user.restaurantId);
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Modifier groups retrieved successfully',
        data: { modifierGroups },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getModifierGroup(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const modifierGroup = await ModifierService.getModifierGroupById(
        req.user.restaurantId,
        req.params.id as string,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Modifier group retrieved successfully',
        data: { modifierGroup },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async createModifierGroup(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const modifierGroup = await ModifierService.createModifierGroup(
        req.user.restaurantId,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.CREATED,
        message: 'Modifier group created successfully',
        data: { modifierGroup },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateModifierGroup(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const modifierGroup = await ModifierService.updateModifierGroup(
        req.user.restaurantId,
        req.params.id as string,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Modifier group updated successfully',
        data: { modifierGroup },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateModifierGroupStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const modifierGroup = await ModifierService.updateModifierGroupStatus(
        req.user.restaurantId,
        req.params.id as string,
        req.body.isActive,
        req.user,
        clientIp,
      );
      const statusMsg = req.body.isActive ? 'activated' : 'deactivated';
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: `Modifier group ${statusMsg} successfully`,
        data: { modifierGroup },
      });
    } catch (error) {
      next(error);
    }
  }

  // ===========================================================================
  // 5. Modifiers
  // ===========================================================================

  public static async createModifier(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const modifier = await ModifierService.createModifier(
        req.user.restaurantId,
        req.params.groupId as string,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.CREATED,
        message: 'Modifier created successfully',
        data: { modifier },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateModifier(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const modifier = await ModifierService.updateModifier(
        req.user.restaurantId,
        req.params.id as string,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Modifier updated successfully',
        data: { modifier },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async deleteModifier(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const result = await ModifierService.deleteModifier(
        req.user.restaurantId,
        req.params.id as string,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Modifier deleted successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // ===========================================================================
  // 6. Item ↔ Modifier Group Linking
  // ===========================================================================

  public static async linkItemModifierGroup(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const link = await ModifierService.linkModifierGroupToItem(
        req.user.restaurantId,
        req.params.itemId as string,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.CREATED,
        message: 'Modifier group linked to menu item successfully',
        data: { link },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async unlinkItemModifierGroup(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const result = await ModifierService.unlinkModifierGroupFromItem(
        req.user.restaurantId,
        req.params.itemId as string,
        req.params.groupId as string,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Modifier group unlinked from menu item successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // ===========================================================================
  // 7. POS Menu Retrieval
  // ===========================================================================

  public static async getPosMenu(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const menu = await PosMenuService.getPosMenu(req.user.restaurantId);
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'POS menu retrieved successfully',
        data: menu,
      });
    } catch (error) {
      next(error);
    }
  }
}
