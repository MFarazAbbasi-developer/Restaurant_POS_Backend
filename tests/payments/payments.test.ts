import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

describe('FARMAX POS - Payments & Cash Management Module Tests', () => {
  let restaurantId: string;
  let otherRestaurantId: string;

  let managerAccessToken: string;
  let cashierAccessToken: string;
  let otherOwnerAccessToken: string;

  let testCategoryId: string;
  let testMenuItemId: string;

  let testOrderId1: string;
  let testOrderId2: string;
  let activeShiftId: string;
  let testPaymentId: string;

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
    const pinHashManager = await bcrypt.hash('5566', 10);
    const pinHashCashier = await bcrypt.hash('5577', 10);

    // Create Suite-Isolated Manager (has payments.refund, shifts.close, shifts.cash_drop)
    await prisma.user.upsert({
      where: {
        restaurantId_username: { restaurantId, username: 'payment_test_manager' },
      },
      update: { isActive: true, pinHash: pinHashManager },
      create: {
        restaurantId,
        name: 'Payment Test Manager',
        username: 'payment_test_manager',
        pinHash: pinHashManager,
        userRoles: { create: { roleId: managerRole!.id } },
      },
    });

    // Create Suite-Isolated Cashier (has payments.create, shifts.open, shifts.close, NO payments.refund)
    await prisma.user.upsert({
      where: {
        restaurantId_username: { restaurantId, username: 'payment_test_cashier' },
      },
      update: { isActive: true, pinHash: pinHashCashier },
      create: {
        restaurantId,
        name: 'Payment Test Cashier',
        username: 'payment_test_cashier',
        pinHash: pinHashCashier,
        userRoles: { create: { roleId: cashierRole!.id } },
      },
    });

    // Log in suite users
    const managerLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'payment_test_manager',
      pin: '5566',
    });
    managerAccessToken = managerLogin.body.data.accessToken;

    const cashierLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'payment_test_cashier',
      pin: '5577',
    });
    cashierAccessToken = cashierLogin.body.data.accessToken;

    // 3. Create Secondary Restaurant for Tenant Isolation Tests
    const otherRest = await prisma.restaurant.upsert({
      where: { slug: 'payment-iso-bistro' },
      update: {},
      create: {
        name: 'Payment Isolation Bistro',
        slug: 'payment-iso-bistro',
        currency: 'USD',
      },
    });
    otherRestaurantId = otherRest.id;

    const pinHashOther = await bcrypt.hash('1234', 10);
    const otherOwnerRole = await prisma.role.upsert({
      where: {
        restaurantId_name: {
          restaurantId: otherRestaurantId,
          name: 'OWNER',
        },
      },
      update: {},
      create: {
        restaurantId: otherRestaurantId,
        name: 'OWNER',
        description: 'Owner of other restaurant',
      },
    });

    await prisma.user.upsert({
      where: {
        restaurantId_username: {
          restaurantId: otherRestaurantId,
          username: 'payment_other_owner',
        },
      },
      update: {},
      create: {
        restaurantId: otherRestaurantId,
        name: 'Payment Other Owner',
        username: 'payment_other_owner',
        pinHash: pinHashOther,
        userRoles: {
          create: { roleId: otherOwnerRole.id },
        },
      },
    });

    const otherLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'payment_other_owner',
      pin: '1234',
    });
    otherOwnerAccessToken = otherLogin.body.data.accessToken;

    // 4. Seed Test Menu Item
    const category = await prisma.category.create({
      data: {
        restaurantId,
        name: 'Payment Test Category',
        sortOrder: 1,
      },
    });
    testCategoryId = category.id;

    const item = await prisma.menuItem.create({
      data: {
        restaurantId,
        categoryId: category.id,
        itemCode: 'PIZZA-PAY-01',
        name: 'Gourmet Pepperoni Pizza',
        basePrice: 25.0,
      },
    });
    testMenuItemId = item.id;
  });

  afterAll(async () => {
    // Clean up only suite-specific records
    const suiteUsernames = ['payment_test_cashier', 'payment_test_manager', 'payment_other_owner'];

    await prisma.cashTransaction.deleteMany({
      where: {
        OR: [
          { restaurantId: otherRestaurantId },
          { shift: { cashier: { username: { in: suiteUsernames } } } },
        ],
      },
    });
    await prisma.paymentRefund.deleteMany({
      where: {
        OR: [
          { restaurantId: otherRestaurantId },
          { payment: { createdByUser: { username: { in: suiteUsernames } } } },
        ],
      },
    });
    await prisma.payment.deleteMany({
      where: {
        OR: [
          { restaurantId: otherRestaurantId },
          { createdByUser: { username: { in: suiteUsernames } } },
        ],
      },
    });
    await prisma.cashierShift.deleteMany({
      where: {
        OR: [
          { restaurantId: otherRestaurantId },
          { cashier: { username: { in: suiteUsernames } } },
        ],
      },
    });
    await prisma.orderItem.deleteMany({
      where: {
        OR: [
          { order: { restaurantId: otherRestaurantId } },
          { order: { createdByUser: { username: { in: suiteUsernames } } } },
        ],
      },
    });
    await prisma.order.deleteMany({
      where: {
        OR: [
          { restaurantId: otherRestaurantId },
          { createdByUser: { username: { in: suiteUsernames } } },
        ],
      },
    });

    if (testMenuItemId) {
      await prisma.menuItem.deleteMany({ where: { id: testMenuItemId } });
    }
    if (testCategoryId) {
      await prisma.category.deleteMany({ where: { id: testCategoryId } });
    }

    await prisma.user.deleteMany({
      where: {
        username: {
          in: ['payment_other_owner', 'payment_test_manager', 'payment_test_cashier'],
        },
      },
    });
    await prisma.role.deleteMany({
      where: { restaurantId: otherRestaurantId },
    });
    await prisma.restaurant.deleteMany({
      where: { id: otherRestaurantId },
    });
  });

  // ===========================================================================
  // 1. Register Shifts & Cash Drawer Lifecycle
  // ===========================================================================
  describe('1. Register Shifts & Cash Drawer Lifecycle', () => {
    it('should open a new register shift with opening cash balance', async () => {
      const response = await request(app)
        .post('/api/v1/shifts/open')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          openingCash: 100.0,
          registerName: 'Counter Register 1',
          notes: 'Morning shift opening float',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.shift.status).toBe('OPEN');
      expect(response.body.data.shift.openingCash).toBe(100.0);
      expect(response.body.data.shift.currentDrawerCash).toBe(100.0);

      activeShiftId = response.body.data.shift.id;

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: activeShiftId,
          action: 'SHIFT_OPENED',
        },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should reject opening a second shift while another is active for cashier', async () => {
      const response = await request(app)
        .post('/api/v1/shifts/open')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          openingCash: 50.0,
        });

      expect(response.status).toBe(409);
    });

    it('should fetch the current active shift for logged-in cashier', async () => {
      const response = await request(app)
        .get('/api/v1/shifts/current')
        .set('Authorization', `Bearer ${cashierAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.shift.id).toBe(activeShiftId);
      expect(response.body.data.shift.currentDrawerCash).toBe(100.0);
    });

    it('should record a cash drop with mandatory reason', async () => {
      const response = await request(app)
        .post('/api/v1/shifts/current/cash-drop')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          amount: 40.0,
          reason: 'Excess cash transfer to safe',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.shift.cashDrops).toBe(40.0);
      expect(response.body.data.shift.currentDrawerCash).toBe(60.0); // 100 - 40 = 60

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: activeShiftId,
          action: 'SHIFT_CASH_DROP',
        },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should reject cash drop exceeding available cash in drawer', async () => {
      const response = await request(app)
        .post('/api/v1/shifts/current/cash-drop')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          amount: 500.0,
          reason: 'Excessive drop attempt',
        });

      expect(response.status).toBe(400);
    });

    it('should record a cash adjustment (PAY_IN and PAY_OUT)', async () => {
      // Pay In: +$20.00
      const payInRes = await request(app)
        .post('/api/v1/shifts/current/adjustment')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          type: 'PAY_IN',
          amount: 20.0,
          reason: 'Extra change added to drawer',
        });

      expect(payInRes.status).toBe(200);
      expect(payInRes.body.data.shift.cashAdjustments).toBe(20.0);
      expect(payInRes.body.data.shift.currentDrawerCash).toBe(80.0); // 60 + 20 = 80

      // Pay Out: -$10.00
      const payOutRes = await request(app)
        .post('/api/v1/shifts/current/adjustment')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          type: 'PAY_OUT',
          amount: 10.0,
          reason: 'Petty cash for cleaning supplies',
        });

      expect(payOutRes.status).toBe(200);
      expect(payOutRes.body.data.shift.cashAdjustments).toBe(10.0); // 20 - 10 = 10
      expect(payOutRes.body.data.shift.currentDrawerCash).toBe(70.0); // 80 - 10 = 70
    });
  });

  // ===========================================================================
  // 2. Exact Cash Payment & Change Calculation
  // ===========================================================================
  describe('2. Exact Cash Payment & Change Calculation', () => {
    it('should create an order and record cash payment with change calculation', async () => {
      // 1. Create Takeaway order
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          orderType: 'TAKEAWAY',
          items: [{ menuItemId: testMenuItemId, quantity: 1 }],
        });

      expect(orderRes.status).toBe(201);
      testOrderId1 = orderRes.body.data.order.id;
      const payableAmount = orderRes.body.data.order.grandTotal;
      expect(orderRes.body.data.order.paymentStatus).toBe('UNPAID');

      // 2. Process Cash Payment with $5.00 extra cash tendered
      const tendered = Number((payableAmount + 5.0).toFixed(2));
      const payRes = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          orderId: testOrderId1,
          paymentMethod: 'CASH',
          amount: payableAmount,
          amountTendered: tendered,
          notes: 'Customer paid with cash note',
        });

      expect(payRes.status).toBe(201);
      expect(payRes.body.data.payment.amount).toBe(payableAmount);
      expect(payRes.body.data.payment.amountTendered).toBe(tendered);
      expect(payRes.body.data.payment.changeAmount).toBe(5.0);
      expect(payRes.body.data.payment.status).toBe('COMPLETED');
      expect(payRes.body.data.payment.order.paymentStatus).toBe('PAID');
      expect(payRes.body.data.payment.order.paidAmount).toBe(payableAmount);
      expect(payRes.body.data.payment.order.changeAmount).toBe(5.0);

      testPaymentId = payRes.body.data.payment.id;

      // 3. Verify shift cash sales updated
      const shiftRes = await request(app)
        .get('/api/v1/shifts/current')
        .set('Authorization', `Bearer ${cashierAccessToken}`);

      expect(shiftRes.status).toBe(200);
      expect(shiftRes.body.data.shift.cashSales).toBe(payableAmount);

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: testPaymentId,
          action: 'PAYMENT_RECORDED',
        },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should reject payment where tendered amount is less than payment amount', async () => {
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          orderType: 'TAKEAWAY',
          items: [{ menuItemId: testMenuItemId, quantity: 1 }],
        });

      const res = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          orderId: orderRes.body.data.order.id,
          paymentMethod: 'CASH',
          amount: 25.0,
          amountTendered: 20.0, // Less than amount
        });

      expect(res.status).toBe(400);
    });
  });

  // ===========================================================================
  // 3. Card / Digital Payments & Split/Partial Payments
  // ===========================================================================
  describe('3. Card / Digital Payments & Split/Partial Payments', () => {
    it('should support multiple partial split payments against one order', async () => {
      // 1. Create Dine-In order for 2 pizzas
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          orderType: 'DINE_IN',
          items: [{ menuItemId: testMenuItemId, quantity: 2 }],
        });

      expect(orderRes.status).toBe(201);
      testOrderId2 = orderRes.body.data.order.id;
      const totalPayable = orderRes.body.data.order.grandTotal;

      const split1 = 30.0;
      const split2 = Number((totalPayable - split1).toFixed(2));

      // 2. First Split Payment: $30.00 via CARD
      const cardPayRes = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          orderId: testOrderId2,
          paymentMethod: 'CARD',
          amount: split1,
          reference: 'TXN-CARD-9911',
          cardLast4: '4242',
          cardBrand: 'VISA',
        });

      expect(cardPayRes.status).toBe(201);
      expect(cardPayRes.body.data.payment.amount).toBe(split1);
      expect(cardPayRes.body.data.payment.order.paidAmount).toBe(split1);
      expect(cardPayRes.body.data.payment.order.paymentStatus).toBe('PARTIALLY_PAID');

      // 3. Block duplicate reference
      const dupRefRes = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          orderId: testOrderId2,
          paymentMethod: 'CARD',
          amount: 10.0,
          reference: 'TXN-CARD-9911',
        });
      expect(dupRefRes.status).toBe(409);

      // 4. Second Split Payment: remaining via DIGITAL_WALLET -> fully covers totalPayable
      const walletPayRes = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          orderId: testOrderId2,
          paymentMethod: 'DIGITAL_WALLET',
          amount: split2,
          reference: 'EP-WALLET-7788',
        });

      expect(walletPayRes.status).toBe(201);
      expect(walletPayRes.body.data.payment.order.paidAmount).toBe(totalPayable);
      expect(walletPayRes.body.data.payment.order.paymentStatus).toBe('PAID');

      // 5. Query order payments breakdown
      const orderPaymentsRes = await request(app)
        .get(`/api/v1/payments/order/${testOrderId2}`)
        .set('Authorization', `Bearer ${cashierAccessToken}`);

      expect(orderPaymentsRes.status).toBe(200);
      expect(orderPaymentsRes.body.data.payments.length).toBe(2);
      expect(orderPaymentsRes.body.data.summary.totalPaid).toBe(totalPayable);
      expect(orderPaymentsRes.body.data.summary.outstandingBalance).toBe(0);
      expect(orderPaymentsRes.body.data.summary.paymentStatus).toBe('PAID');
    });
  });

  // ===========================================================================
  // 4. Payment Validations & Rejections
  // ===========================================================================
  describe('4. Payment Validations & Rejections', () => {
    it('should reject payment on an already fully paid order', async () => {
      const response = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          orderId: testOrderId2,
          paymentMethod: 'CASH',
          amount: 10.0,
        });

      expect(response.status).toBe(400);
    });

    it('should reject payment on a cancelled order', async () => {
      // 1. Create order
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          orderType: 'TAKEAWAY',
          items: [{ menuItemId: testMenuItemId, quantity: 1 }],
        });

      const orderId = orderRes.body.data.order.id;

      // 2. Cancel order
      await request(app)
        .post(`/api/v1/orders/${orderId}/cancel`)
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({ reason: 'Customer changed mind' });

      // 3. Attempt payment
      const response = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          orderId,
          paymentMethod: 'CASH',
          amount: 25.0,
        });

      expect(response.status).toBe(400);
    });
  });

  // ===========================================================================
  // 5. Full and Partial Refunds with Manager Authorization
  // ===========================================================================
  describe('5. Full and Partial Refunds with Manager Authorization', () => {
    let refundTargetPaymentId: string;
    let refundPayableAmount: number;

    beforeAll(async () => {
      // Create a fresh order and pay in CASH
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          orderType: 'TAKEAWAY',
          items: [{ menuItemId: testMenuItemId, quantity: 1 }],
        });

      refundPayableAmount = orderRes.body.data.order.grandTotal;

      const payRes = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          orderId: orderRes.body.data.order.id,
          paymentMethod: 'CASH',
          amount: refundPayableAmount,
        });

      refundTargetPaymentId = payRes.body.data.payment.id;
    });

    it('should reject refund when cashier lacks permission and no manager PIN is provided', async () => {
      const response = await request(app)
        .post(`/api/v1/payments/${refundTargetPaymentId}/refund`)
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          amount: 10.0,
          reason: 'Customer complaint about delayed order',
        });

      expect(response.status).toBe(403);
    });

    it('should allow Cashier to refund payment when providing valid Manager PIN', async () => {
      const response = await request(app)
        .post(`/api/v1/payments/${refundTargetPaymentId}/refund`)
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          amount: 10.0,
          reason: 'Customer complaint about delayed order',
          managerPin: '5566',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.refund.amount).toBe(10.0);
      expect(response.body.data.payment.refundedAmount).toBe(10.0);
      expect(response.body.data.payment.status).toBe('PARTIALLY_REFUNDED');
      expect(response.body.data.order.paymentStatus).toBe('PARTIALLY_REFUNDED');

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: response.body.data.refund.id,
          action: 'PAYMENT_REFUNDED',
        },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should allow Manager with direct permission to execute full refund of remaining balance', async () => {
      const remaining = Number((refundPayableAmount - 10.0).toFixed(2));
      const response = await request(app)
        .post(`/api/v1/payments/${refundTargetPaymentId}/refund`)
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          amount: remaining,
          reason: 'Full customer satisfaction refund',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.payment.refundedAmount).toBe(refundPayableAmount);
      expect(response.body.data.payment.status).toBe('REFUNDED');
      expect(response.body.data.order.paidAmount).toBe(0);
      expect(response.body.data.order.paymentStatus).toBe('REFUNDED');
    });

    it('should reject refund when amount exceeds refundable balance', async () => {
      const response = await request(app)
        .post(`/api/v1/payments/${refundTargetPaymentId}/refund`)
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          amount: 5.0,
          reason: 'Excess refund attempt on fully refunded payment',
        });

      expect(response.status).toBe(400);
    });
  });

  // ===========================================================================
  // 6. Shift Settlement & Closing Calculations
  // ===========================================================================
  describe('6. Shift Settlement & Closing Calculations', () => {
    it('should close shift and calculate ledger expected cash and variance against counted cash', async () => {
      // 1. Fetch current drawer cash balance dynamically from ledger
      const currentShiftRes = await request(app)
        .get('/api/v1/shifts/current')
        .set('Authorization', `Bearer ${cashierAccessToken}`);

      expect(currentShiftRes.status).toBe(200);
      const expectedCash = currentShiftRes.body.data.shift.currentDrawerCash;

      // 2. Cashier closes shift with exact counted cash
      const response = await request(app)
        .post('/api/v1/shifts/current/close')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          actualClosingCash: expectedCash,
          closingNotes: 'Shift reconciled with zero variance',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.shift.status).toBe('CLOSED');
      expect(response.body.data.shift.expectedClosingCash).toBe(expectedCash);
      expect(response.body.data.shift.actualClosingCash).toBe(expectedCash);
      expect(response.body.data.shift.variance).toBe(0.0);

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: activeShiftId,
          action: 'SHIFT_CLOSED',
        },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should generate comprehensive shift summary report', async () => {
      const response = await request(app)
        .get(`/api/v1/shifts/${activeShiftId}/summary`)
        .set('Authorization', `Bearer ${managerAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.summary.shiftId).toBe(activeShiftId);
      expect(response.body.data.summary.cashDrawer.expectedClosingCash).toBeGreaterThan(0);
      expect(response.body.data.summary.cashDrawer.variance).toBe(0.0);
      expect(response.body.data.summary.totals).toHaveProperty('totalSales');
      expect(response.body.data.summary.totals).toHaveProperty('netSales');
    });

    it('should list and filter shifts with pagination', async () => {
      const response = await request(app)
        .get('/api/v1/shifts')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .query({
          status: 'CLOSED',
          page: 1,
          limit: 10,
        });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data.shifts)).toBe(true);
      expect(response.body.data.pagination.total).toBeGreaterThanOrEqual(1);
    });
  });

  // ===========================================================================
  // 7. Multi-Tenant Isolation & Audit Trail
  // ===========================================================================
  describe('7. Multi-Tenant Isolation & Audit Trail', () => {
    it('should isolate payments and shifts across restaurants', async () => {
      // 1. Accessing payment of Restaurant A with Restaurant B token -> 404
      const crossPayment = await request(app)
        .get(`/api/v1/payments/${testPaymentId}`)
        .set('Authorization', `Bearer ${otherOwnerAccessToken}`);
      expect(crossPayment.status).toBe(404);

      // 2. Accessing shift of Restaurant A with Restaurant B token -> 404
      const crossShift = await request(app)
        .get(`/api/v1/shifts/${activeShiftId}`)
        .set('Authorization', `Bearer ${otherOwnerAccessToken}`);
      expect(crossShift.status).toBe(404);

      // 3. Listing payments for Restaurant B returns 0 payments
      const crossList = await request(app)
        .get('/api/v1/payments')
        .set('Authorization', `Bearer ${otherOwnerAccessToken}`);
      expect(crossList.status).toBe(200);
      expect(crossList.body.data.payments.length).toBe(0);
    });
  });
});
