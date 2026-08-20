import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../../common/http/response.js';
import { HttpStatus } from '../../common/http/http-status.js';
import { ExpensesService } from './expenses.service.js';
import {
  CreateExpenseCategoryInput,
  UpdateExpenseCategoryInput,
  ListCategoriesQuery,
  CreateExpenseInput,
  UpdateExpenseInput,
  VoidExpenseInput,
  ListExpensesQuery,
  ExpensesSummaryQuery,
} from './expenses.schema.js';

export class ExpensesController {
  // ===========================================================================
  // 1. Category Handlers
  // ===========================================================================

  public static async createCategory(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const input = req.body as CreateExpenseCategoryInput;
      const category = await ExpensesService.createCategory(restaurantId, input, req.user!.id);
      ApiResponse.success(res, {
        data: { category },
        message: 'Expense category created successfully',
        statusCode: HttpStatus.CREATED,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async listCategories(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const query = req.query as unknown as ListCategoriesQuery;
      const result = await ExpensesService.listCategories(restaurantId, query);
      ApiResponse.success(res, {
        data: result,
        message: 'Expense categories retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const id = req.params.id as string;
      const category = await ExpensesService.getCategory(restaurantId, id);
      ApiResponse.success(res, {
        data: { category },
        message: 'Expense category retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateCategory(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const id = req.params.id as string;
      const input = req.body as UpdateExpenseCategoryInput;
      const category = await ExpensesService.updateCategory(restaurantId, id, input, req.user!.id);
      ApiResponse.success(res, {
        data: { category },
        message: 'Expense category updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async deleteCategory(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const id = req.params.id as string;
      await ExpensesService.deleteCategory(restaurantId, id, req.user!.id);
      ApiResponse.success(res, {
        message: 'Expense category deactivated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // ===========================================================================
  // 2. Expense Handlers
  // ===========================================================================

  public static async createExpense(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const input = req.body as CreateExpenseInput;
      const expense = await ExpensesService.createExpense(restaurantId, input, req.user!, req.ip);
      ApiResponse.success(res, {
        data: { expense },
        message: 'Expense recorded successfully',
        statusCode: HttpStatus.CREATED,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async listExpenses(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const query = req.query as unknown as ListExpensesQuery;
      const result = await ExpensesService.listExpenses(restaurantId, query);
      ApiResponse.success(res, {
        data: result,
        message: 'Expenses retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getExpense(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const id = req.params.id as string;
      const expense = await ExpensesService.getExpense(restaurantId, id);
      ApiResponse.success(res, {
        data: { expense },
        message: 'Expense details retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateExpense(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const id = req.params.id as string;
      const input = req.body as UpdateExpenseInput;
      const expense = await ExpensesService.updateExpense(restaurantId, id, input, req.user!.id);
      ApiResponse.success(res, {
        data: { expense },
        message: 'Expense updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async voidExpense(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const id = req.params.id as string;
      const input = req.body as VoidExpenseInput;
      const expense = await ExpensesService.voidExpense(restaurantId, id, input, req.user!, req.ip);
      ApiResponse.success(res, {
        data: { expense },
        message: 'Expense voided successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getExpensesSummary(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const query = req.query as unknown as ExpensesSummaryQuery;
      const summary = await ExpensesService.getExpensesSummary(restaurantId, query);
      ApiResponse.success(res, {
        data: summary,
        message: 'Expenses summary retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}
