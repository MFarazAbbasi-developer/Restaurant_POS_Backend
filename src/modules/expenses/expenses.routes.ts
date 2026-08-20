import { Router } from 'express';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { requirePermission } from '../../common/middlewares/permission.middleware.js';
import { validateRequest } from '../../common/middlewares/validate.middleware.js';
import { ExpensesController } from './expenses.controller.js';
import {
  createExpenseCategorySchema,
  updateExpenseCategorySchema,
  categoryIdParamSchema,
  listCategoriesQuerySchema,
  createExpenseSchema,
  updateExpenseSchema,
  expenseIdParamSchema,
  voidExpenseSchema,
  listExpensesQuerySchema,
  expensesSummaryQuerySchema,
} from './expenses.schema.js';

const router = Router();

// Authentication required for all expense operations
router.use(authenticate);

// =============================================================================
// 1. Expense Category Routes
// =============================================================================
router.get(
  '/categories',
  requirePermission('expenses.view'),
  validateRequest({ query: listCategoriesQuerySchema }),
  ExpensesController.listCategories,
);

router.post(
  '/categories',
  requirePermission('expenses.manage'),
  validateRequest({ body: createExpenseCategorySchema }),
  ExpensesController.createCategory,
);

router.get(
  '/categories/:id',
  requirePermission('expenses.view'),
  validateRequest({ params: categoryIdParamSchema }),
  ExpensesController.getCategory,
);

router.put(
  '/categories/:id',
  requirePermission('expenses.manage'),
  validateRequest({ params: categoryIdParamSchema, body: updateExpenseCategorySchema }),
  ExpensesController.updateCategory,
);

router.delete(
  '/categories/:id',
  requirePermission('expenses.manage'),
  validateRequest({ params: categoryIdParamSchema }),
  ExpensesController.deleteCategory,
);

// =============================================================================
// 2. Summary / Analytics Route (placed before /:id)
// =============================================================================
router.get(
  '/summary',
  requirePermission('expenses.view'),
  validateRequest({ query: expensesSummaryQuerySchema }),
  ExpensesController.getExpensesSummary,
);

// =============================================================================
// 3. Expense Operations Routes
// =============================================================================
router.get(
  '/',
  requirePermission('expenses.view'),
  validateRequest({ query: listExpensesQuerySchema }),
  ExpensesController.listExpenses,
);

router.post(
  '/',
  requirePermission('expenses.create'),
  validateRequest({ body: createExpenseSchema }),
  ExpensesController.createExpense,
);

router.get(
  '/:id',
  requirePermission('expenses.view'),
  validateRequest({ params: expenseIdParamSchema }),
  ExpensesController.getExpense,
);

router.put(
  '/:id',
  requirePermission('expenses.manage'),
  validateRequest({ params: expenseIdParamSchema, body: updateExpenseSchema }),
  ExpensesController.updateExpense,
);

router.post(
  '/:id/void',
  // Can be called by staff with expenses.view/create (service enforces manager authorization for non-voiders)
  requirePermission('expenses.create'),
  validateRequest({ params: expenseIdParamSchema, body: voidExpenseSchema }),
  ExpensesController.voidExpense,
);

export const expensesRouter = router;
