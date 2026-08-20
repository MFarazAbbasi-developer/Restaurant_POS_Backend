import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

describe('Faraz POS - Expenses & Expense Management Module', () => {
  let restaurantId: string;
  let otherRestaurantId: string;
  let _ownerToken: string;
  let managerToken: string;
  let cashierToken: string;
  let waiterToken: string;
  let otherToken: string;

  let supplierId: string;
  let createdCategoryId: string;
  let inactiveCategoryId: string;

  beforeAll(async () => {
    // 1. Create primary restaurant & other restaurant
    const rest = await prisma.restaurant.create({
      data: {
        name: 'Expense Bistro Flagship',
        slug: `expense-bistro-${Date.now()}`,
        phone: '+923001234567',
        currency: 'PKR',
      },
    });
    restaurantId = rest.id;

    const otherRest = await prisma.restaurant.create({
      data: {
        name: 'Other Branch Bistro',
        slug: `other-bistro-${Date.now()}`,
        phone: '+923009876543',
        currency: 'PKR',
      },
    });
    otherRestaurantId = otherRest.id;

    // 2. Fetch all system permissions
    const permissions = await prisma.permission.findMany();

    // 3. Create roles for primary restaurant
    const ownerRole = await prisma.role.create({
      data: {
        restaurantId,
        name: 'OWNER_' + Date.now(),
        rolePermissions: {
          create: permissions.map((p) => ({ permissionId: p.id })),
        },
      },
    });

    const managerRole = await prisma.role.create({
      data: {
        restaurantId,
        name: 'MANAGER_' + Date.now(),
        rolePermissions: {
          create: permissions
            .filter((p) =>
              [
                'expenses.view',
                'expenses.create',
                'expenses.manage',
                'expenses.void',
                'shifts.view',
                'shifts.open',
                'shifts.close',
                'shifts.cash_drop',
                'purchasing.view',
                'purchasing.manage',
                'suppliers.manage',
              ].includes(p.key),
            )
            .map((p) => ({ permissionId: p.id })),
        },
      },
    });

    const cashierRole = await prisma.role.create({
      data: {
        restaurantId,
        name: 'CASHIER_' + Date.now(),
        rolePermissions: {
          create: permissions
            .filter((p) =>
              [
                'expenses.view',
                'expenses.create',
                'shifts.view',
                'shifts.open',
                'shifts.close',
                'shifts.cash_drop',
              ].includes(p.key),
            )
            .map((p) => ({ permissionId: p.id })),
        },
      },
    });

    const waiterRole = await prisma.role.create({
      data: {
        restaurantId,
        name: 'WAITER_' + Date.now(),
        rolePermissions: {
          create: permissions
            .filter((p) => ['orders.view', 'orders.create'].includes(p.key))
            .map((p) => ({ permissionId: p.id })),
        },
      },
    });

    const otherOwnerRole = await prisma.role.create({
      data: {
        restaurantId: otherRestaurantId,
        name: 'OWNER_OTHER_' + Date.now(),
        rolePermissions: {
          create: permissions.map((p) => ({ permissionId: p.id })),
        },
      },
    });

    const defaultPinHash = await bcrypt.hash('1234', 10);
    const managerPinHash = await bcrypt.hash('2233', 10);
    const cashierPinHash = await bcrypt.hash('4321', 10);

    // 4. Create Users
    const owner = await prisma.user.create({
      data: {
        restaurantId,
        name: 'Expense Owner',
        username: `owner_${Date.now()}`,
        pinHash: defaultPinHash,
        isActive: true,
        userRoles: { create: [{ roleId: ownerRole.id }] },
      },
    });

    const manager = await prisma.user.create({
      data: {
        restaurantId,
        name: 'Expense Manager',
        username: `manager_${Date.now()}`,
        pinHash: managerPinHash,
        isActive: true,
        userRoles: { create: [{ roleId: managerRole.id }] },
      },
    });

    const cashier = await prisma.user.create({
      data: {
        restaurantId,
        name: 'Expense Cashier',
        username: `cashier_${Date.now()}`,
        pinHash: cashierPinHash,
        isActive: true,
        userRoles: { create: [{ roleId: cashierRole.id }] },
      },
    });

    const waiter = await prisma.user.create({
      data: {
        restaurantId,
        name: 'Expense Waiter',
        username: `waiter_${Date.now()}`,
        pinHash: defaultPinHash,
        isActive: true,
        userRoles: { create: [{ roleId: waiterRole.id }] },
      },
    });

    const otherOwner = await prisma.user.create({
      data: {
        restaurantId: otherRestaurantId,
        name: 'Other Branch Owner',
        username: `other_owner_${Date.now()}`,
        pinHash: defaultPinHash,
        isActive: true,
        userRoles: { create: [{ roleId: otherOwnerRole.id }] },
      },
    });

    // 5. Login all users to obtain access tokens
    const login = async (username: string, pin: string) => {
      const res = await request(app).post('/api/v1/auth/login').send({ username, pin });
      return `Bearer ${res.body.data.accessToken}`;
    };

    _ownerToken = await login(owner.username, '1234');
    managerToken = await login(manager.username, '2233');
    cashierToken = await login(cashier.username, '4321');
    waiterToken = await login(waiter.username, '1234');
    otherToken = await login(otherOwner.username, '1234');

    // 6. Create a test supplier
    const supplier = await prisma.supplier.create({
      data: {
        restaurantId,
        name: 'Metro Cash & Carry Supplies',
        contactPerson: 'Khurram Shah',
        phone: '+923214567890',
        isActive: true,
      },
    });
    supplierId = supplier.id;
  });

  // ===========================================================================
  // 1. Expense Categories Management
  // ===========================================================================
  describe('Expense Categories CRUD & Rules', () => {
    it('should create an active expense category successfully', async () => {
      const res = await request(app)
        .post('/api/v1/expenses/categories')
        .set('Authorization', managerToken)
        .send({
          name: 'Utilities & Power',
          description: 'Electricity bills, water tank, and generator fuel',
          isActive: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.category.name).toBe('Utilities & Power');
      createdCategoryId = res.body.data.category.id;
    });

    it('should reject duplicate category name in the same restaurant', async () => {
      const res = await request(app)
        .post('/api/v1/expenses/categories')
        .set('Authorization', managerToken)
        .send({
          name: 'Utilities & Power',
          description: 'Duplicate name attempt',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('should create an inactive category', async () => {
      const res = await request(app)
        .post('/api/v1/expenses/categories')
        .set('Authorization', managerToken)
        .send({
          name: 'Discontinued Renovation Fund',
          description: 'Old project',
          isActive: false,
        });

      expect(res.status).toBe(201);
      inactiveCategoryId = res.body.data.category.id;
    });

    it('should list categories with search and active filter', async () => {
      const res = await request(app)
        .get('/api/v1/expenses/categories')
        .set('Authorization', managerToken)
        .query({ search: 'Utilities', isActive: 'true' });

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items[0].name).toBe('Utilities & Power');
    });

    it('should get category details by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/expenses/categories/${createdCategoryId}`)
        .set('Authorization', cashierToken);

      expect(res.status).toBe(200);
      expect(res.body.data.category.id).toBe(createdCategoryId);
      expect(res.body.data.category._count).toBeDefined();
    });

    it('should update category properties', async () => {
      const res = await request(app)
        .put(`/api/v1/expenses/categories/${createdCategoryId}`)
        .set('Authorization', managerToken)
        .send({
          description: 'Updated utility and backup fuel expenses',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.category.description).toBe('Updated utility and backup fuel expenses');
    });

    it('should soft-deactivate a category on delete', async () => {
      const res = await request(app)
        .delete(`/api/v1/expenses/categories/${inactiveCategoryId}`)
        .set('Authorization', managerToken);

      expect(res.status).toBe(200);

      const check = await prisma.expenseCategory.findUnique({
        where: { id: inactiveCategoryId },
      });
      expect(check?.isActive).toBe(false);
    });
  });

  // ===========================================================================
  // 2. Expense Recording & Cash Drawer Sync
  // ===========================================================================
  describe('Expense Recording & Cash Drawer Ledger Integration', () => {
    let nonCashExpenseId: string;
    let cashExpenseId: string;
    let activeShiftId: string;

    it('should reject recording expense under an inactive category', async () => {
      const res = await request(app)
        .post('/api/v1/expenses')
        .set('Authorization', cashierToken)
        .send({
          categoryId: inactiveCategoryId,
          amount: 500,
          paymentMethod: 'CASH',
          description: 'Attempt to spend on inactive category',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/inactive expense category/i);
    });

    it('should record a non-cash expense without drawer deduction', async () => {
      const res = await request(app)
        .post('/api/v1/expenses')
        .set('Authorization', managerToken)
        .send({
          categoryId: createdCategoryId,
          amount: 15000,
          paymentMethod: 'BANK_TRANSFER',
          description: 'Commercial electricity bill (LESCO) for August',
          reference: 'LESCO-998822',
          receiptUrl: 'https://cdn.example.com/receipts/lesco.pdf',
          supplierId,
          notes: 'Paid via Meezan Corporate NetBanking',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const exp = res.body.data.expense;
      expect(exp.expenseNumber).toMatch(/^EXP-\d{8}-\d{3}$/);
      expect(Number(exp.amount)).toBe(15000);
      expect(exp.paymentMethod).toBe('BANK_TRANSFER');
      expect(exp.status).toBe('RECORDED');
      expect(exp.supplierId).toBe(supplierId);
      nonCashExpenseId = exp.id;
    });

    it('should synchronize cash expense with cashier shift drawer and ledger', async () => {
      // 1. Cashier opens a shift with 5,000 PKR opening float
      const openShiftRes = await request(app)
        .post('/api/v1/shifts/open')
        .set('Authorization', cashierToken)
        .send({
          registerName: 'Main Counter Register 1',
          openingCash: 5000,
        });

      expect(openShiftRes.status).toBe(201);
      activeShiftId = openShiftRes.body.data.shift.id;

      // 2. Cashier records a petty cash expense of 850 PKR for emergency kitchen cleaning supplies
      const expenseRes = await request(app)
        .post('/api/v1/expenses')
        .set('Authorization', cashierToken)
        .send({
          categoryId: createdCategoryId,
          amount: 850,
          paymentMethod: 'CASH',
          description: 'Emergency mop, detergent, and trash bags from local store',
          reference: 'PETTY-001',
        });

      expect(expenseRes.status).toBe(201);
      const expense = expenseRes.body.data.expense;
      expect(expense.shiftId).toBe(activeShiftId);
      expect(Number(expense.amount)).toBe(850);
      cashExpenseId = expense.id;

      // 3. Inspect current shift drawer cash - should deduct 850 from available cash (5000 - 850 = 4150)
      const activeShift = await request(app)
        .get('/api/v1/shifts/current')
        .set('Authorization', cashierToken);

      expect(activeShift.status).toBe(200);
      expect(activeShift.body.data.shift.cashExpenses).toBe(850);
      expect(activeShift.body.data.shift.currentDrawerCash).toBe(4150);

      // 4. Verify CashTransaction record of type EXPENSE was created
      const tx = await prisma.cashTransaction.findFirst({
        where: { expenseId: cashExpenseId },
      });
      expect(tx).not.toBeNull();
      expect(tx?.type).toBe('EXPENSE');
      expect(Number(tx?.amount)).toBe(850);
    });

    it('should get expense details by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/expenses/${cashExpenseId}`)
        .set('Authorization', cashierToken);

      expect(res.status).toBe(200);
      expect(res.body.data.expense.id).toBe(cashExpenseId);
      expect(res.body.data.expense.category.name).toBe('Utilities & Power');
      expect(res.body.data.expense.createdByUser.name).toBe('Expense Cashier');
    });

    it('should update non-voided expense notes and metadata', async () => {
      const res = await request(app)
        .put(`/api/v1/expenses/${nonCashExpenseId}`)
        .set('Authorization', managerToken)
        .send({
          reference: 'LESCO-998822-VERIFIED',
          notes: 'Bill transaction verified by finance accountant',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.expense.reference).toBe('LESCO-998822-VERIFIED');
      expect(res.body.data.expense.notes).toBe('Bill transaction verified by finance accountant');
    });

    it('should void non-cash expense successfully', async () => {
      const res = await request(app)
        .post(`/api/v1/expenses/${nonCashExpenseId}/void`)
        .set('Authorization', managerToken)
        .send({
          reason: 'Entered duplicate bill voucher by mistake',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.expense.status).toBe('VOIDED');
      expect(res.body.data.expense.voidReason).toBe('Entered duplicate bill voucher by mistake');
      expect(res.body.data.expense.voidedByUser).toBeDefined();
    });

    it('should reject updating a voided expense', async () => {
      const res = await request(app)
        .put(`/api/v1/expenses/${nonCashExpenseId}`)
        .set('Authorization', managerToken)
        .send({
          notes: 'Trying to update voided bill',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/cannot modify a voided expense/i);
    });

    it('should void cash expense with Cashier using Manager PIN and reimburse drawer balance', async () => {
      // Cashier voids the 850 cash expense using Manager PIN
      const res = await request(app)
        .post(`/api/v1/expenses/${cashExpenseId}/void`)
        .set('Authorization', cashierToken)
        .send({
          reason: 'Vendor returned cash payment due to item exchange',
          managerPin: '2233',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.expense.status).toBe('VOIDED');

      // Check shift drawer: cashExpenses reverted to 0, currentDrawerCash back to 5000
      const activeShift = await request(app)
        .get('/api/v1/shifts/current')
        .set('Authorization', cashierToken);

      expect(activeShift.status).toBe(200);
      expect(activeShift.body.data.shift.cashExpenses).toBe(0);
      expect(activeShift.body.data.shift.currentDrawerCash).toBe(5000);

      // Verify PAY_IN reversal cash transaction was created
      const reversalTx = await prisma.cashTransaction.findFirst({
        where: {
          shiftId: activeShiftId,
          type: 'PAY_IN',
        },
      });
      expect(reversalTx).not.toBeNull();
      expect(Number(reversalTx?.amount)).toBe(850);
    });

    it('should reject voiding an already voided expense', async () => {
      const res = await request(app)
        .post(`/api/v1/expenses/${cashExpenseId}/void`)
        .set('Authorization', managerToken)
        .send({
          reason: 'Second void attempt',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/already voided/i);
    });
  });

  // ===========================================================================
  // 3. Query Filtering & Summary Analytics
  // ===========================================================================
  describe('Expense Filtering & Business Analytics', () => {
    let kitchenCategoryId: string;

    beforeAll(async () => {
      const cat = await prisma.expenseCategory.create({
        data: {
          restaurantId,
          name: 'Kitchen & Groceries',
          description: 'Daily fresh meat and spices',
          isActive: true,
        },
      });
      kitchenCategoryId = cat.id;

      // Seed 3 valid recorded expenses
      await request(app).post('/api/v1/expenses').set('Authorization', managerToken).send({
        categoryId: kitchenCategoryId,
        amount: 4500,
        paymentMethod: 'CASH',
        description: 'Fresh chicken delivery from local poultry',
      });

      await request(app).post('/api/v1/expenses').set('Authorization', managerToken).send({
        categoryId: kitchenCategoryId,
        amount: 3200,
        paymentMethod: 'DIGITAL_WALLET',
        description: 'Vegetables and dairy purchase via EasyPaisa',
      });

      await request(app).post('/api/v1/expenses').set('Authorization', managerToken).send({
        categoryId: createdCategoryId,
        amount: 6000,
        paymentMethod: 'CASH',
        description: 'Generator fuel diesel 20 Liters',
      });
    });

    it('should list expenses with search, status, and category filter', async () => {
      const res = await request(app)
        .get('/api/v1/expenses')
        .set('Authorization', managerToken)
        .query({
          status: 'RECORDED',
          search: 'poultry',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].description).toMatch(/poultry/i);
      expect(res.body.data.summary.totalActiveExpensesAmount).toBeGreaterThan(0);
    });

    it('should generate expenses summary breakdown with category and payment method aggregation', async () => {
      const res = await request(app)
        .get('/api/v1/expenses/summary')
        .set('Authorization', managerToken);

      expect(res.status).toBe(200);
      const summary = res.body.data;
      expect(summary.totalExpensesCount).toBeGreaterThanOrEqual(3);
      expect(summary.totalExpensesAmount).toBeGreaterThan(10000);
      expect(summary.byCategory.length).toBeGreaterThanOrEqual(2);
      expect(summary.byPaymentMethod.length).toBeGreaterThanOrEqual(2);
      expect(summary.dailyBreakdown.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ===========================================================================
  // 4. RBAC & Multi-tenant Isolation
  // ===========================================================================
  describe('RBAC & Tenant Isolation', () => {
    it('should forbid unauthorized staff without expenses permission', async () => {
      const res = await request(app).get('/api/v1/expenses').set('Authorization', waiterToken);

      expect(res.status).toBe(403);
    });

    it('should forbid cashier from managing categories without expenses.manage', async () => {
      const res = await request(app)
        .post('/api/v1/expenses/categories')
        .set('Authorization', cashierToken)
        .send({
          name: 'Unauthorized Category',
        });

      expect(res.status).toBe(403);
    });

    it('should prevent cross-restaurant tenant data leakage', async () => {
      // Accessing primary restaurant's category from other tenant should return 404
      const res = await request(app)
        .get(`/api/v1/expenses/categories/${createdCategoryId}`)
        .set('Authorization', otherToken);

      expect(res.status).toBe(404);
    });
  });
});
