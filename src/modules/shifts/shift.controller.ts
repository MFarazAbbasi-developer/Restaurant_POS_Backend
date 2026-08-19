import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../../common/http/response.js';
import { HttpStatus } from '../../common/http/http-status.js';
import { ShiftService } from './shift.service.js';

export class ShiftController {
  /**
   * 1. Open a new register shift.
   */
  public static async openShift(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const shift = await ShiftService.openShift(restaurantId, req.body, req.user!, req.ip);

      ApiResponse.success(res, {
        statusCode: HttpStatus.CREATED,
        message: 'Shift opened successfully',
        data: { shift },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 2. Get current active shift for logged-in cashier.
   */
  public static async getCurrentShift(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const shift = await ShiftService.getCurrentShift(restaurantId, req.user!.id);

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        data: { shift },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 3. Perform a cash drop / safe deposit.
   */
  public static async recordCashDrop(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const shift = await ShiftService.recordCashDrop(restaurantId, req.body, req.user!, req.ip);

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Cash drop recorded successfully',
        data: { shift },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 4. Record a cash adjustment (Pay In / Pay Out).
   */
  public static async recordCashAdjustment(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const shift = await ShiftService.recordCashAdjustment(
        restaurantId,
        req.body,
        req.user!,
        req.ip,
      );

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Cash adjustment recorded successfully',
        data: { shift },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 5. Close active shift.
   */
  public static async closeShift(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const result = await ShiftService.closeShift(restaurantId, req.body, req.user!, req.ip);

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Shift closed and settled successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 6. Get shift settlement summary report.
   */
  public static async getShiftSummary(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const summary = await ShiftService.getShiftSummary(restaurantId, req.params.id as string);

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        data: { summary },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 7. Get shift by ID.
   */
  public static async getShift(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const shift = await ShiftService.getShiftById(restaurantId, req.params.id as string);

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        data: { shift },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 8. List shifts with filtering and pagination.
   */
  public static async listShifts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const result = await ShiftService.listShifts(
        restaurantId,
        req.query as unknown as Parameters<typeof ShiftService.listShifts>[1],
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
