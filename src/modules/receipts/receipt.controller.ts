import { Request, Response, NextFunction } from 'express';
import { HttpStatus } from '../../common/http/http-status.js';
import { ApiResponse } from '../../common/http/response.js';
import { ReceiptService } from './receipt.service.js';
import {
  CustomerReceiptQuery,
  KitchenTicketQuery,
  ReprintReceiptInput,
  PreviewReceiptQuery,
} from './receipt.schema.js';

export class ReceiptController {
  public static async getCustomerReceipt(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const { orderId } = req.params;
      const query = req.query as unknown as CustomerReceiptQuery;

      const result = await ReceiptService.generateCustomerReceipt(restaurantId, orderId!, query);
      ApiResponse.success(res, {
        data: { receipt: result },
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getKitchenTicket(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const { orderId } = req.params;
      const query = req.query as unknown as KitchenTicketQuery;

      const result = await ReceiptService.generateKitchenTicket(restaurantId, orderId!, query);
      ApiResponse.success(res, {
        data: { ticket: result },
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async reprintReceipt(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const { orderId } = req.params;
      const input = req.body as ReprintReceiptInput;
      const ipAddress = req.ip ?? undefined;

      const result = await ReceiptService.reprintReceipt(
        restaurantId,
        orderId!,
        input,
        req.user!,
        ipAddress,
      );

      ApiResponse.success(res, {
        data: { receipt: result },
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getPreviewReceipt(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const query = req.query as unknown as PreviewReceiptQuery;

      const result = await ReceiptService.generatePreviewReceipt(restaurantId, query);
      ApiResponse.success(res, {
        data: { receipt: result },
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }
}
