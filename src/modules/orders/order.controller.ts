import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../../common/http/response.js';
import { HttpStatus } from '../../common/http/http-status.js';
import { OrderService } from './order.service.js';

export class OrderController {
  /**
   * 1. Create a new Unified Order.
   */
  public static async createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const order = await OrderService.createOrder(
        restaurantId,
        req.body,
        {
          id: req.user!.id,
          restaurantId,
          username: req.user!.username,
          roles: req.user!.roles,
          permissions: req.user!.permissions,
        },
        req.ip,
      );

      ApiResponse.success(res, {
        statusCode: HttpStatus.CREATED,
        message: 'Order created successfully',
        data: { order },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 2. Get Order by ID.
   */
  public static async getOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const order = await OrderService.getOrderById(restaurantId, req.params.id as string);

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        data: { order },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 3. List Orders with filtering and pagination.
   */
  public static async listOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const result = await OrderService.listOrders(
        restaurantId,
        req.query as unknown as Parameters<typeof OrderService.listOrders>[1],
      );

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 4. Add items to an active order.
   */
  public static async addItems(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const order = await OrderService.addItemsToOrder(
        restaurantId,
        req.params.id as string,
        req.body.items,
        {
          id: req.user!.id,
          restaurantId,
          username: req.user!.username,
          roles: req.user!.roles,
          permissions: req.user!.permissions,
        },
        req.ip,
      );

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Items added to order successfully',
        data: { order },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 5. Void a single item in an active order.
   */
  public static async voidItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const order = await OrderService.voidOrderItem(
        restaurantId,
        req.params.id as string,
        req.params.itemId as string,
        req.body.voidReason,
        req.body.managerPin,
        {
          id: req.user!.id,
          restaurantId,
          username: req.user!.username,
          roles: req.user!.roles,
          permissions: req.user!.permissions,
        },
        req.ip,
      );

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Order item voided successfully',
        data: { order },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 6. Apply order-level discount.
   */
  public static async applyDiscount(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const order = await OrderService.applyOrderDiscount(
        restaurantId,
        req.params.id as string,
        req.body,
        {
          id: req.user!.id,
          restaurantId,
          username: req.user!.username,
          roles: req.user!.roles,
          permissions: req.user!.permissions,
        },
        req.ip,
      );

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Order discount applied successfully',
        data: { order },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 7. Update order status lifecycle.
   */
  public static async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const order = await OrderService.updateOrderStatus(
        restaurantId,
        req.params.id as string,
        req.body.status,
        {
          id: req.user!.id,
          restaurantId,
          username: req.user!.username,
          roles: req.user!.roles,
          permissions: req.user!.permissions,
        },
        req.ip,
      );

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: `Order status updated to ${req.body.status}`,
        data: { order },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 8. Cancel an active order.
   */
  public static async cancelOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const order = await OrderService.cancelOrder(
        restaurantId,
        req.params.id as string,
        req.body.reason,
        {
          id: req.user!.id,
          restaurantId,
          username: req.user!.username,
          roles: req.user!.roles,
          permissions: req.user!.permissions,
        },
        req.ip,
      );

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Order cancelled successfully',
        data: { order },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 9. Void entire order.
   */
  public static async voidOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const order = await OrderService.voidOrder(
        restaurantId,
        req.params.id as string,
        req.body.voidReason,
        req.body.managerPin,
        {
          id: req.user!.id,
          restaurantId,
          username: req.user!.username,
          roles: req.user!.roles,
          permissions: req.user!.permissions,
        },
        req.ip,
      );

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Order voided successfully',
        data: { order },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 10. Get active orders for a dining table.
   */
  public static async getTableOrders(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const result = await OrderService.getTableActiveOrders(
        restaurantId,
        req.params.tableId as string,
      );

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 11. Get daily order and sales metrics.
   */
  public static async getDailySummary(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const summary = await OrderService.getDailyOrderSummary(
        restaurantId,
        req.query.businessDate as string | undefined,
      );

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        data: { summary },
      });
    } catch (error) {
      next(error);
    }
  }
}
