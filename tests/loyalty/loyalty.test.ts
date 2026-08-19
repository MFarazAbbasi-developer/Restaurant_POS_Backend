import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

describe('Faraz POS - Loyalty & Customer Rewards Module Tests', () => {
  let restaurantAId: string;
  let restaurantBId: string;

  let ownerAToken: string;
  let managerAToken: string;
  let cashierAToken: string;
  let tenantBToken: string;

  let categoryBurgersId: string;
  let itemBurgerId: string;
  let customerAId: string;
  let customerPhone: string;

  beforeAll(async () => {
    // 1. Create Dedicated Suite-Isolated Restaurant A
    const restaurantA = await prisma.restaurant.create({
      data: {
        name: 'Faraz Loyalty Flagship',
        slug: 'faraz-loyalty-suite-' + Date.now(),
        currency: 'USD',
        taxRate: 0,
        taxInclusive: false,
        serviceChargeRate: 0,
        serviceChargeEnabled: false,
      },
    });
    restaurantAId = restaurantA.id;

    // 2. Create Restaurant B for isolation tests
    const restaurantB = await prisma.restaurant.create({
      data: {
        name: 'Faraz Branch Loyalty Test',
        slug: 'faraz-loyalty-branch-' + Date.now(),
        currency: 'USD',
      },
    });
    restaurantBId = restaurantB.id;

    const defaultPinHash = await bcrypt.hash('1234', 10);
    const cashierPinHash = await bcrypt.hash('4321', 10);

    const allPerms = await prisma.permission.findMany();

    // Create OWNER Role
    const ownerRole = await prisma.role.create({
      data: {
        restaurantId: restaurantAId,
        name: 'OWNER_' + Date.now(),
        rolePermissions: {
          create: allPerms.map((p) => ({ permissionId: p.id })),
        },
      },
    });

    // Create MANAGER Role (has loyalty.*, orders.*, payments.*)
    const managerRole = await prisma.role.create({
      data: {
        restaurantId: restaurantAId,
        name: 'MANAGER_' + Date.now(),
        rolePermissions: {
          create: allPerms
            .filter((p) =>
              [
                'orders.view',
                'orders.create',
                'orders.update',
                'orders.cancel',
                'orders.void',
                'payments.view',
                'payments.create',
                'payments.refund',
                'loyalty.view',
                'loyalty.manage',
                'loyalty.adjust',
                'loyalty.redeem',
              ].includes(p.key),
            )
            .map((p) => ({ permissionId: p.id })),
        },
      },
    });

    // Create CASHIER Role (has loyalty.view, loyalty.redeem, orders.view/create/cancel, payments.view/create)
    const cashierRole = await prisma.role.create({
      data: {
        restaurantId: restaurantAId,
        name: 'CASHIER_' + Date.now(),
        rolePermissions: {
          create: allPerms
            .filter((p) =>
              [
                'orders.view',
                'orders.create',
                'orders.update',
                'orders.cancel',
                'payments.view',
                'payments.create',
                'loyalty.view',
                'loyalty.redeem',
              ].includes(p.key),
            )
            .map((p) => ({ permissionId: p.id })),
        },
      },
    });

    // Create Users for Restaurant A
    const ownerUser = await prisma.user.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Loyalty Owner',
        username: 'owner_loyalty_' + Date.now(),
        pinHash: defaultPinHash,
        userRoles: { create: [{ roleId: ownerRole.id }] },
      },
    });

    const managerUser = await prisma.user.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Loyalty Manager',
        username: 'manager_loyalty_' + Date.now(),
        pinHash: defaultPinHash,
        userRoles: { create: [{ roleId: managerRole.id }] },
      },
    });

    const cashierUser = await prisma.user.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Loyalty Cashier',
        username: 'cashier_loyalty_' + Date.now(),
        pinHash: cashierPinHash,
        userRoles: { create: [{ roleId: cashierRole.id }] },
      },
    });

    // Create OWNER Role for Tenant B
    const ownerBRole = await prisma.role.create({
      data: {
        restaurantId: restaurantBId,
        name: 'OWNER_B_' + Date.now(),
        rolePermissions: {
          create: allPerms.map((p) => ({ permissionId: p.id })),
        },
      },
    });

    // Tenant B User
    const ownerBUser = await prisma.user.create({
      data: {
        restaurantId: restaurantBId,
        name: 'Tenant B Owner',
        username: 'tenant_b_loyalty_' + Date.now(),
        pinHash: defaultPinHash,
        userRoles: { create: [{ roleId: ownerBRole.id }] },
      },
    });

    // Obtain JWT Tokens
    const ownerLogin = await request(app).post('/api/v1/auth/login').send({
      username: ownerUser.username,
      pin: '1234',
    });
    ownerAToken = `Bearer ${ownerLogin.body.data.accessToken}`;

    const managerLogin = await request(app).post('/api/v1/auth/login').send({
      username: managerUser.username,
      pin: '1234',
    });
    managerAToken = `Bearer ${managerLogin.body.data.accessToken}`;

    const cashierLogin = await request(app).post('/api/v1/auth/login').send({
      username: cashierUser.username,
      pin: '4321',
    });
    cashierAToken = `Bearer ${cashierLogin.body.data.accessToken}`;

    const tenantBLogin = await request(app).post('/api/v1/auth/login').send({
      username: ownerBUser.username,
      pin: '1234',
    });
    tenantBToken = `Bearer ${tenantBLogin.body.data.accessToken}`;

    // Create Menu Items for Restaurant A
    const catBurgers = await prisma.category.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Gourmet Burgers',
        isActive: true,
      },
    });
    categoryBurgersId = catBurgers.id;

    const burger = await prisma.menuItem.create({
      data: {
        restaurantId: restaurantAId,
        categoryId: categoryBurgersId,
        itemCode: 'BURGER-01',
        name: 'Smoked Cheeseburger',
        basePrice: 50.0,
        isActive: true,
      },
    });
    itemBurgerId = burger.id;

    // Create Customer
    customerPhone = `+1555${Math.floor(1000000 + Math.random() * 9000000)}`;
    const customer = await prisma.customer.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Alice Rewards Member',
        phone: customerPhone,
      },
    });
    customerAId = customer.id;
  });

  // ---------------------------------------------------------------------------
  // 1. Program Configuration
  // ---------------------------------------------------------------------------
  describe('Loyalty Program Configuration', () => {
    it('should retrieve default program config for restaurant (GET /api/v1/loyalty/program)', async () => {
      const res = await request(app)
        .get('/api/v1/loyalty/program')
        .set('Authorization', ownerAToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.program).toBeDefined();
      expect(res.body.data.program.isEnabled).toBe(true);
      expect(res.body.data.program.pointsPerCurrencyUnit).toBe(1.0);
      expect(res.body.data.program.redemptionRate).toBe(0.01);
    });

    it('should allow manager to update loyalty program configuration (PUT /api/v1/loyalty/program)', async () => {
      const res = await request(app)
        .put('/api/v1/loyalty/program')
        .set('Authorization', managerAToken)
        .send({
          programName: 'Faraz Elite Rewards Club',
          pointsPerCurrencyUnit: 2.0,
          redemptionRate: 0.02, // 50 points = $1.00
          minPointsToRedeem: 25,
          maxDiscountPercentage: 80,
          minOrderSubtotal: 10.0,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.program.programName).toBe('Faraz Elite Rewards Club');
      expect(res.body.data.program.pointsPerCurrencyUnit).toBe(2.0);
      expect(res.body.data.program.redemptionRate).toBe(0.02);
      expect(res.body.data.program.minPointsToRedeem).toBe(25);
    });

    it('should deny cashier from updating loyalty program config (403)', async () => {
      const res = await request(app)
        .put('/api/v1/loyalty/program')
        .set('Authorization', cashierAToken)
        .send({ isEnabled: false });

      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Loyalty Tiers Management
  // ---------------------------------------------------------------------------
  describe('Loyalty Tiers Management', () => {
    let createdTierId: string;

    it('should create new loyalty tier (POST /api/v1/loyalty/tiers)', async () => {
      const res = await request(app)
        .post('/api/v1/loyalty/tiers')
        .set('Authorization', managerAToken)
        .send({
          name: 'Gold Member',
          minPoints: 500,
          multiplier: 1.5,
          discountPercentage: 5.0,
          color: '#FFD700',
          sortOrder: 2,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tier.name).toBe('Gold Member');
      expect(res.body.data.tier.multiplier).toBe(1.5);
      createdTierId = res.body.data.tier.id;
    });

    it('should reject creating duplicate tier name (POST /api/v1/loyalty/tiers)', async () => {
      const res = await request(app)
        .post('/api/v1/loyalty/tiers')
        .set('Authorization', managerAToken)
        .send({
          name: 'Gold Member',
          minPoints: 1000,
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('should list all loyalty tiers (GET /api/v1/loyalty/tiers)', async () => {
      const res = await request(app)
        .get('/api/v1/loyalty/tiers')
        .set('Authorization', cashierAToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.tiers)).toBe(true);
      expect(res.body.data.tiers.some((t: { id: string }) => t.id === createdTierId)).toBe(true);
    });

    it('should update existing loyalty tier (PUT /api/v1/loyalty/tiers/:id)', async () => {
      const res = await request(app)
        .put(`/api/v1/loyalty/tiers/${createdTierId}`)
        .set('Authorization', managerAToken)
        .send({
          multiplier: 1.75,
          color: '#DAA520',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.tier.multiplier).toBe(1.75);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Customer Enrollment & Account Operations
  // ---------------------------------------------------------------------------
  describe('Customer Enrollment & Account Profiles', () => {
    it('should enroll customer with initial bonus points (POST /api/v1/loyalty/enroll)', async () => {
      const res = await request(app)
        .post('/api/v1/loyalty/enroll')
        .set('Authorization', managerAToken)
        .send({
          customerId: customerAId,
          initialPoints: 100,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.account.pointsBalance).toBe(100);
      expect(res.body.data.account.lifetimePoints).toBe(100);
    });

    it('should retrieve customer loyalty profile with cash value (GET /api/v1/loyalty/customers/:customerId)', async () => {
      const res = await request(app)
        .get(`/api/v1/loyalty/customers/${customerAId}`)
        .set('Authorization', cashierAToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.account.pointsBalance).toBe(100);
      // At redemptionRate 0.02, 100 points = $2.00
      expect(res.body.data.account.cashValue).toBe(2.0);
    });

    it('should list customer loyalty accounts with pagination (GET /api/v1/loyalty/accounts)', async () => {
      const res = await request(app)
        .get('/api/v1/loyalty/accounts?page=1&limit=10')
        .set('Authorization', managerAToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Pre-Checkout Redemption Preview
  // ---------------------------------------------------------------------------
  describe('Pre-Checkout Redemption Preview', () => {
    it('should calculate valid redemption preview (POST /api/v1/loyalty/preview-redemption)', async () => {
      const res = await request(app)
        .post('/api/v1/loyalty/preview-redemption')
        .set('Authorization', cashierAToken)
        .send({
          customerId: customerAId,
          subtotal: 50.0,
          pointsToRedeem: 50,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isEligible).toBe(true);
      expect(res.body.data.availablePoints).toBe(100);
      expect(res.body.data.pointsToRedeem).toBe(50);
      // 50 points * 0.02 rate = $1.00 discount
      expect(res.body.data.discountAmount).toBe(1.0);
      expect(res.body.data.discountedSubtotal).toBe(49.0);
      expect(res.body.data.remainingPoints).toBe(50);
    });

    it('should reject preview if requested points exceed available balance', async () => {
      const res = await request(app)
        .post('/api/v1/loyalty/preview-redemption')
        .set('Authorization', cashierAToken)
        .send({
          customerId: customerAId,
          subtotal: 50.0,
          pointsToRedeem: 250, // Available is only 100
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Checkout with Loyalty Redemption
  // ---------------------------------------------------------------------------
  describe('Checkout with Loyalty Redemption', () => {
    it('should create order redeeming 50 points and deduct customer balance (POST /api/v1/orders)', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', cashierAToken)
        .send({
          orderType: 'TAKEAWAY',
          customerId: customerAId,
          pointsToRedeem: 50,
          items: [{ menuItemId: itemBurgerId, quantity: 1 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const order = res.body.data.order;
      expect(order.loyaltyPointsRedeemed).toBe(50);
      expect(order.loyaltyDiscount).toBe(1.0);
      // Subtotal is 50.0, minus 1.0 loyalty discount = 49.0
      expect(order.totalDiscount).toBe(1.0);
      expect(order.grandTotal).toBe(49.0);

      // Verify customer points balance dropped from 100 to 50
      const customerAccRes = await request(app)
        .get(`/api/v1/loyalty/customers/${customerAId}`)
        .set('Authorization', cashierAToken);
      expect(customerAccRes.body.data.account.pointsBalance).toBe(50);
      expect(customerAccRes.body.data.account.totalRedeemedPoints).toBe(50);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Payment Completion & Points Earning
  // ---------------------------------------------------------------------------
  describe('Payment Completion & Points Earning', () => {
    it('should award loyalty points upon full payment settlement (POST /api/v1/payments)', async () => {
      // 1. Create a fresh order for $50
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', cashierAToken)
        .send({
          orderType: 'TAKEAWAY',
          customerId: customerAId,
          items: [{ menuItemId: itemBurgerId, quantity: 1 }],
        });

      const orderId = orderRes.body.data.order.id;
      const grandTotal = orderRes.body.data.order.grandTotal;

      // 2. Settle payment
      const payRes = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', cashierAToken)
        .send({
          orderId,
          amount: grandTotal,
          paymentMethod: 'CASH',
          tenderedAmount: grandTotal,
        });

      expect(payRes.status).toBe(201);
      expect(payRes.body.data.payment).toBeDefined();

      // 3. Verify customer earned points: $50 spend * 2.0 rate = 100 points
      const customerAccRes = await request(app)
        .get(`/api/v1/loyalty/customers/${customerAId}`)
        .set('Authorization', cashierAToken);

      // Previous balance 50 + 100 earned = 150 points
      expect(customerAccRes.body.data.account.pointsBalance).toBe(150);
      expect(customerAccRes.body.data.account.lifetimePoints).toBe(200);
    });

    it('should prevent duplicate point awards when payment is checked again', async () => {
      const customerAccRes = await request(app)
        .get(`/api/v1/loyalty/customers/${customerAId}`)
        .set('Authorization', cashierAToken);

      expect(customerAccRes.body.data.account.pointsBalance).toBe(150);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Order Cancellation / Voiding with Automatic Points Reversal
  // ---------------------------------------------------------------------------
  describe('Order Cancellation & Voiding Points Reversal', () => {
    it('should restore redeemed points when an order is cancelled before completion (POST /api/v1/orders/:id/cancel)', async () => {
      // 1. Create order with 50 points redeemed
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', cashierAToken)
        .send({
          orderType: 'TAKEAWAY',
          customerId: customerAId,
          pointsToRedeem: 50,
          items: [{ menuItemId: itemBurgerId, quantity: 1 }],
        });

      const orderId = orderRes.body.data.order.id;

      // Balance was 150, now 100
      let accRes = await request(app)
        .get(`/api/v1/loyalty/customers/${customerAId}`)
        .set('Authorization', cashierAToken);
      expect(accRes.body.data.account.pointsBalance).toBe(100);

      // 2. Cancel order
      const cancelRes = await request(app)
        .post(`/api/v1/orders/${orderId}/cancel`)
        .set('Authorization', cashierAToken)
        .send({ reason: 'Customer changed mind' });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.order.status).toBe('CANCELLED');

      // 3. Verify points were restored back to 150
      accRes = await request(app)
        .get(`/api/v1/loyalty/customers/${customerAId}`)
        .set('Authorization', cashierAToken);
      expect(accRes.body.data.account.pointsBalance).toBe(150);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Payment Refund with Points Reversal
  // ---------------------------------------------------------------------------
  describe('Payment Refund Points Reversal', () => {
    it('should reverse earned points when payment is refunded (POST /api/v1/payments/:id/refund)', async () => {
      // 1. Create and pay for an order
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', cashierAToken)
        .send({
          orderType: 'TAKEAWAY',
          customerId: customerAId,
          items: [{ menuItemId: itemBurgerId, quantity: 1 }],
        });

      const orderId = orderRes.body.data.order.id;
      const grandTotal = orderRes.body.data.order.grandTotal;

      const payRes = await request(app)
        .post('/api/v1/payments')
        .set('Authorization', cashierAToken)
        .send({
          orderId,
          amount: grandTotal,
          paymentMethod: 'CASH',
          tenderedAmount: grandTotal,
        });

      const paymentId = payRes.body.data.payment.id;

      // Balance was 150 + 100 = 250
      let accRes = await request(app)
        .get(`/api/v1/loyalty/customers/${customerAId}`)
        .set('Authorization', cashierAToken);
      expect(accRes.body.data.account.pointsBalance).toBe(250);

      // 2. Refund payment
      const refundRes = await request(app)
        .post(`/api/v1/payments/${paymentId}/refund`)
        .set('Authorization', managerAToken)
        .send({
          amount: grandTotal,
          reason: 'Food quality issue',
        });

      expect(refundRes.status).toBe(200);
      expect(refundRes.body.data.refund).toBeDefined();
      expect(refundRes.body.data.payment.status).toBe('REFUNDED');

      // 3. Verify 100 earned points were deducted back
      accRes = await request(app)
        .get(`/api/v1/loyalty/customers/${customerAId}`)
        .set('Authorization', cashierAToken);
      expect(accRes.body.data.account.pointsBalance).toBe(150);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Manual Point Adjustment
  // ---------------------------------------------------------------------------
  describe('Manual Manager-Authorized Point Adjustment', () => {
    it('should allow manager with direct permission to adjust points (POST /api/v1/loyalty/adjust)', async () => {
      const res = await request(app)
        .post('/api/v1/loyalty/adjust')
        .set('Authorization', managerAToken)
        .send({
          customerId: customerAId,
          points: 75,
          reason: 'VIP hospitality bonus',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.updatedAccount.pointsBalance).toBe(225);
    });

    it('should allow cashier with manager PIN to adjust points (POST /api/v1/loyalty/adjust)', async () => {
      const res = await request(app)
        .post('/api/v1/loyalty/adjust')
        .set('Authorization', cashierAToken)
        .send({
          customerId: customerAId,
          points: -25,
          reason: 'Manual points correction',
          managerPin: '1234', // manager PIN
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.updatedAccount.pointsBalance).toBe(200);
    });

    it('should reject cashier adjustment without manager PIN (POST /api/v1/loyalty/adjust)', async () => {
      const res = await request(app)
        .post('/api/v1/loyalty/adjust')
        .set('Authorization', cashierAToken)
        .send({
          customerId: customerAId,
          points: 50,
          reason: 'Unauthorized bonus',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Ledger History & Program Summary Analytics
  // ---------------------------------------------------------------------------
  describe('Ledger History & Program Summary', () => {
    it('should list all transactions in immutable ledger (GET /api/v1/loyalty/transactions)', async () => {
      const res = await request(app)
        .get(`/api/v1/loyalty/transactions?customerId=${customerAId}`)
        .set('Authorization', managerAToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(4);

      const types = res.body.data.items.map((t: { type: string }) => t.type);
      expect(types).toContain('EARN');
      expect(types).toContain('REDEEM');
      expect(types).toContain('MANUAL_ADJUSTMENT');
      expect(types).toContain('REFUND_REVERSAL');
    });

    it('should retrieve overall loyalty program summary metrics (GET /api/v1/loyalty/summary)', async () => {
      const res = await request(app)
        .get('/api/v1/loyalty/summary')
        .set('Authorization', managerAToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toBeDefined();
      expect(res.body.data.summary.membership.totalMembers).toBeGreaterThanOrEqual(1);
      expect(res.body.data.summary.points.totalIssued).toBeGreaterThanOrEqual(200);
      expect(res.body.data.summary.points.outstandingCashLiability).toBeGreaterThan(0);
    });

    it('should enforce tenant isolation preventing access to another tenant loyalty data', async () => {
      const res = await request(app)
        .get(`/api/v1/loyalty/customers/${customerAId}`)
        .set('Authorization', tenantBToken);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
