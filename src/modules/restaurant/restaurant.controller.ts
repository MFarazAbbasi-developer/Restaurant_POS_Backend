import type { Request, Response, NextFunction } from 'express';
import { RestaurantService } from './restaurant.service.js';
import { ApiResponse } from '../../common/http/response.js';
import { HttpStatus } from '../../common/http/http-status.js';
import { UnauthorizedError } from '../../common/errors/app-error.js';

export class RestaurantController {
  /**
   * GET /api/v1/restaurant
   */
  public static async getRestaurant(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication is required');
      }

      const restaurant = await RestaurantService.getRestaurant(req.user.restaurantId);

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Restaurant configuration retrieved successfully',
        data: { restaurant },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/restaurant
   */
  public static async updateRestaurant(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication is required');
      }

      const clientIp = req.ip || req.socket.remoteAddress;
      const updated = await RestaurantService.updateRestaurant(
        req.user.restaurantId,
        req.body,
        req.user,
        clientIp,
      );

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Restaurant configuration updated successfully',
        data: { restaurant: updated },
      });
    } catch (error) {
      next(error);
    }
  }
}
