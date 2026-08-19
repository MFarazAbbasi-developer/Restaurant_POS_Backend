import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../../common/http/response.js';
import { HttpStatus } from '../../common/http/http-status.js';
import { PaymentService } from './payment.service.js';

export class PaymentController {
  /**
   * 1. Process payment against an order.
   */
  public static async processPayment(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const payment = await PaymentService.processPayment(
        restaurantId,
        req.body,
        req.user!,
        req.ip,
      );

      ApiResponse.success(res, {
        statusCode: HttpStatus.CREATED,
        message: 'Payment recorded successfully',
        data: { payment },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 2. Refund a payment.
   */
  public static async refundPayment(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const result = await PaymentService.refundPayment(
        restaurantId,
        req.params.id as string,
        req.body,
        req.user!,
        req.ip,
      );

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Payment refunded successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 3. Get payment by ID.
   */
  public static async getPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const payment = await PaymentService.getPaymentById(restaurantId, req.params.id as string);

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        data: { payment },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 4. List and filter payments.
   */
  public static async listPayments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const result = await PaymentService.listPayments(
        restaurantId,
        req.query as unknown as Parameters<typeof PaymentService.listPayments>[1],
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
   * 5. Get all payments and refunds for a specific order.
   */
  public static async getOrderPayments(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const result = await PaymentService.getOrderPayments(
        restaurantId,
        req.params.orderId as string,
      );

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
