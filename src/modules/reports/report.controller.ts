import { Request, Response, NextFunction } from 'express';
import { HttpStatus } from '../../common/http/http-status.js';
import { ApiResponse } from '../../common/http/response.js';
import { ReportService } from './report.service.js';
import {
  BaseReportFilter,
  OrderTypeFilter,
  PaymentMethodFilter,
  ItemsRankingFilter,
} from './report.schema.js';

export class ReportController {
  public static async getSalesSummary(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const filter = req.query as unknown as BaseReportFilter;

      const result = await ReportService.getSalesSummary(restaurantId, filter);
      ApiResponse.success(res, {
        data: result,
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getSalesByOrderType(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const filter = req.query as unknown as OrderTypeFilter;

      const result = await ReportService.getSalesByOrderType(restaurantId, filter);
      ApiResponse.success(res, {
        data: result,
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getSalesByPaymentMethod(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const filter = req.query as unknown as PaymentMethodFilter;

      const result = await ReportService.getSalesByPaymentMethod(restaurantId, filter);
      ApiResponse.success(res, {
        data: result,
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getItemsRanking(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const filter = req.query as unknown as ItemsRankingFilter;

      const result = await ReportService.getItemsRanking(restaurantId, filter);
      ApiResponse.success(res, {
        data: result,
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getCategorySales(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const filter = req.query as unknown as BaseReportFilter;

      const result = await ReportService.getCategorySales(restaurantId, filter);
      ApiResponse.success(res, {
        data: result,
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getFinancialAdjustments(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const filter = req.query as unknown as BaseReportFilter;

      const result = await ReportService.getFinancialAdjustmentsReport(restaurantId, filter);
      ApiResponse.success(res, {
        data: result,
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getHourlyTrends(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const filter = req.query as unknown as BaseReportFilter;

      const result = await ReportService.getHourlyTrends(restaurantId, filter);
      ApiResponse.success(res, {
        data: result,
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getStaffPerformance(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const filter = req.query as unknown as BaseReportFilter;

      const result = await ReportService.getStaffPerformance(restaurantId, filter);
      ApiResponse.success(res, {
        data: result,
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getShiftsSummary(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const filter = req.query as unknown as BaseReportFilter;

      const result = await ReportService.getShiftsSummary(restaurantId, filter);
      ApiResponse.success(res, {
        data: result,
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getOperationsPerformance(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const filter = req.query as unknown as BaseReportFilter;

      const result = await ReportService.getOperationsPerformance(restaurantId, filter);
      ApiResponse.success(res, {
        data: result,
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }
}
