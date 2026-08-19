import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../../common/http/response.js';
import { HttpStatus } from '../../common/http/http-status.js';
import { PurchasingService } from './purchasing.service.js';
import {
  CreateSupplierInput,
  UpdateSupplierInput,
  ListSuppliersQuery,
  CreatePurchaseOrderInput,
  UpdatePurchaseOrderInput,
  ReceiveGoodsInput,
  CreatePurchaseReturnInput,
  ListPurchasesQuery,
  PurchasingSummaryQuery,
} from './purchasing.schema.js';

export class PurchasingController {
  // ===========================================================================
  // 1. Supplier Handlers
  // ===========================================================================

  public static async createSupplier(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const input = req.body as CreateSupplierInput;
      const supplier = await PurchasingService.createSupplier(restaurantId, input, req.user!.id);
      ApiResponse.success(res, {
        data: { supplier },
        message: 'Supplier created successfully',
        statusCode: HttpStatus.CREATED,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async listSuppliers(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const query = req.query as unknown as ListSuppliersQuery;
      const result = await PurchasingService.listSuppliers(restaurantId, query);
      ApiResponse.success(res, {
        data: result,
        message: 'Suppliers retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getSupplier(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const id = req.params.id as string;
      const supplier = await PurchasingService.getSupplier(restaurantId, id);
      ApiResponse.success(res, {
        data: { supplier },
        message: 'Supplier retrieved successfully',
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
      const restaurantId = req.user!.restaurantId;
      const id = req.params.id as string;
      const input = req.body as UpdateSupplierInput;
      const supplier = await PurchasingService.updateSupplier(
        restaurantId,
        id,
        input,
        req.user!.id,
      );
      ApiResponse.success(res, {
        data: { supplier },
        message: 'Supplier updated successfully',
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
      const restaurantId = req.user!.restaurantId;
      const id = req.params.id as string;
      await PurchasingService.deleteSupplier(restaurantId, id, req.user!.id);
      ApiResponse.success(res, {
        message: 'Supplier deactivated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getSupplierPurchaseHistory(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const id = req.params.id as string;
      const result = await PurchasingService.getSupplierPurchaseHistory(restaurantId, id);
      ApiResponse.success(res, {
        data: result,
        message: 'Supplier purchase history retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // ===========================================================================
  // 2. Purchase Orders Handlers
  // ===========================================================================

  public static async createPurchaseOrder(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const input = req.body as CreatePurchaseOrderInput;
      const purchaseOrder = await PurchasingService.createPurchaseOrder(
        restaurantId,
        input,
        req.user!.id,
      );
      ApiResponse.success(res, {
        data: { purchaseOrder },
        message: 'Purchase order created successfully',
        statusCode: HttpStatus.CREATED,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async listPurchaseOrders(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const query = req.query as unknown as ListPurchasesQuery;
      const result = await PurchasingService.listPurchaseOrders(restaurantId, query);
      ApiResponse.success(res, {
        data: result,
        message: 'Purchase orders retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getPurchaseOrder(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const id = req.params.id as string;
      const purchaseOrder = await PurchasingService.getPurchaseOrder(restaurantId, id);
      ApiResponse.success(res, {
        data: { purchaseOrder },
        message: 'Purchase order details retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updatePurchaseOrder(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const id = req.params.id as string;
      const input = req.body as UpdatePurchaseOrderInput;
      const purchaseOrder = await PurchasingService.updatePurchaseOrder(
        restaurantId,
        id,
        input,
        req.user!.id,
      );
      ApiResponse.success(res, {
        data: { purchaseOrder },
        message: 'Purchase order updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async orderPurchaseOrder(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const id = req.params.id as string;
      const purchaseOrder = await PurchasingService.orderPurchaseOrder(
        restaurantId,
        id,
        req.user!.id,
      );
      ApiResponse.success(res, {
        data: { purchaseOrder },
        message: 'Purchase order sent to supplier successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async receiveGoods(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const id = req.params.id as string;
      const input = req.body as ReceiveGoodsInput;
      const purchaseOrder = await PurchasingService.receiveGoods(
        restaurantId,
        id,
        input,
        req.user!.id,
      );
      ApiResponse.success(res, {
        data: { purchaseOrder },
        message: 'Goods received and stock updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async createPurchaseReturn(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const id = req.params.id as string;
      const input = req.body as CreatePurchaseReturnInput;
      const purchaseReturn = await PurchasingService.createPurchaseReturn(
        restaurantId,
        id,
        input,
        req.user!.id,
      );
      ApiResponse.success(res, {
        data: { purchaseReturn },
        message: 'Purchase return processed and stock adjusted successfully',
        statusCode: HttpStatus.CREATED,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async cancelPurchaseOrder(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const id = req.params.id as string;
      const purchaseOrder = await PurchasingService.cancelPurchaseOrder(
        restaurantId,
        id,
        req.user!.id,
      );
      ApiResponse.success(res, {
        data: { purchaseOrder },
        message: 'Purchase order cancelled successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getPurchasingSummary(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const query = req.query as unknown as PurchasingSummaryQuery;
      const summary = await PurchasingService.getPurchasingSummary(restaurantId, query);
      ApiResponse.success(res, {
        data: summary,
        message: 'Purchasing summary retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}
