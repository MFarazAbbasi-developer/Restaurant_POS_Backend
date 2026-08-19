import { Request, Response, NextFunction } from 'express';
import { HttpStatus } from '../../common/http/http-status.js';
import { ApiResponse } from '../../common/http/response.js';
import { PromotionService } from './promotion.service.js';
import {
  CreatePromotionInput,
  UpdatePromotionInput,
  ListPromotionsQuery,
  PreviewPromotionsInput,
  ValidatePromoCodeInput,
} from './promotion.schema.js';

export class PromotionController {
  // ---------------------------------------------------------------------------
  // 1. List Promotions
  // ---------------------------------------------------------------------------
  public static async listPromotions(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await PromotionService.listPromotions(
        req.user!.restaurantId,
        req.query as unknown as ListPromotionsQuery,
      );
      ApiResponse.success(res, {
        data: result,
        message: 'Promotions retrieved successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Get Promotion by ID
  // ---------------------------------------------------------------------------
  public static async getPromotion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const promotion = await PromotionService.getPromotion(
        req.user!.restaurantId,
        req.params.id as string,
      );
      ApiResponse.success(res, {
        data: { promotion },
        message: 'Promotion retrieved successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Create Promotion
  // ---------------------------------------------------------------------------
  public static async createPromotion(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const promotion = await PromotionService.createPromotion(
        req.user!.restaurantId,
        req.body as CreatePromotionInput,
        req.user?.id,
      );
      ApiResponse.success(res, {
        data: { promotion },
        message: 'Promotion created successfully',
        statusCode: HttpStatus.CREATED,
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Update Promotion
  // ---------------------------------------------------------------------------
  public static async updatePromotion(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const promotion = await PromotionService.updatePromotion(
        req.user!.restaurantId,
        req.params.id as string,
        req.body as UpdatePromotionInput,
        req.user?.id,
      );
      ApiResponse.success(res, {
        data: { promotion },
        message: 'Promotion updated successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Delete Promotion
  // ---------------------------------------------------------------------------
  public static async deletePromotion(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      await PromotionService.deletePromotion(
        req.user!.restaurantId,
        req.params.id as string,
        req.user?.id,
      );
      ApiResponse.success(res, {
        data: null,
        message: 'Promotion deleted successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Toggle Active Status
  // ---------------------------------------------------------------------------
  public static async toggleStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await PromotionService.toggleStatus(
        req.user!.restaurantId,
        req.params.id as string,
        req.user?.id,
      );
      ApiResponse.success(res, {
        data: result,
        message: `Promotion ${result.isActive ? 'activated' : 'deactivated'} successfully`,
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 7. Preview Promotions
  // ---------------------------------------------------------------------------
  public static async previewPromotions(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const preview = await PromotionService.previewPromotions(
        req.user!.restaurantId,
        req.body as PreviewPromotionsInput,
      );
      ApiResponse.success(res, {
        data: preview,
        message: 'Promotions preview calculated successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 8. Validate Promo Code
  // ---------------------------------------------------------------------------
  public static async validatePromoCode(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await PromotionService.validatePromoCode(
        req.user!.restaurantId,
        req.body as ValidatePromoCodeInput,
      );
      ApiResponse.success(res, {
        data: result,
        message: 'Promo code is valid',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 9. List Promotion Usages
  // ---------------------------------------------------------------------------
  public static async listUsages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await PromotionService.listUsages(
        req.user!.restaurantId,
        req.params.id as string,
        {
          page: req.query.page ? Number(req.query.page) : 1,
          limit: req.query.limit ? Number(req.query.limit) : 20,
        },
      );
      ApiResponse.success(res, {
        data: result,
        message: 'Promotion usages retrieved successfully',
        statusCode: HttpStatus.OK,
      });
    } catch (error) {
      next(error);
    }
  }
}
