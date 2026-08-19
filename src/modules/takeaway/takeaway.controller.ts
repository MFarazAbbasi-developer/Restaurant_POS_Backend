import type { Request, Response, NextFunction } from 'express';
import { TakeawayService } from './takeaway.service.js';
import { ApiResponse } from '../../common/http/response.js';
import { HttpStatus } from '../../common/http/http-status.js';
import { UnauthorizedError } from '../../common/errors/app-error.js';
import type { ListTakeawayOrdersQueryInput } from './takeaway.schema.js';

export class TakeawayController {
  /**
   * Creates a new takeaway order (express counter flow).
   */
  public static async createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const order = await TakeawayService.createOrder(
        req.user.restaurantId,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.CREATED,
        message: 'Takeaway order created successfully',
        data: { order },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retrieves the active takeaway order queue (PENDING, PREPARING, READY).
   */
  public static async getActiveQueue(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const queue = await TakeawayService.getActiveQueue(req.user.restaurantId);
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Active takeaway queue retrieved successfully',
        data: queue,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lists and searches takeaway orders with pagination.
   */
  public static async listOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const query = req.query as unknown as ListTakeawayOrdersQueryInput;
      const result = await TakeawayService.listOrders(req.user.restaurantId, query);
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Takeaway orders retrieved successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retrieves single takeaway order details.
   */
  public static async getOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const order = await TakeawayService.getOrderById(
        req.user.restaurantId,
        req.params.id as string,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Takeaway order retrieved successfully',
        data: { order },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Updates status of a takeaway order (PREPARING, READY, COMPLETED).
   */
  public static async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const order = await TakeawayService.updateOrderStatus(
        req.user.restaurantId,
        req.params.id as string,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: `Takeaway order status updated to ${req.body.status}`,
        data: { order },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancels a takeaway order with reason.
   */
  public static async cancelOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const result = await TakeawayService.cancelOrder(
        req.user.restaurantId,
        req.params.id as string,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Takeaway order cancelled successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
