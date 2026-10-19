import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

describe('FARMAX POS - Cashier Shifts & Cash Drawer Management Tests', () => {
  let restaurantId: string;
  let otherRestaurantId: string;

  let managerAccessToken: string;
  let cashierAccessToken: string;
  let otherOwnerAccessToken: string;

  let managerUserId: string;
  let cashierUserId: string;

  let testCategoryId: string;
  let testMenuItemId: string;
  let testOrderId: string;

  let activeShiftId: string;

  beforeAll(async () => {
    // 1. Fetch primary seeded restaurant
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: 'faraz-flagship' },
    });
    if (!restaurant) {
      throw new Error('Database not seeded! Please run prisma seed.');
    }
    restaurantId = restaurant.id;

    // 2. Fetch roles
    const managerRole = await prisma.role.findFirst({
      where: { restaurantId, name: 'MANAGER' },
    });
    const cashierRole = await prisma.role.findFirst({
      where: { restaurantId, name: 'CASHIER' },
    });

    const bcrypt = await import('bcrypt');
    const pinHashManager = await bcrypt.hash('6677', 10);
    const pinHashCashier = await bcrypt.hash('6688', 10);

    // Create Suite-Isolated Manager
    const managerUser = await prisma.user.upsert({
      where: {
        restaurantId_username: { restaurantId, username: 'shift_test_manager' },
      },
      update: { isActive: true, pinHash: pinHashManager },
      create: {
        restaurantId,
        name: 'Shift Test Manager',
        username: 'shift_test_manager',
        pinHash: pinHashManager,
        userRoles: { create: { roleId: managerRole!.id } },
      },
    });
    managerUserId = managerUser.id;

    // Create Suite-Isolated Cashier
    const cashierUser = await prisma.user.upsert({
      where: {
        restaurantId_username: { restaurantId, username: 'shift_test_cashier' },
      },
      update: { isActive: true, pinHash: pinHashCashier },
      create: {
        restaurantId,
        name: 'Shift Test Cashier',
        username: 'shift_test_cashier',
        pinHash: pinHashCashier,
        userRoles: { create: { roleId: cashierRole!.id } },
      },
    });
    cashierUserId = cashierUser.id;

    // Log in suite users
    const managerLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'shift_test_manager',
      pin: '6677',
    });
    managerAccessToken = managerLogin.body.data.accessToken;

    const cashierLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'shift_test_cashier',
      pin: '6688',
    });
    cashierAccessToken = cashierLogin.body.data.accessToken;

    // 3. Create Secondary Restaurant for Tenant Isolation Tests
    const otherRest = await prisma.restaurant.upsert({
      where: { slug: 'shift-iso-bistro' },
      update: {},
      create: {
        name: 'Shift Isolation Bistro',
        slug: 'shift-iso-bistro',
        currency: 'USD',
      },
    });
    otherRestaurantId = otherRest.id;

    const pinHashOther = await bcrypt.hash('1234', 10);
    const otherOwnerRole = await prisma.role.upsert({
      where: { restaurantId_name: { restaurantId: otherRestaurantId, name: 'OWNER' } },
      update: {},
      create: {
        restaurantId: otherRestaurantId,
        name: 'OWNER',
        description: 'Owner of other restaurant',
      },
    });

    await prisma.user.upsert({
      where: {
        restaurantId_username: { restaurantId: otherRestaurantId, username: 'shift_iso_owner' },
      },
      update: { isActive: true, pinHash: pinHashOther },
      create: {
        restaurantId: otherRestaurantId,
        name: 'Shift Iso Owner',
        username: 'shift_iso_owner',
        pinHash: pinHashOther,
        userRoles: { create: { roleId: otherOwnerRole.id } },
      },
    });

    const otherLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'shift_iso_owner',
      pin: '1234',
    });
    otherOwnerAccessToken = otherLogin.body.data.accessToken;

    // Clean up any existing shifts for the test cashier
    await prisma.cashTransaction.deleteMany({
      where: { shift: { cashierId: cashierUserId } },
    });
    await prisma.paymentRefund.deleteMany({
      where: { shift: { cashierId: cashierUserId } },
    });
    await prisma.payment.deleteMany({
      where: { shift: { cashierId: cashierUserId } },
    });
    await prisma.expense.deleteMany({
      where: { shift: { cashierId: cashierUserId } },
    });
    await prisma.cashierShift.deleteMany({
      where: { cashierId: cashierUserId },
    });

    // Create test category and menu item for order tests
    const category = await prisma.category.create({
      data: {
        restaurantId,
        name: `Shift Test Category ${Date.now()}`,
        sortOrder: 1,
      },
    });
    testCategoryId = category.id;

    const menuItem = await prisma.menuItem.create({
      data: {
        restaurantId,
        categoryId: testCategoryId,
        itemCode: `SHIFT-BURGER-${Date.now()}`,
        name: 'Shift Test Burger',
        basePrice: 25.0,
      },
    });
    testMenuItemId = menuItem.id;
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.cashTransaction.deleteMany({
      where: { shift: { cashierId: cashierUserId } },
    });
    await prisma.paymentRefund.deleteMany({
      where: { shift: { cashierId: cashierUserId } },
    });
    await prisma.payment.deleteMany({
      where: { shift: { cashierId: cashierUserId } },
    });
    await prisma.expense.deleteMany({
      where: { shift: { cashierId: cashierUserId } },
    });
    await prisma.cashierShift.deleteMany({
      where: { cashierId: cashierUserId },
    });
    if (testOrderId) {
      await prisma.orderItem.deleteMany({ where: { orderId: testOrderId } });
      await prisma.order.deleteMany({ where: { id: testOrderId } });
    }
    if (testMenuItemId) {
      await prisma.menuItem.deleteMany({ where: { id: testMenuItemId } });
    }
    if (testCategoryId) {
      await prisma.category.deleteMany({ where: { id: testCategoryId } });
    }
  });

  // ===========================================================================
  // 1. Shift Opening & Validation
  // ===========================================================================
  describe('1. Shift Opening & Validation', () => {
    it('should return null shift when requesting current shift before opening', async () => {
      const res = await request(app)
        .get('/api/v1/shifts/current')
        .set('Authorization', `Bearer ${cashierAccessToken}`);

      // Controller returns 200 with shift: null (does not throw NotFoundError)
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.shift).toBeNull();
    });

    it('should reject opening shift with negative opening float', async () => {
      const res = await request(app)
        .post('/api/v1/shifts/open')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          openingCash: -50,
          registerName: 'Main Terminal',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should open a new register shift with opening cash float', async () => {
      const res = await request(app)
        .post('/api/v1/shifts/open')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          openingCash: 100.0,
          registerName: 'Main Terminal 01',
          notes: 'Morning shift opening float',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.shift).toBeDefined();

      const shift = res.body.data.shift;
      expect(shift.status).toBe('OPEN');
      expect(shift.openingCash).toBe(100.0);
      expect(shift.currentDrawerCash).toBe(100.0);
      expect(shift.cashSales).toBe(0);
      expect(shift.cashRefunds).toBe(0);
      expect(shift.cashDrops).toBe(0);
      expect(shift.cashAdjustments).toBe(0);
      expect(shift.cashExpenses).toBe(0);
      expect(shift.registerName).toBe('Main Terminal 01');

      activeShiftId = shift.id;

      // Verify opening float cash transaction
      const openingTx = await prisma.cashTransaction.findFirst({
        where: {
          shiftId: activeShiftId,
          type: 'OPENING_FLOAT',
        },
      });
      expect(openingTx).not.toBeNull();
      expect(Number(openingTx!.amount)).toBe(100.0);

      // Verify audit log
      const audit = await prisma.auditLog.findFirst({
        where: {
          entityId: activeShiftId,
          action: 'SHIFT_OPENED',
        },
      });
      expect(audit).not.toBeNull();
    });

    it('should reject opening a duplicate shift while one is already active for cashier', async () => {
      const res = await request(app)
        .post('/api/v1/shifts/open')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          openingCash: 50.0,
          registerName: 'Main Terminal 01',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('should get current active shift with calculated drawer balance', async () => {
      const res = await request(app)
        .get('/api/v1/shifts/current')
        .set('Authorization', `Bearer ${cashierAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.shift.id).toBe(activeShiftId);
      expect(res.body.data.shift.status).toBe('OPEN');
      expect(res.body.data.shift.currentDrawerCash).toBe(100.0);
      expect(res.body.data.shift.cashier.username).toBe('shift_test_cashier');
    });
  });

  // ===========================================================================
  // 2. Safe Drops (Cash Drops)
  // ===========================================================================
  describe('2. Cash Drops (Safe Transfer)', () => {
    it('should reject cash drop exceeding available cash in drawer', async () => {
      const res = await request(app)
        .post('/api/v1/shifts/current/cash-drop')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          amount: 500.0, // only 100 in drawer
          reason: 'Excessive drop',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject cash drop without reason or with invalid amount', async () => {
      const res = await request(app)
        .post('/api/v1/shifts/current/cash-drop')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          amount: -10.0,
          reason: 'ab', // min length is 3
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should successfully record cash drop and update drawer balance', async () => {
      const res = await request(app)
        .post('/api/v1/shifts/current/cash-drop')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          amount: 30.0,
          reason: 'Midday safe transfer',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.shift.cashDrops).toBe(30.0);
      expect(res.body.data.shift.currentDrawerCash).toBe(70.0); // 100 - 30 = 70

      // Verify CashTransaction recorded
      const tx = await prisma.cashTransaction.findFirst({
        where: {
          shiftId: activeShiftId,
          type: 'CASH_DROP',
        },
      });
      expect(tx).not.toBeNull();
      expect(Number(tx!.amount)).toBe(30.0);
      expect(tx!.reason).toBe('Midday safe transfer');

      // Verify audit log
      const audit = await prisma.auditLog.findFirst({
        where: {
          entityId: activeShiftId,
          action: 'SHIFT_CASH_DROP',
        },
      });
      expect(audit).not.toBeNull();
    });
  });

  // ===========================================================================
  // 3. Cash Adjustments (Pay In / Pay Out)
  // ===========================================================================
  describe('3. Cash Adjustments (Pay In / Pay Out)', () => {
    it('should record a PAY_IN adjustment and increase drawer cash', async () => {
      const res = await request(app)
        .post('/api/v1/shifts/current/adjustment')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          type: 'PAY_IN',
          amount: 25.0,
          reason: 'Added roll of quarters from safe',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.shift.cashAdjustments).toBe(25.0);
      expect(res.body.data.shift.currentDrawerCash).toBe(95.0); // 70 + 25 = 95
    });

    it('should record a PAY_OUT adjustment and decrease drawer cash', async () => {
      const res = await request(app)
        .post('/api/v1/shifts/current/adjustment')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          type: 'PAY_OUT',
          amount: 15.0,
          reason: 'Petty cash for milk from convenience store',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.shift.cashAdjustments).toBe(10.0); // 25 - 15 = 10
      expect(res.body.data.shift.currentDrawerCash).toBe(80.0); // 95 - 15 = 80
    });

    it('should reject PAY_OUT exceeding available drawer cash', async () => {
      const res = await request(app)
        .post('/api/v1/shifts/current/adjustment')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          type: 'PAY_OUT',
          amount: 500.0, // drawer only has 80
          reason: 'Excessive pay-out attempt',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ===========================================================================
  // 4. Sales & Refunds Ledger Integration
  // ===========================================================================
  describe('4. Sales & Refunds Ledger Integration', () => {
    let orderPaymentId: string;

    it('should record cash sales on shift when customer order is paid in CASH', async () => {
      // 1. Create Order
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          orderType: 'DINE_IN',
          items: [{ menuItemId: testMenuItemId, quantity: 2 }], // 2 * $25 = $50
        });

      expect(orderRes.status).toBe(201);
      testOrderId = orderRes.body.data.order.id;

      // 2. Pay Order in Cash ($50.00)
      const payRes = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          orderId: testOrderId,
          paymentMethod: 'CASH',
          amount: 50.0,
          amountTendered: 60.0,
        });

      expect(payRes.status).toBe(201);
      orderPaymentId = payRes.body.data.payment.id;
      expect(payRes.body.data.payment.shiftId).toBe(activeShiftId);

      // 3. Verify Shift Cash Sales updated
      const shiftRes = await request(app)
        .get('/api/v1/shifts/current')
        .set('Authorization', `Bearer ${cashierAccessToken}`);

      expect(shiftRes.status).toBe(200);
      expect(shiftRes.body.data.shift.cashSales).toBe(50.0);
      expect(shiftRes.body.data.shift.currentDrawerCash).toBe(130.0); // 80 + 50 = 130
    });

    it('should record cash refund on shift when manager issues cash refund', async () => {
      const refundRes = await request(app)
        .post(`/api/v1/payments/${orderPaymentId}/refund`)
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          amount: 20.0,
          reason: 'Customer complaint about one burger',
          refundMethod: 'CASH',
        });

      expect(refundRes.status).toBe(200);
      expect(refundRes.body.success).toBe(true);

      // Verify Shift Cash Refunds updated
      const shiftRes = await request(app)
        .get('/api/v1/shifts/current')
        .set('Authorization', `Bearer ${cashierAccessToken}`);

      expect(shiftRes.status).toBe(200);
      expect(shiftRes.body.data.shift.cashRefunds).toBe(20.0);
      expect(shiftRes.body.data.shift.currentDrawerCash).toBe(110.0); // 130 - 20 = 110
    });
  });

  // ===========================================================================
  // 5. Shift Close & Variance Reconciliation
  // ===========================================================================
  describe('5. Shift Close & Variance Reconciliation', () => {
    it('should close shift with counted cash and calculate variance', async () => {
      // Current Drawer Cash:
      // Float ($100) + Cash Sales ($50) - Refunds ($20) - Drops ($30) + Net Adjustments ($10) = Expected $110
      // Actual Counted Cash: $115 (+$5 surplus)
      const closeRes = await request(app)
        .post('/api/v1/shifts/current/close')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          actualClosingCash: 115.0,
          closingNotes: 'Shift closed with $5 surplus tip jar change',
        });

      expect(closeRes.status).toBe(200);
      expect(closeRes.body.success).toBe(true);

      const { shift, summary } = closeRes.body.data;
      expect(shift.status).toBe('CLOSED');
      expect(shift.expectedClosingCash).toBe(110.0);
      expect(shift.actualClosingCash).toBe(115.0);
      expect(shift.variance).toBe(5.0);
      expect(shift.closedAt).not.toBeNull();

      // Verify Summary Object
      expect(summary).toBeDefined();
      expect(summary.shiftId).toBe(activeShiftId);
      expect(summary.cashDrawer.openingCash).toBe(100.0);
      expect(summary.cashDrawer.cashSales).toBe(50.0);
      expect(summary.cashDrawer.cashRefunds).toBe(20.0);
      expect(summary.cashDrawer.cashDrops).toBe(30.0);
      expect(summary.cashDrawer.cashAdjustments).toBe(10.0);
      expect(summary.cashDrawer.expectedClosingCash).toBe(110.0);
      expect(summary.cashDrawer.actualClosingCash).toBe(115.0);
      expect(summary.cashDrawer.variance).toBe(5.0);
      expect(summary.totals.totalSales).toBe(50.0);
      expect(summary.totals.totalRefunds).toBe(20.0);
      expect(summary.totals.netSales).toBe(30.0);

      // Verify Audit Log
      const audit = await prisma.auditLog.findFirst({
        where: {
          entityId: activeShiftId,
          action: 'SHIFT_CLOSED',
        },
      });
      expect(audit).not.toBeNull();
    });

    it('should return 404 when attempting to close already closed shift', async () => {
      const res = await request(app)
        .post('/api/v1/shifts/current/close')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          actualClosingCash: 110.0,
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should reject cash drop on closed shift', async () => {
      const res = await request(app)
        .post('/api/v1/shifts/current/cash-drop')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          amount: 20.0,
          reason: 'Late drop attempt',
        });

      expect(res.status).toBe(404);
    });

    it('should reject cash adjustment on closed shift', async () => {
      const res = await request(app)
        .post('/api/v1/shifts/current/adjustment')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          type: 'PAY_IN',
          amount: 20.0,
          reason: 'Late pay in attempt',
        });

      expect(res.status).toBe(404);
    });
  });

  // ===========================================================================
  // 6. Shift Reports, Details & Listings
  // ===========================================================================
  describe('6. Shift Reports, Details & Listings', () => {
    it('should fetch shift settlement summary report by shift ID', async () => {
      const res = await request(app)
        .get(`/api/v1/shifts/${activeShiftId}/summary`)
        .set('Authorization', `Bearer ${managerAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { summary } = res.body.data;
      expect(summary.shiftId).toBe(activeShiftId);
      expect(summary.status).toBe('CLOSED');
      expect(summary.cashDrawer.openingCash).toBe(100.0);
      expect(summary.cashDrawer.cashSales).toBe(50.0);
      expect(summary.cashDrawer.expectedClosingCash).toBe(110.0);
      expect(summary.cashDrawer.actualClosingCash).toBe(115.0);
      expect(summary.cashDrawer.variance).toBe(5.0);
      expect(summary.paymentsByMethod.CASH).toBeDefined();
      expect(summary.paymentsByMethod.CASH.totalAmount).toBe(50.0);
      expect(summary.refundsByMethod.CASH).toBeDefined();
      expect(summary.refundsByMethod.CASH.totalAmount).toBe(20.0);
    });

    it('should get shift details by ID with cash transactions timeline', async () => {
      const res = await request(app)
        .get(`/api/v1/shifts/${activeShiftId}`)
        .set('Authorization', `Bearer ${cashierAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const shift = res.body.data.shift;
      expect(shift.id).toBe(activeShiftId);
      expect(shift.status).toBe('CLOSED');
      expect(shift.cashTransactions).toBeDefined();
      expect(shift.cashTransactions.length).toBeGreaterThanOrEqual(4); // OPENING_FLOAT, CASH_DROP, PAY_IN, PAY_OUT, CASH_SALE, CASH_REFUND
    });

    it('should list shifts with filtering and pagination', async () => {
      const res = await request(app)
        .get('/api/v1/shifts')
        .query({
          cashierId: cashierUserId,
          status: 'CLOSED',
          page: 1,
          limit: 10,
        })
        .set('Authorization', `Bearer ${managerAccessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.shifts).toBeInstanceOf(Array);
      expect(res.body.data.shifts.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(1);

      const found = res.body.data.shifts.find((s: { id: string }) => s.id === activeShiftId);
      expect(found).toBeDefined();
      expect(found.status).toBe('CLOSED');
    });
  });

  // ===========================================================================
  // 7. Multi-Tenant Isolation
  // ===========================================================================
  describe('7. Multi-Tenant Shift Isolation', () => {
    it('should prevent user from another restaurant from accessing shift summary', async () => {
      const res = await request(app)
        .get(`/api/v1/shifts/${activeShiftId}/summary`)
        .set('Authorization', `Bearer ${otherOwnerAccessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should prevent user from another restaurant from accessing shift details', async () => {
      const res = await request(app)
        .get(`/api/v1/shifts/${activeShiftId}`)
        .set('Authorization', `Bearer ${otherOwnerAccessToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should not include other restaurant shifts in list shifts response', async () => {
      const res = await request(app)
        .get('/api/v1/shifts')
        .set('Authorization', `Bearer ${otherOwnerAccessToken}`);

      expect(res.status).toBe(200);
      const found = res.body.data.shifts.find((s: { id: string }) => s.id === activeShiftId);
      expect(found).toBeUndefined();
    });
  });
});
