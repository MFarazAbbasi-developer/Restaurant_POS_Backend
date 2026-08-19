import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../../common/http/response.js';
import { HttpStatus } from '../../common/http/http-status.js';
import { LoyaltyService } from './loyalty.service.js';
import {
  UpdateLoyaltyProgramInput,
  CreateLoyaltyTierInput,
  UpdateLoyaltyTierInput,
  EnrollCustomerInput,
  PreviewRedemptionInput,
  ManualPointAdjustmentInput,
  ListLoyaltyAccountsQuery,
  ListLoyaltyTransactionsQuery,
} from './loyalty.schema.js';
import { AuthenticatedUserContext } from '../../common/types/index.js';

export class LoyaltyController {
  // ---------------------------------------------------------------------------
  // 1. Program Configuration
  // ---------------------------------------------------------------------------
  public static async getProgram(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const program = await LoyaltyService.getOrCreateProgram(restaurantId);
      ApiResponse.success(res, {
        data: { program },
        message: 'Loyalty program configuration retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateProgram(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const input = req.body as UpdateLoyaltyProgramInput;
      const updated = await LoyaltyService.updateProgram(restaurantId, input, req.user!.id);
      ApiResponse.success(res, {
        data: { program: updated },
        message: 'Loyalty program configuration updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Loyalty Tiers
  // ---------------------------------------------------------------------------
  public static async listTiers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const tiers = await LoyaltyService.listTiers(restaurantId);
      ApiResponse.success(res, {
        data: { tiers },
        message: 'Loyalty tiers retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async createTier(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const input = req.body as CreateLoyaltyTierInput;
      const tier = await LoyaltyService.createTier(restaurantId, input, req.user!.id);
      ApiResponse.success(res, {
        data: { tier },
        message: 'Loyalty tier created successfully',
        statusCode: HttpStatus.CREATED,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateTier(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const id = req.params.id as string;
      const input = req.body as UpdateLoyaltyTierInput;
      const updated = await LoyaltyService.updateTier(restaurantId, id, input, req.user!.id);
      ApiResponse.success(res, {
        data: { tier: updated },
        message: 'Loyalty tier updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async deleteTier(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const id = req.params.id as string;
      await LoyaltyService.deleteTier(restaurantId, id, req.user!.id);
      ApiResponse.success(res, {
        data: null,
        message: 'Loyalty tier deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Customer Accounts & Enrollment
  // ---------------------------------------------------------------------------
  public static async listAccounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const query = req.query as unknown as ListLoyaltyAccountsQuery;
      const result = await LoyaltyService.listAccounts(restaurantId, query);
      ApiResponse.success(res, {
        data: {
          items: result.accounts,
          pagination: result.pagination,
        },
        message: 'Loyalty accounts retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getCustomerAccount(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const customerId = req.params.customerId as string;
      const account = await LoyaltyService.getAccountByCustomerId(restaurantId, customerId);
      ApiResponse.success(res, {
        data: { account },
        message: 'Customer loyalty profile retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async enrollCustomer(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const input = req.body as EnrollCustomerInput;
      const account = await LoyaltyService.enrollCustomer(restaurantId, input, req.user!.id);
      ApiResponse.success(res, {
        data: { account },
        message: 'Customer enrolled into loyalty program successfully',
        statusCode: HttpStatus.CREATED,
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Pre-Checkout Redemption Preview
  // ---------------------------------------------------------------------------
  public static async previewRedemption(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const input = req.body as PreviewRedemptionInput;
      const preview = await LoyaltyService.previewRedemption(restaurantId, input);
      ApiResponse.success(res, {
        data: preview,
        message: 'Redemption calculation preview retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Manual Point Adjustment
  // ---------------------------------------------------------------------------
  public static async manualAdjustment(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const input = req.body as ManualPointAdjustmentInput;
      const result = await LoyaltyService.manualAdjustment(
        restaurantId,
        input,
        req.user! as AuthenticatedUserContext,
      );
      ApiResponse.success(res, {
        data: result,
        message: 'Loyalty points adjusted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Transactions & Summary
  // ---------------------------------------------------------------------------
  public static async listTransactions(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const query = req.query as unknown as ListLoyaltyTransactionsQuery;
      const result = await LoyaltyService.listTransactions(restaurantId, query);
      ApiResponse.success(res, {
        data: {
          items: result.transactions,
          pagination: result.pagination,
        },
        message: 'Loyalty transactions retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const summary = await LoyaltyService.getSummary(restaurantId);
      ApiResponse.success(res, {
        data: { summary },
        message: 'Loyalty program summary analytics retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}
