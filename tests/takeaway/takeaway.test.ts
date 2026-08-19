import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

describe('Faraz POS - Takeaway Management Module Tests', () => {
  let restaurantId: string;
  let _ownerAccessToken: string;
  let managerAccessToken: string;
  let cashierAccessToken: string;

  // Secondary restaurant for tenant isolation testing
  let otherRestaurantId: string;
  let otherOwnerAccessToken: string;

  let testCategoryId: string;
  let testMenuItemId: string;
  let testVariantId: string;
  let testModifierGroupId: string;
  let testModifierId1: string;
  let testModifierId2: string;

  let createdOrder1Id: string;
  let createdOrder2Id: string;

  beforeAll(async () => {
    // 1. Fetch primary seeded restaurant
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: 'faraz-flagship' },
    });
    if (!restaurant) {
      throw new Error('Database not seeded!');
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
    const pinHashManager = await bcrypt.hash('8877', 10);
    const pinHashCashier = await bcrypt.hash('8866', 10);

    // Create Suite-Isolated Manager
    await prisma.user.upsert({
      where: {
        restaurantId_username: { restaurantId, username: 'tk_test_manager' },
      },
      update: { isActive: true, pinHash: pinHashManager },
      create: {
        restaurantId,
        name: 'Takeaway Test Manager',
        username: 'tk_test_manager',
        pinHash: pinHashManager,
        userRoles: { create: { roleId: managerRole!.id } },
      },
    });

    // Create Suite-Isolated Cashier
    await prisma.user.upsert({
      where: {
        restaurantId_username: { restaurantId, username: 'tk_test_cashier' },
      },
      update: { isActive: true, pinHash: pinHashCashier },
      create: {
        restaurantId,
        name: 'Takeaway Test Cashier',
        username: 'tk_test_cashier',
        pinHash: pinHashCashier,
        userRoles: { create: { roleId: cashierRole!.id } },
      },
    });

    // Login suite users
    const managerLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'tk_test_manager',
      pin: '8877',
    });
    managerAccessToken = managerLogin.body.data.accessToken;

    const cashierLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'tk_test_cashier',
      pin: '8866',
    });
    cashierAccessToken = cashierLogin.body.data.accessToken;

    _ownerAccessToken = managerAccessToken;

    // 5. Create Secondary Restaurant for Tenant Isolation Tests
    const otherRest = await prisma.restaurant.upsert({
      where: { slug: 'takeaway-iso-bistro' },
      update: {},
      create: {
        name: 'Takeaway Isolation Bistro',
        slug: 'takeaway-iso-bistro',
        currency: 'USD',
      },
    });
    otherRestaurantId = otherRest.id;

    const pinHashOther = await (await import('bcrypt')).hash('1234', 10);
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
        description: 'Owner of takeaway other restaurant',
      },
    });

    await prisma.user.upsert({
      where: {
        restaurantId_username: {
          restaurantId: otherRestaurantId,
          username: 'takeaway_other_owner',
        },
      },
      update: {},
      create: {
        restaurantId: otherRestaurantId,
        name: 'Takeaway Other Owner',
        username: 'takeaway_other_owner',
        pinHash: pinHashOther,
        userRoles: {
          create: { roleId: otherOwnerRole.id },
        },
      },
    });

    const otherLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'takeaway_other_owner',
      pin: '1234',
    });
    otherOwnerAccessToken = otherLogin.body.data.accessToken;

    // 6. Clean up any leftover takeaway records
    await prisma.takeawayOrderItem.deleteMany({
      where: { takeawayOrder: { restaurantId: { in: [restaurantId, otherRestaurantId] } } },
    });
    await prisma.takeawayOrder.deleteMany({
      where: { restaurantId: { in: [restaurantId, otherRestaurantId] } },
    });
    await prisma.takeawayDailySequence.deleteMany({
      where: { restaurantId: { in: [restaurantId, otherRestaurantId] } },
    });

    // 7. Seed Test Menu Items, Variants, and Modifiers
    const cat = await prisma.category.create({
      data: {
        restaurantId,
        name: 'Takeaway Test Fast Food',
        sortOrder: 1,
      },
    });
    testCategoryId = cat.id;

    const item = await prisma.menuItem.create({
      data: {
        restaurantId,
        categoryId: testCategoryId,
        itemCode: 'TK-BURGER-01',
        name: 'Gourmet Crunch Burger',
        basePrice: 12.0,
        sortOrder: 1,
      },
    });
    testMenuItemId = item.id;

    const variant = await prisma.menuItemVariant.create({
      data: {
        menuItemId: testMenuItemId,
        name: 'Double Patty Combo',
        price: 16.0,
      },
    });
    testVariantId = variant.id;

    const modGroup = await prisma.modifierGroup.create({
      data: {
        restaurantId,
        name: 'Burger Add-ons',
        selectionType: 'MULTIPLE',
      },
    });
    testModifierGroupId = modGroup.id;

    const mod1 = await prisma.modifier.create({
      data: {
        modifierGroupId: testModifierGroupId,
        name: 'Extra Cheddar Cheese',
        priceAdjustment: 1.5,
      },
    });
    testModifierId1 = mod1.id;

    const mod2 = await prisma.modifier.create({
      data: {
        modifierGroupId: testModifierGroupId,
        name: 'Caramelized Onions',
        priceAdjustment: 1.0,
      },
    });
    testModifierId2 = mod2.id;
  });

  afterAll(async () => {
    // Cleanup created records
    await prisma.takeawayOrderItem.deleteMany({
      where: { takeawayOrder: { restaurantId: { in: [restaurantId, otherRestaurantId] } } },
    });
    await prisma.takeawayOrder.deleteMany({
      where: { restaurantId: { in: [restaurantId, otherRestaurantId] } },
    });
    await prisma.takeawayDailySequence.deleteMany({
      where: { restaurantId: { in: [restaurantId, otherRestaurantId] } },
    });

    if (testModifierId1 || testModifierId2) {
      await prisma.modifier.deleteMany({
        where: { id: { in: [testModifierId1, testModifierId2].filter(Boolean) } },
      });
    }
    if (testModifierGroupId) {
      await prisma.modifierGroup.deleteMany({ where: { id: testModifierGroupId } });
    }
    if (testVariantId) {
      await prisma.menuItemVariant.deleteMany({ where: { id: testVariantId } });
    }
    if (testMenuItemId) {
      await prisma.menuItem.deleteMany({ where: { id: testMenuItemId } });
    }
    if (testCategoryId) {
      await prisma.category.deleteMany({ where: { id: testCategoryId } });
    }

    await prisma.user.deleteMany({
      where: {
        username: { in: ['takeaway_other_owner', 'tk_test_manager', 'tk_test_cashier'] },
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
  // 1. Takeaway Order Creation & Express Counter Flow
  // ===========================================================================
  describe('1. Takeaway Order Creation & Express Counter Flow', () => {
    it('should create a standard takeaway order paid immediately in cash', async () => {
      const response = await request(app)
        .post('/api/v1/takeaway/orders')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          customerName: 'Farhan Ali',
          customerPhone: '0300-1234567',
          isPayOnPickup: false,
          paymentMethod: 'CASH',
          specialInstructions: 'Pack in paper bag',
          items: [
            {
              menuItemId: testMenuItemId,
              quantity: 2,
              specialInstructions: 'No pickles',
            },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.order).toMatchObject({
        tokenNumber: 1,
        customerName: 'Farhan Ali',
        customerPhone: '0300-1234567',
        status: 'PENDING',
        paymentStatus: 'PAID',
        paymentMethod: 'CASH',
        isPayOnPickup: false,
        restaurantId,
      });

      expect(response.body.data.order.orderCode).toMatch(/^TK-\d{8}-001$/);
      expect(response.body.data.order.subtotal).toBe(24.0); // 2 * 12.0
      expect(response.body.data.order.items.length).toBe(1);
      expect(response.body.data.order.items[0].name).toBe('Gourmet Crunch Burger');
      expect(response.body.data.order.items[0].unitPrice).toBe(12.0);
      expect(response.body.data.order.items[0].subtotal).toBe(24.0);

      createdOrder1Id = response.body.data.order.id;

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: createdOrder1Id,
          action: 'TAKEAWAY_ORDER_CREATED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should create a takeaway order with variants, modifiers, and calculate exact subtotal', async () => {
      const response = await request(app)
        .post('/api/v1/takeaway/orders')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          customerName: 'Zubair Khan',
          items: [
            {
              menuItemId: testMenuItemId,
              variantId: testVariantId, // Double Patty Combo = 16.0
              quantity: 1,
              modifierIds: [testModifierId1, testModifierId2], // +1.5 + 1.0 = 2.5
            },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.data.order.tokenNumber).toBe(2);
      expect(response.body.data.order.orderCode).toMatch(/^TK-\d{8}-002$/);
      // Unit = 16.0 + 2.5 = 18.5, Quantity = 1 => 18.5
      expect(response.body.data.order.subtotal).toBe(18.5);
      expect(response.body.data.order.items[0].variantName).toBe('Double Patty Combo');
      expect(response.body.data.order.items[0].modifiers.length).toBe(2);

      createdOrder2Id = response.body.data.order.id;
    });

    it('should preserve historical order prices when menu item price is updated in catalog', async () => {
      // 1. Update menu item base price from 12.0 to 25.0
      await prisma.menuItem.update({
        where: { id: testMenuItemId },
        data: { basePrice: 25.0 },
      });

      // 2. Fetch order 1 created when price was 12.0
      const response = await request(app)
        .get(`/api/v1/takeaway/orders/${createdOrder1Id}`)
        .set('Authorization', `Bearer ${cashierAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.order.subtotal).toBe(24.0);
      expect(response.body.data.order.items[0].unitPrice).toBe(12.0);

      // Restore base price
      await prisma.menuItem.update({
        where: { id: testMenuItemId },
        data: { basePrice: 12.0 },
      });
    });
  });

  // ===========================================================================
  // 2. Concurrency Safety & Daily Token Numbering
  // ===========================================================================
  describe('2. Concurrent Daily Token Numbering Safety', () => {
    it('should generate distinct, sequential token numbers under simultaneous concurrent orders', async () => {
      const concurrentCount = 5;

      const promises = Array.from({ length: concurrentCount }).map((_, idx) =>
        request(app)
          .post('/api/v1/takeaway/orders')
          .set('Authorization', `Bearer ${cashierAccessToken}`)
          .send({
            customerName: `Concurrent Customer ${idx + 1}`,
            items: [
              {
                menuItemId: testMenuItemId,
                quantity: 1,
              },
            ],
          }),
      );

      const results = await Promise.all(promises);

      for (const res of results) {
        expect(res.status).toBe(201);
      }

      const tokenNumbers = results.map((r) => r.body.data.order.tokenNumber);
      const uniqueTokens = new Set(tokenNumbers);

      // Ensure no duplicate token numbers exist
      expect(uniqueTokens.size).toBe(concurrentCount);

      // Tokens should be sequential from 3 to 7 (since tokens 1 and 2 were created in prior tests)
      const sortedTokens = [...tokenNumbers].sort((a, b) => a - b);
      expect(sortedTokens[0]).toBe(3);
      expect(sortedTokens[sortedTokens.length - 1]).toBe(7);
    });
  });

  // ===========================================================================
  // 3. Privileged Pay on Pickup Flow
  // ===========================================================================
  describe('3. Privileged Pay on Pickup Authorization', () => {
    it('should reject Pay on Pickup order from Cashier lacking orders.pay_on_pickup permission with 403', async () => {
      const response = await request(app)
        .post('/api/v1/takeaway/orders')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          customerName: 'Unauthorized Pay-on-Pickup',
          isPayOnPickup: true,
          items: [{ menuItemId: testMenuItemId, quantity: 1 }],
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('should allow Pay on Pickup order from Manager holding orders.pay_on_pickup permission', async () => {
      const response = await request(app)
        .post('/api/v1/takeaway/orders')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          customerName: 'VIP Phone Customer',
          customerPhone: '0311-9988776',
          isPayOnPickup: true,
          items: [{ menuItemId: testMenuItemId, quantity: 1 }],
        });

      expect(response.status).toBe(201);
      expect(response.body.data.order.isPayOnPickup).toBe(true);
      expect(response.body.data.order.paymentStatus).toBe('PENDING');

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: response.body.data.order.id,
          action: 'TAKEAWAY_PAY_ON_PICKUP_USED',
        },
      });
      expect(auditLog).not.toBeNull();
    });
  });

  // ===========================================================================
  // 4. Active Takeaway Queue & Lifecycle Status Transitions
  // ===========================================================================
  describe('4. Active Takeaway Queue & Status Transitions', () => {
    it('should return the active takeaway queue with summaries', async () => {
      const response = await request(app)
        .get('/api/v1/takeaway/queue')
        .set('Authorization', `Bearer ${cashierAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data.summary.totalActive).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(response.body.data.queue)).toBe(true);

      const foundOrder = response.body.data.queue.find(
        (o: { id: string }) => o.id === createdOrder1Id,
      );
      expect(foundOrder).toBeDefined();
      expect(foundOrder.tokenNumber).toBe(1);
      expect(foundOrder.status).toBe('PENDING');
    });

    it('should transition order status from PENDING -> PREPARING -> READY -> COMPLETED', async () => {
      // 1. PENDING -> PREPARING
      const res1 = await request(app)
        .patch(`/api/v1/takeaway/orders/${createdOrder1Id}/status`)
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({ status: 'PREPARING' });
      expect(res1.status).toBe(200);
      expect(res1.body.data.order.status).toBe('PREPARING');

      // 2. PREPARING -> READY
      const res2 = await request(app)
        .patch(`/api/v1/takeaway/orders/${createdOrder1Id}/status`)
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({ status: 'READY' });
      expect(res2.status).toBe(200);
      expect(res2.body.data.order.status).toBe('READY');

      // 3. READY -> COMPLETED
      const res3 = await request(app)
        .patch(`/api/v1/takeaway/orders/${createdOrder1Id}/status`)
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({ status: 'COMPLETED' });
      expect(res3.status).toBe(200);
      expect(res3.body.data.order.status).toBe('COMPLETED');
      expect(res3.body.data.order.completedAt).not.toBeNull();

      // 4. COMPLETED order should no longer appear in active queue
      const queueRes = await request(app)
        .get('/api/v1/takeaway/queue')
        .set('Authorization', `Bearer ${cashierAccessToken}`);
      const inQueue = queueRes.body.data.queue.some(
        (o: { id: string }) => o.id === createdOrder1Id,
      );
      expect(inQueue).toBe(false);

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: createdOrder1Id,
          action: 'TAKEAWAY_ORDER_STATUS_CHANGED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should reject status updates on an already completed order with 400 Bad Request', async () => {
      const response = await request(app)
        .patch(`/api/v1/takeaway/orders/${createdOrder1Id}/status`)
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({ status: 'READY' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('already completed');
    });

    it('should cancel an active order with reason and orders.cancel permission', async () => {
      const response = await request(app)
        .post(`/api/v1/takeaway/orders/${createdOrder2Id}/cancel`)
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({ reason: 'Customer changed their mind before kitchen started' });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('CANCELLED');
      expect(response.body.data.cancelReason).toBe(
        'Customer changed their mind before kitchen started',
      );

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: createdOrder2Id,
          action: 'TAKEAWAY_ORDER_CANCELLED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog).not.toBeNull();
    });
  });

  // ===========================================================================
  // 5. Multi-Tenant Isolation
  // ===========================================================================
  describe('5. Multi-Tenant Isolation', () => {
    it('should strictly isolate takeaway orders between different restaurants', async () => {
      // 1. Primary restaurant user attempting to fetch other restaurant order should receive 404
      const crossFetch = await request(app)
        .get(`/api/v1/takeaway/orders/${createdOrder1Id}`)
        .set('Authorization', `Bearer ${otherOwnerAccessToken}`);
      expect(crossFetch.status).toBe(404);

      // 2. Other restaurant user attempting to update status should receive 404
      const crossUpdate = await request(app)
        .patch(`/api/v1/takeaway/orders/${createdOrder1Id}/status`)
        .set('Authorization', `Bearer ${otherOwnerAccessToken}`)
        .send({ status: 'PREPARING' });
      expect(crossUpdate.status).toBe(404);
    });
  });
});
