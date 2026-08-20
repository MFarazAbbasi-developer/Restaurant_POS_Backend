import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { BadRequestError, ConflictError, NotFoundError, ForbiddenError } from '../../common/errors/app-error.js';
import { AuditService } from '../../common/services/audit.service.js';
import { RealtimeService } from '../../common/services/realtime.service.js';
import { ManagerAuthService } from '../auth/manager-auth.service.js';
import { AuthenticatedUserContext } from '../../common/types/index.js';
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

export class ExpensesService {
  // ===========================================================================
  // 1. Expense Categories Management
  // ===========================================================================

  public static async createCategory(
    restaurantId: string,
    input: CreateExpenseCategoryInput,
    actorId?: string,
  ) {
    const existing = await prisma.expenseCategory.findUnique({
      where: {
        restaurantId_name: {
          restaurantId,
          name: input.name.trim(),
        },
      },
    });

    if (existing) {
      throw new ConflictError(`Expense category with name "${input.name.trim()}" already exists`);
    }

    const category = await prisma.expenseCategory.create({
      data: {
        restaurantId,
        name: input.name.trim(),
        description: input.description?.trim() ?? null,
        isActive: input.isActive ?? true,
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'EXPENSE_CATEGORY_CREATED',
      entityType: 'EXPENSE_CATEGORY',
      entityId: category.id,
      metadata: { name: category.name },
    });

    RealtimeService.emitToRestaurant(restaurantId, 'expense_category:created', { category });

    return category;
  }

  public static async listCategories(restaurantId: string, query: ListCategoriesQuery) {
    const { page, limit, search, isActive } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ExpenseCategoryWhereInput = {
      restaurantId,
      ...(isActive !== undefined ? { isActive } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, categories] = await Promise.all([
      prisma.expenseCategory.count({ where }),
      prisma.expenseCategory.findMany({
        where,
        skip,
        take: limit,
        include: {
          _count: {
            select: { expenses: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      items: categories,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  public static async getCategory(restaurantId: string, id: string) {
    const category = await prisma.expenseCategory.findFirst({
      where: { id, restaurantId },
      include: {
        expenses: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            expenseNumber: true,
            amount: true,
            paymentMethod: true,
            status: true,
            date: true,
            description: true,
          },
        },
        _count: {
          select: { expenses: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundError('Expense category not found');
    }

    return category;
  }

  public static async updateCategory(
    restaurantId: string,
    id: string,
    input: UpdateExpenseCategoryInput,
    actorId?: string,
  ) {
    const category = await prisma.expenseCategory.findFirst({
      where: { id, restaurantId },
    });

    if (!category) {
      throw new NotFoundError('Expense category not found');
    }

    if (input.name && input.name.trim() !== category.name) {
      const existing = await prisma.expenseCategory.findUnique({
        where: {
          restaurantId_name: {
            restaurantId,
            name: input.name.trim(),
          },
        },
      });

      if (existing) {
        throw new ConflictError(`Expense category with name "${input.name.trim()}" already exists`);
      }
    }

    const updated = await prisma.expenseCategory.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() ?? null }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'EXPENSE_CATEGORY_UPDATED',
      entityType: 'EXPENSE_CATEGORY',
      entityId: id,
      metadata: { changes: input },
    });

    RealtimeService.emitToRestaurant(restaurantId, 'expense_category:updated', {
      category: updated,
    });

    return updated;
  }

  public static async deleteCategory(restaurantId: string, id: string, actorId?: string) {
    const category = await prisma.expenseCategory.findFirst({
      where: { id, restaurantId },
    });

    if (!category) {
      throw new NotFoundError('Expense category not found');
    }

    const updated = await prisma.expenseCategory.update({
      where: { id },
      data: { isActive: false },
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'EXPENSE_CATEGORY_DEACTIVATED',
      entityType: 'EXPENSE_CATEGORY',
      entityId: id,
    });

    return updated;
  }

  // ===========================================================================
  // 2. Expense Recording & Voiding Operations
  // ===========================================================================

  private static generateExpenseNumber(date: Date, countToday: number): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const seq = String(countToday + 1).padStart(3, '0');
    return `EXP-${y}${m}${d}-${seq}`;
  }

  public static async createExpense(
    restaurantId: string,
    input: CreateExpenseInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const category = await prisma.expenseCategory.findFirst({
      where: { id: input.categoryId, restaurantId },
    });

    if (!category) {
      throw new NotFoundError('Expense category not found');
    }

    if (!category.isActive) {
      throw new BadRequestError('Cannot record expenses under an inactive expense category');
    }

    if (input.supplierId) {
      const supplier = await prisma.supplier.findFirst({
        where: { id: input.supplierId, restaurantId },
      });
      if (!supplier) throw new NotFoundError('Supplier not found');
    }

    const expenseDate = input.date ? new Date(input.date) : new Date();
    const businessDate = input.businessDate || expenseDate.toISOString().split('T')[0] || '';
    const amountDec = new Prisma.Decimal(input.amount);
    const paymentMethod = input.paymentMethod || 'CASH';

    // Locate active shift for Cash payments if applicable
    let activeShiftId: string | null = input.shiftId ?? null;
    if (paymentMethod === 'CASH' && !activeShiftId) {
      const openShift = await prisma.cashierShift.findFirst({
        where: {
          restaurantId,
          cashierId: actor.id,
          status: 'OPEN',
        },
      });
      if (openShift) {
        activeShiftId = openShift.id;
      }
    }

    if (input.shiftId) {
      const specifiedShift = await prisma.cashierShift.findFirst({
        where: { id: input.shiftId, restaurantId },
      });
      if (!specifiedShift) {
        throw new NotFoundError('Specified cashier shift not found');
      }
      if (specifiedShift.status !== 'OPEN') {
        throw new BadRequestError('Cannot record cash expenses against a closed cashier shift');
      }
      activeShiftId = specifiedShift.id;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const countToday = await prisma.expense.count({
      where: { restaurantId, createdAt: { gte: today } },
    });
    const expenseNumber = this.generateExpenseNumber(new Date(), countToday);

    const expense = await prisma.$transaction(async (tx) => {
      const newExpense = await tx.expense.create({
        data: {
          restaurantId,
          categoryId: category.id,
          supplierId: input.supplierId ?? null,
          shiftId: activeShiftId,
          expenseNumber,
          amount: amountDec,
          paymentMethod,
          status: 'RECORDED',
          date: expenseDate,
          businessDate,
          description: input.description.trim(),
          reference: input.reference?.trim() ?? null,
          receiptUrl: input.receiptUrl?.trim() ?? null,
          notes: input.notes?.trim() ?? null,
          createdById: actor.id,
        },
        include: {
          category: true,
          supplier: true,
          shift: { select: { id: true, registerName: true, status: true, businessDate: true } },
          createdByUser: { select: { id: true, name: true, username: true } },
        },
      });

      // Synchronize with cashier shift & cash drawer ledger if cash expense
      if (paymentMethod === 'CASH' && activeShiftId) {
        await tx.cashierShift.update({
          where: { id: activeShiftId },
          data: {
            cashExpenses: { increment: amountDec },
          },
        });

        await tx.cashTransaction.create({
          data: {
            restaurantId,
            shiftId: activeShiftId,
            type: 'EXPENSE',
            amount: amountDec,
            reason: `Expense: ${category.name} - ${input.description.trim()} (${expenseNumber})`,
            expenseId: newExpense.id,
            createdById: actor.id,
          },
        });
      }

      return newExpense;
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'EXPENSE_RECORDED',
      entityType: 'EXPENSE',
      entityId: expense.id,
      metadata: {
        expenseNumber,
        category: category.name,
        amount: amountDec,
        paymentMethod,
        shiftId: activeShiftId,
      },
      ipAddress,
    });

    RealtimeService.emitToRestaurant(restaurantId, 'expense:created', { expense });

    return expense;
  }

  public static async getExpense(restaurantId: string, id: string) {
    const expense = await prisma.expense.findFirst({
      where: { id, restaurantId },
      include: {
        category: true,
        supplier: true,
        shift: { select: { id: true, registerName: true, status: true, businessDate: true } },
        cashTransaction: true,
        createdByUser: { select: { id: true, name: true, username: true } },
        voidedByUser: { select: { id: true, name: true, username: true } },
      },
    });

    if (!expense) {
      throw new NotFoundError('Expense not found');
    }

    return expense;
  }

  public static async updateExpense(
    restaurantId: string,
    id: string,
    input: UpdateExpenseInput,
    actorId?: string,
  ) {
    const expense = await prisma.expense.findFirst({
      where: { id, restaurantId },
    });

    if (!expense) {
      throw new NotFoundError('Expense not found');
    }

    if (expense.status === 'VOIDED') {
      throw new BadRequestError('Cannot modify a voided expense record');
    }

    if (input.categoryId) {
      const category = await prisma.expenseCategory.findFirst({
        where: { id: input.categoryId, restaurantId },
      });
      if (!category) throw new NotFoundError('Expense category not found');
    }

    const updated = await prisma.expense.update({
      where: { id },
      data: {
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
        ...(input.description ? { description: input.description.trim() } : {}),
        ...(input.reference !== undefined ? { reference: input.reference?.trim() ?? null } : {}),
        ...(input.receiptUrl !== undefined ? { receiptUrl: input.receiptUrl?.trim() ?? null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() ?? null } : {}),
      },
      include: {
        category: true,
        supplier: true,
        shift: true,
        createdByUser: { select: { id: true, name: true, username: true } },
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'EXPENSE_UPDATED',
      entityType: 'EXPENSE',
      entityId: id,
      metadata: { changes: input },
    });

    RealtimeService.emitToRestaurant(restaurantId, 'expense:updated', { expense: updated });

    return updated;
  }

  public static async voidExpense(
    restaurantId: string,
    id: string,
    input: VoidExpenseInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const expense = await prisma.expense.findFirst({
      where: { id, restaurantId },
      include: {
        category: true,
        shift: true,
      },
    });

    if (!expense) {
      throw new NotFoundError('Expense not found');
    }

    if (expense.status === 'VOIDED') {
      throw new BadRequestError('Expense is already voided');
    }

    // Check manager authorization if user does not directly have expenses.void permission
    const hasVoidPermission =
      actor.permissions.includes('expenses.void') || actor.roles.includes('OWNER');
    if (!hasVoidPermission) {
      if (!input.managerPin) {
        throw new ForbiddenError('Manager PIN authorization is required to void this expense');
      }
      await ManagerAuthService.verifyManagerPin({
        restaurantId,
        pin: input.managerPin,
        requiredPermission: 'expenses.void',
      });
    }

    const voided = await prisma.$transaction(async (tx) => {
      // Revert shift cash drawer if it was a cash expense linked to a shift
      if (expense.paymentMethod === 'CASH' && expense.shiftId) {
        const shift = await tx.cashierShift.findFirst({
          where: { id: expense.shiftId, restaurantId },
        });

        if (shift && shift.status === 'OPEN') {
          await tx.cashierShift.update({
            where: { id: shift.id },
            data: {
              cashExpenses: { decrement: expense.amount },
            },
          });

          await tx.cashTransaction.create({
            data: {
              restaurantId,
              shiftId: shift.id,
              type: 'PAY_IN',
              amount: expense.amount,
              reason: `Reversal of Voided Expense ${expense.expenseNumber} (${input.reason.trim()})`,
              createdById: actor.id,
            },
          });
        }
      }

      return tx.expense.update({
        where: { id },
        data: {
          status: 'VOIDED',
          voidReason: input.reason.trim(),
          voidedAt: new Date(),
          voidedById: actor.id,
        },
        include: {
          category: true,
          supplier: true,
          shift: { select: { id: true, registerName: true, status: true } },
          createdByUser: { select: { id: true, name: true, username: true } },
          voidedByUser: { select: { id: true, name: true, username: true } },
        },
      });
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'EXPENSE_VOIDED',
      entityType: 'EXPENSE',
      entityId: id,
      metadata: {
        expenseNumber: expense.expenseNumber,
        amount: expense.amount,
        reason: input.reason.trim(),
      },
      ipAddress,
    });

    RealtimeService.emitToRestaurant(restaurantId, 'expense:voided', { expense: voided });

    return voided;
  }

  // ===========================================================================
  // 3. Expense Queries & Summary Analytics
  // ===========================================================================

  public static async listExpenses(restaurantId: string, query: ListExpensesQuery) {
    const {
      page,
      limit,
      startDate,
      endDate,
      businessDate,
      categoryId,
      paymentMethod,
      status,
      supplierId,
      shiftId,
      search,
    } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.ExpenseWhereInput = {
      restaurantId,
      ...(status ? { status } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(paymentMethod ? { paymentMethod } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(shiftId ? { shiftId } : {}),
      ...(businessDate ? { businessDate } : {}),
      ...(startDate || endDate
        ? {
            date: {
              ...(startDate ? { gte: new Date(startDate) } : {}),
              ...(endDate ? { lte: new Date(endDate) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { expenseNumber: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { reference: { contains: search, mode: 'insensitive' } },
              { category: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [total, expenses, totalsAgg] = await Promise.all([
      prisma.expense.count({ where }),
      prisma.expense.findMany({
        where,
        skip,
        take: limit,
        include: {
          category: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
          shift: { select: { id: true, registerName: true, status: true, businessDate: true } },
          createdByUser: { select: { id: true, name: true, username: true } },
        },
        orderBy: { date: 'desc' },
      }),
      prisma.expense.aggregate({
        where: { ...where, status: 'RECORDED' },
        _sum: { amount: true },
      }),
    ]);

    return {
      items: expenses,
      summary: {
        totalActiveExpensesAmount: Number(totalsAgg._sum.amount || 0),
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  public static async getExpensesSummary(restaurantId: string, query: ExpensesSummaryQuery) {
    const { startDate, endDate, businessDate, categoryId, paymentMethod, supplierId } = query;

    const where: Prisma.ExpenseWhereInput = {
      restaurantId,
      status: 'RECORDED', // only non-voided expenses in summary
      ...(categoryId ? { categoryId } : {}),
      ...(paymentMethod ? { paymentMethod } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(businessDate ? { businessDate } : {}),
      ...(startDate || endDate
        ? {
            date: {
              ...(startDate ? { gte: new Date(startDate) } : {}),
              ...(endDate ? { lte: new Date(endDate) } : {}),
            },
          }
        : {}),
    };

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
      },
    });

    let totalAmountDec = new Prisma.Decimal(0);
    const categoryMap = new Map<string, { name: string; total: Prisma.Decimal; count: number }>();
    const paymentMethodMap = new Map<string, { total: Prisma.Decimal; count: number }>();
    const dailyMap = new Map<string, { date: string; total: Prisma.Decimal; count: number }>();

    for (const exp of expenses) {
      totalAmountDec = totalAmountDec.add(exp.amount);

      // Category breakdown
      const catKey = exp.categoryId;
      const prevCat = categoryMap.get(catKey) || {
        name: exp.category.name,
        total: new Prisma.Decimal(0),
        count: 0,
      };
      categoryMap.set(catKey, {
        name: exp.category.name,
        total: prevCat.total.add(exp.amount),
        count: prevCat.count + 1,
      });

      // Payment method breakdown
      const pmKey = exp.paymentMethod;
      const prevPm = paymentMethodMap.get(pmKey) || {
        total: new Prisma.Decimal(0),
        count: 0,
      };
      paymentMethodMap.set(pmKey, {
        total: prevPm.total.add(exp.amount),
        count: prevPm.count + 1,
      });

      // Daily breakdown
      const dateKey = exp.businessDate || exp.date.toISOString().split('T')[0] || '';
      const prevDay = dailyMap.get(dateKey) || {
        date: dateKey,
        total: new Prisma.Decimal(0),
        count: 0,
      };
      dailyMap.set(dateKey, {
        date: dateKey,
        total: prevDay.total.add(exp.amount),
        count: prevDay.count + 1,
      });
    }

    const byCategory = Array.from(categoryMap.entries())
      .map(([id, data]) => ({
        categoryId: id,
        name: data.name,
        totalAmount: data.total.toNumber(),
        count: data.count,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    const byPaymentMethod = Array.from(paymentMethodMap.entries()).map(([method, data]) => ({
      paymentMethod: method,
      totalAmount: data.total.toNumber(),
      count: data.count,
    }));

    const dailyBreakdown = Array.from(dailyMap.values())
      .map((d) => ({
        date: d.date,
        totalAmount: d.total.toNumber(),
        count: d.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalExpensesCount: expenses.length,
      totalExpensesAmount: totalAmountDec.toNumber(),
      byCategory,
      byPaymentMethod,
      dailyBreakdown,
    };
  }
}
