import { Request, Response, NextFunction } from 'express';
import { HttpStatus } from '../../common/http/http-status.js';
import { ApiResponse } from '../../common/http/response.js';
import { InventoryService } from './inventory.service.js';
import {
  CreateLocationInput,
  UpdateLocationInput,
  CreateSupplierInput,
  UpdateSupplierInput,
  CreateInventoryItemInput,
  UpdateInventoryItemInput,
  ListInventoryItemsQuery,
  UpsertRecipeInput,
  CreatePurchaseOrderInput,
  ListPurchasesQuery,
  CreateStockAdjustmentInput,
  ListAdjustmentsQuery,
  CreateStockWastageInput,
  ListWastageQuery,
  CreateStockTransferInput,
  ListTransfersQuery,
  ListLedgerQuery,
} from './inventory.schema.js';

export class InventoryController {
  // ---------------------------------------------------------------------------
  // 1. Locations
  // ---------------------------------------------------------------------------
  public static async listLocations(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const locations = await InventoryService.listLocations(req.user!.restaurantId);
      ApiResponse.success(res, {
        data: { locations },
        message: 'Stock locations retrieved successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getLocation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const location = await InventoryService.getLocation(req.user!.restaurantId, req.params.id as string);
      ApiResponse.success(res, {
        data: { location },
        message: 'Stock location retrieved successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async createLocation(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const location = await InventoryService.createLocation(
        req.user!.restaurantId,
        req.body as CreateLocationInput,
      );
      ApiResponse.success(res, {
        data: { location },
        message: 'Stock location created successfully',
        statusCode: HttpStatus.CREATED,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateLocation(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const location = await InventoryService.updateLocation(
        req.user!.restaurantId,
        req.params.id as string,
        req.body as UpdateLocationInput,
      );
      ApiResponse.success(res, {
        data: { location },
        message: 'Stock location updated successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async deleteLocation(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      await InventoryService.deleteLocation(req.user!.restaurantId, req.params.id as string);
      ApiResponse.success(res, {
        data: null,
        message: 'Stock location deleted / deactivated successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Suppliers
  // ---------------------------------------------------------------------------
  public static async listSuppliers(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const suppliers = await InventoryService.listSuppliers(req.user!.restaurantId);
      ApiResponse.success(res, {
        data: { suppliers },
        message: 'Suppliers retrieved successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getSupplier(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const supplier = await InventoryService.getSupplier(req.user!.restaurantId, req.params.id as string);
      ApiResponse.success(res, {
        data: { supplier },
        message: 'Supplier retrieved successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async createSupplier(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const supplier = await InventoryService.createSupplier(
        req.user!.restaurantId,
        req.body as CreateSupplierInput,
      );
      ApiResponse.success(res, {
        data: { supplier },
        message: 'Supplier created successfully',
        statusCode: HttpStatus.CREATED,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateSupplier(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const supplier = await InventoryService.updateSupplier(
        req.user!.restaurantId,
        req.params.id as string,
        req.body as UpdateSupplierInput,
      );
      ApiResponse.success(res, {
        data: { supplier },
        message: 'Supplier updated successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async deleteSupplier(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      await InventoryService.deleteSupplier(req.user!.restaurantId, req.params.id as string);
      ApiResponse.success(res, {
        data: null,
        message: 'Supplier deactivated successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Inventory Items
  // ---------------------------------------------------------------------------
  public static async listItems(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await InventoryService.listItems(
        req.user!.restaurantId,
        req.query as unknown as ListInventoryItemsQuery,
      );
      ApiResponse.success(res, {
        data: result,
        message: 'Inventory items retrieved successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const item = await InventoryService.getItem(req.user!.restaurantId, req.params.id as string);
      ApiResponse.success(res, {
        data: { item },
        message: 'Inventory item retrieved successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async createItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const item = await InventoryService.createItem(
        req.user!.restaurantId,
        req.body as CreateInventoryItemInput,
        req.user?.id,
      );
      ApiResponse.success(res, {
        data: { item },
        message: 'Inventory item created successfully',
        statusCode: HttpStatus.CREATED,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const item = await InventoryService.updateItem(
        req.user!.restaurantId,
        req.params.id as string,
        req.body as UpdateInventoryItemInput,
      );
      ApiResponse.success(res, {
        data: { item },
        message: 'Inventory item updated successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async deleteItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await InventoryService.deleteItem(req.user!.restaurantId, req.params.id as string);
      ApiResponse.success(res, {
        data: null,
        message: 'Inventory item deactivated successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Recipes / Bill of Materials (BOM)
  // ---------------------------------------------------------------------------
  public static async upsertRecipe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const recipe = await InventoryService.upsertRecipe(
        req.user!.restaurantId,
        req.body as UpsertRecipeInput,
      );
      ApiResponse.success(res, {
        data: { recipe },
        message: 'Recipe ingredient saved successfully',
        statusCode: HttpStatus.CREATED,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getMenuItemRecipes(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const recipes = await InventoryService.getMenuItemRecipes(
        req.user!.restaurantId,
        req.params.menuItemId as string,
      );
      ApiResponse.success(res, {
        data: { recipes },
        message: 'Menu item recipes retrieved successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async deleteRecipe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await InventoryService.deleteRecipe(req.user!.restaurantId, req.params.id as string);
      ApiResponse.success(res, {
        data: null,
        message: 'Recipe ingredient removed successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Purchases & Receiving
  // ---------------------------------------------------------------------------
  public static async createPurchaseOrder(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const purchaseOrder = await InventoryService.createPurchaseOrder(
        req.user!.restaurantId,
        req.body as CreatePurchaseOrderInput,
        req.user?.id,
        req.ip,
      );
      ApiResponse.success(res, {
        data: { purchaseOrder },
        message: 'Purchase receiving recorded successfully',
        statusCode: HttpStatus.CREATED,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async listPurchases(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await InventoryService.listPurchases(
        req.user!.restaurantId,
        req.query as unknown as ListPurchasesQuery,
      );
      ApiResponse.success(res, {
        data: result,
        message: 'Purchase orders retrieved successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getPurchase(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const purchaseOrder = await InventoryService.getPurchase(
        req.user!.restaurantId,
        req.params.id as string,
      );
      ApiResponse.success(res, {
        data: { purchaseOrder },
        message: 'Purchase order retrieved successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Stock Adjustments
  // ---------------------------------------------------------------------------
  public static async createStockAdjustment(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const adjustment = await InventoryService.createStockAdjustment(
        req.user!.restaurantId,
        req.body as CreateStockAdjustmentInput,
        req.user?.id,
        req.ip,
      );
      ApiResponse.success(res, {
        data: { adjustment },
        message: 'Stock adjustment recorded successfully',
        statusCode: HttpStatus.CREATED,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async listAdjustments(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await InventoryService.listAdjustments(
        req.user!.restaurantId,
        req.query as unknown as ListAdjustmentsQuery,
      );
      ApiResponse.success(res, {
        data: result,
        message: 'Stock adjustments retrieved successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getAdjustment(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const adjustment = await InventoryService.getAdjustment(
        req.user!.restaurantId,
        req.params.id as string,
      );
      ApiResponse.success(res, {
        data: { adjustment },
        message: 'Stock adjustment retrieved successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 7. Stock Wastage
  // ---------------------------------------------------------------------------
  public static async createStockWastage(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const wastage = await InventoryService.createStockWastage(
        req.user!.restaurantId,
        req.body as CreateStockWastageInput,
        req.user?.id,
        req.ip,
      );
      ApiResponse.success(res, {
        data: { wastage },
        message: 'Stock wastage recorded successfully',
        statusCode: HttpStatus.CREATED,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async listWastage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await InventoryService.listWastage(
        req.user!.restaurantId,
        req.query as unknown as ListWastageQuery,
      );
      ApiResponse.success(res, {
        data: result,
        message: 'Stock wastage records retrieved successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getWastage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const wastage = await InventoryService.getWastage(req.user!.restaurantId, req.params.id as string);
      ApiResponse.success(res, {
        data: { wastage },
        message: 'Stock wastage record retrieved successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 8. Stock Transfers
  // ---------------------------------------------------------------------------
  public static async createStockTransfer(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const transfer = await InventoryService.createStockTransfer(
        req.user!.restaurantId,
        req.body as CreateStockTransferInput,
        req.user?.id,
        req.ip,
      );
      ApiResponse.success(res, {
        data: { transfer },
        message: 'Stock transfer completed successfully',
        statusCode: HttpStatus.CREATED,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async listTransfers(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await InventoryService.listTransfers(
        req.user!.restaurantId,
        req.query as unknown as ListTransfersQuery,
      );
      ApiResponse.success(res, {
        data: result,
        message: 'Stock transfers retrieved successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getTransfer(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const transfer = await InventoryService.getTransfer(req.user!.restaurantId, req.params.id as string);
      ApiResponse.success(res, {
        data: { transfer },
        message: 'Stock transfer retrieved successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 9. Stock Movement Ledger
  // ---------------------------------------------------------------------------
  public static async listLedger(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await InventoryService.listLedger(
        req.user!.restaurantId,
        req.query as unknown as ListLedgerQuery,
      );
      ApiResponse.success(res, {
        data: result,
        message: 'Stock movement ledger retrieved successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 10. Summaries & Reports
  // ---------------------------------------------------------------------------
  public static async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const summary = await InventoryService.getInventorySummary(req.user!.restaurantId);
      ApiResponse.success(res, {
        data: summary,
        message: 'Inventory summary retrieved successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getLowStock(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const lowStock = await InventoryService.getLowStockItems(req.user!.restaurantId);
      ApiResponse.success(res, {
        data: lowStock,
        message: 'Low-stock items retrieved successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getValuation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const valuation = await InventoryService.getValuationReport(req.user!.restaurantId);
      ApiResponse.success(res, {
        data: valuation,
        message: 'Inventory valuation report retrieved successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }
}
