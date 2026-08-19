import { Request, Response, NextFunction } from 'express';
import { HttpStatus } from '../../common/http/http-status.js';
import { ApiResponse } from '../../common/http/response.js';
import { KitchenService } from './kitchen.service.js';
import { KitchenStationService } from './kitchen-station.service.js';
import {
  CreateKitchenStationInput,
  UpdateKitchenStationInput,
  UpdateOrderKitchenStatusInput,
  UpdateItemKitchenStatusInput,
  KitchenQueueQuery,
  RecallInput,
} from './kitchen.schema.js';

export class KitchenController {
  // ---------------------------------------------------------------------------
  // 1. Kitchen Queue & Orders
  // ---------------------------------------------------------------------------

  public static async getKitchenQueue(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const query = req.query as unknown as KitchenQueueQuery;

      const result = await KitchenService.getKitchenQueue(restaurantId, query);
      ApiResponse.success(res, {
        data: result,
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getKitchenOrderById(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const { id } = req.params;

      const result = await KitchenService.getKitchenOrderById(restaurantId, id!);
      ApiResponse.success(res, {
        data: { ticket: result },
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateOrderKitchenStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const { id } = req.params;
      const input = req.body as UpdateOrderKitchenStatusInput;
      const ipAddress = req.ip ?? undefined;

      const result = await KitchenService.updateOrderKitchenStatus(
        restaurantId,
        id!,
        input,
        req.user!,
        ipAddress,
      );

      ApiResponse.success(res, {
        data: { ticket: result },
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateItemKitchenStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const { orderId, itemId } = req.params;
      const input = req.body as UpdateItemKitchenStatusInput;
      const ipAddress = req.ip ?? undefined;

      const result = await KitchenService.updateItemKitchenStatus(
        restaurantId,
        orderId!,
        itemId!,
        input,
        req.user!,
        ipAddress,
      );

      ApiResponse.success(res, {
        data: { ticket: result },
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async recallOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const { id } = req.params;
      const input = req.body as RecallInput;
      const ipAddress = req.ip ?? undefined;

      const result = await KitchenService.recallOrder(
        restaurantId,
        id!,
        input,
        req.user!,
        ipAddress,
      );
      ApiResponse.success(res, {
        data: { ticket: result },
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async recallItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const { orderId, itemId } = req.params;
      const input = req.body as RecallInput;
      const ipAddress = req.ip ?? undefined;

      const result = await KitchenService.recallItem(
        restaurantId,
        orderId!,
        itemId!,
        input,
        req.user!,
        ipAddress,
      );

      ApiResponse.success(res, {
        data: { ticket: result },
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getKitchenPerformance(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;

      const result = await KitchenService.getKitchenPerformance(restaurantId);
      ApiResponse.success(res, {
        data: result,
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Kitchen Stations Management
  // ---------------------------------------------------------------------------

  public static async createStation(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const input = req.body as CreateKitchenStationInput;
      const ipAddress = req.ip ?? undefined;

      const result = await KitchenStationService.createStation(
        restaurantId,
        input,
        req.user!,
        ipAddress,
      );
      ApiResponse.success(res, {
        data: { station: result },
        statusCode: HttpStatus.CREATED,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async listStations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;

      const result = await KitchenStationService.listStations(restaurantId);
      ApiResponse.success(res, {
        data: { stations: result },
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getStationById(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const { id } = req.params;

      const result = await KitchenStationService.getStationById(restaurantId, id!);
      ApiResponse.success(res, {
        data: { station: result },
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateStation(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const { id } = req.params;
      const input = req.body as UpdateKitchenStationInput;
      const ipAddress = req.ip ?? undefined;

      const result = await KitchenStationService.updateStation(
        restaurantId,
        id!,
        input,
        req.user!,
        ipAddress,
      );

      ApiResponse.success(res, {
        data: { station: result },
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async deleteStation(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const { id } = req.params;
      const ipAddress = req.ip ?? undefined;

      const result = await KitchenStationService.deleteStation(
        restaurantId,
        id!,
        req.user!,
        ipAddress,
      );
      ApiResponse.success(res, {
        data: result,
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }
}
