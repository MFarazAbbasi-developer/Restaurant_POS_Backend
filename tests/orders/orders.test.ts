import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

describe('FARMAX POS - Core Order & Billing Module Tests', () => {
  let restaurantId: string;
  let otherRestaurantId: string;

  let managerAccessToken: string;
  let cashierAccessToken: string;
  let otherOwnerAccessToken: string;

  let testCategoryId: string;
  let testMenuItemId: string;
  let testVariantId: string;
  let testModifierGroupId: string;
  let testModifierId: string;

  let testTableId: string;

  let createdOrder1Id: string;
  let createdOrder2Id: string;

  beforeAll(async () => {
    // 1. Fetch primary seeded restaurant
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: 'flagship-shinwari' },
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

    // Create Suite-Isolated Manager (has orders.void, orders.discount)
    await prisma.user.upsert({
      where: {
        restaurantId_username: { restaurantId, username: 'order_test_manager' },
      },
      update: { isActive: true, pinHash: pinHashManager },
      create: {
        restaurantId,
        name: 'Order Test Manager',
        username: 'order_test_manager',
        pinHash: pinHashManager,
        userRoles: { create: { roleId: managerRole!.id } },
      },
    });

    // Create Suite-Isolated Cashier (has orders.create, orders.discount, NO orders.void)
    await prisma.user.upsert({
      where: {
        restaurantId_username: { restaurantId, username: 'order_test_cashier' },
      },
      update: { isActive: true, pinHash: pinHashCashier },
      create: {
        restaurantId,
        name: 'Order Test Cashier',
        username: 'order_test_cashier',
        pinHash: pinHashCashier,
        userRoles: { create: { roleId: cashierRole!.id } },
      },
    });

    // Log in suite users
    const managerLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'order_test_manager',
      pin: '6677',
    });
    managerAccessToken = managerLogin.body.data.accessToken;

    const cashierLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'order_test_cashier',
      pin: '6688',
    });
    cashierAccessToken = cashierLogin.body.data.accessToken;

    // 3. Create Secondary Restaurant for Tenant Isolation Tests
    const otherRest = await prisma.restaurant.upsert({
      where: { slug: 'order-iso-bistro' },
      update: {},
      create: {
        name: 'Order Isolation Bistro',
        slug: 'order-iso-bistro',
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
          username: 'order_other_owner',
        },
      },
      update: {},
      create: {
        restaurantId: otherRestaurantId,
        name: 'Order Other Owner',
        username: 'order_other_owner',
        pinHash: pinHashOther,
        userRoles: {
          create: { roleId: otherOwnerRole.id },
        },
      },
    });

    const otherLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'order_other_owner',
      pin: '1234',
    });
    otherOwnerAccessToken = otherLogin.body.data.accessToken;

    // 4. Clean up any existing order test records
    await prisma.orderItemModifier.deleteMany({
      where: { orderItem: { order: { restaurantId: { in: [restaurantId, otherRestaurantId] } } } },
    });
    await prisma.orderItem.deleteMany({
      where: { order: { restaurantId: { in: [restaurantId, otherRestaurantId] } } },
    });
    await prisma.order.deleteMany({
      where: { restaurantId: { in: [restaurantId, otherRestaurantId] } },
    });
    await prisma.dailyOrderSequence.deleteMany({
      where: { restaurantId: { in: [restaurantId, otherRestaurantId] } },
    });

    // 5. Seed Test Catalog Items
    const category = await prisma.category.create({
      data: {
        restaurantId,
        name: 'Order Test Burgers',
        sortOrder: 1,
      },
    });
    testCategoryId = category.id;

    const menuItem = await prisma.menuItem.create({
      data: {
        restaurantId,
        categoryId: category.id,
        itemCode: 'BURGER-TEST-01',
        name: 'Classic Smash Burger',
        basePrice: 12.0,
        sortOrder: 1,
      },
    });
    testMenuItemId = menuItem.id;

    const variant = await prisma.menuItemVariant.create({
      data: {
        menuItemId: menuItem.id,
        name: 'Double Patty',
        price: 16.0,
        sortOrder: 1,
      },
    });
    testVariantId = variant.id;

    const modGroup = await prisma.modifierGroup.create({
      data: {
        restaurantId,
        name: 'Burger Addons',
        selectionType: 'MULTIPLE',
      },
    });
    testModifierGroupId = modGroup.id;

    const modifier = await prisma.modifier.create({
      data: {
        modifierGroupId: modGroup.id,
        name: 'Extra Cheddar Cheese',
        priceAdjustment: 2.5,
      },
    });
    testModifierId = modifier.id;

    // 6. Seed Dining Table
    const zone = await prisma.zone.findFirst({ where: { restaurantId } });
    const table = await prisma.restaurantTable.create({
      data: {
        restaurantId,
        zoneId: zone!.id,
        name: 'T-ORDER-10',
        capacity: 4,
        status: 'AVAILABLE',
      },
    });
    testTableId = table.id;
  });

  afterAll(async () => {
    // Clean up
    await prisma.orderItemModifier.deleteMany({
      where: { orderItem: { order: { restaurantId: { in: [restaurantId, otherRestaurantId] } } } },
    });
    await prisma.orderItem.deleteMany({
      where: { order: { restaurantId: { in: [restaurantId, otherRestaurantId] } } },
    });
    await prisma.order.deleteMany({
      where: { restaurantId: { in: [restaurantId, otherRestaurantId] } },
    });
    await prisma.dailyOrderSequence.deleteMany({
      where: { restaurantId: { in: [restaurantId, otherRestaurantId] } },
    });

    if (testModifierId) {
      await prisma.modifier.deleteMany({ where: { id: testModifierId } });
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
    if (testTableId) {
      await prisma.restaurantTable.deleteMany({ where: { id: testTableId } });
    }
    await prisma.deliveryZone.deleteMany({
      where: { name: 'Order Test Delivery Zone' },
    });

    await prisma.user.deleteMany({
      where: {
        username: {
          in: ['order_other_owner', 'order_test_manager', 'order_test_cashier'],
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
  // 1. Unified Order Creation & Daily Sequencing
  // ===========================================================================
  describe('1. Unified Order Creation & Daily Sequencing', () => {
    it('should create a DINE_IN order linked to a table with item, variant, and modifier snapshots', async () => {
      const response = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          orderType: 'DINE_IN',
          tableId: testTableId,
          guestCount: 2,
          notes: 'Customer requested table near window',
          items: [
            {
              menuItemId: testMenuItemId,
              variantId: testVariantId, // 16.00
              quantity: 2, // 32.00
              modifierIds: [testModifierId], // +2.50 * 2 = +5.00 => 37.00
              specialInstructions: 'Well done patties',
            },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.order).toMatchObject({
        orderType: 'DINE_IN',
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        subtotal: 37.0,
        tableId: testTableId,
        guestCount: 2,
      });

      expect(response.body.data.order.orderCode).toMatch(/^ORD-\d{8}-001$/);
      expect(response.body.data.order.items.length).toBe(1);
      expect(response.body.data.order.items[0].itemName).toBe('Classic Smash Burger');
      expect(response.body.data.order.items[0].variantName).toBe('Double Patty');
      expect(response.body.data.order.items[0].unitPrice).toBe(16.0);
      expect(response.body.data.order.items[0].modifiersPrice).toBe(2.5);
      expect(response.body.data.order.items[0].itemGrossTotal).toBe(37.0);
      expect(response.body.data.order.items[0].modifiers.length).toBe(1);
      expect(response.body.data.order.items[0].modifiers[0].name).toBe('Extra Cheddar Cheese');

      createdOrder1Id = response.body.data.order.id;

      // Verify Table status updated to OCCUPIED
      const table = await prisma.restaurantTable.findUnique({
        where: { id: testTableId },
      });
      expect(table?.status).toBe('OCCUPIED');

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: createdOrder1Id,
          action: 'ORDER_CREATED',
        },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should generate sequential daily order codes on consecutive orders', async () => {
      const response = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          orderType: 'TAKEAWAY',
          items: [
            {
              menuItemId: testMenuItemId,
              quantity: 1, // base 12.00
            },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.data.order.orderCode).toMatch(/^ORD-\d{8}-002$/);
      createdOrder2Id = response.body.data.order.id;
    });

    it('should preserve historical order prices when menu catalog prices change', async () => {
      // 1. Update menu item base price from 12.0 to 99.0
      await prisma.menuItem.update({
        where: { id: testMenuItemId },
        data: { basePrice: 99.0 },
      });

      // 2. Fetch order 2
      const response = await request(app)
        .get(`/api/v1/orders/${createdOrder2Id}`)
        .set('Authorization', `Bearer ${cashierAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.order.subtotal).toBe(12.0);
      expect(response.body.data.order.items[0].unitPrice).toBe(12.0);

      // Restore base price
      await prisma.menuItem.update({
        where: { id: testMenuItemId },
        data: { basePrice: 12.0 },
      });
    });
  });

  // ===========================================================================
  // 2. Channel Orders (Takeaway & Delivery)
  // ===========================================================================
  describe('2. Takeaway & Delivery Orders via Unified Foundation', () => {
    it('should create a TAKEAWAY order with packaging charge', async () => {
      const response = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          orderType: 'TAKEAWAY',
          packagingCharge: 1.5,
          customerName: 'Bilal Khan',
          customerPhone: '03112233445',
          items: [
            {
              menuItemId: testMenuItemId,
              quantity: 1, // 12.00
            },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.data.order.orderType).toBe('TAKEAWAY');
      expect(response.body.data.order.packagingCharge).toBe(1.5);
      expect(response.body.data.order.customerName).toBe('Bilal Khan');
    });

    it('should create a DELIVERY order with zone fee and customer linkage', async () => {
      const cust = await prisma.customer.upsert({
        where: { restaurantId_phone: { restaurantId, phone: '03009988776' } },
        update: {},
        create: {
          restaurantId,
          name: 'Ahmed Khan',
          phone: '03009988776',
        },
      });

      const dZone = await prisma.deliveryZone.upsert({
        where: { restaurantId_name: { restaurantId, name: 'Order Test Delivery Zone' } },
        update: { isActive: true },
        create: {
          restaurantId,
          name: 'Order Test Delivery Zone',
          deliveryCharge: 4.0,
          estimatedMinutes: 30,
          isActive: true,
        },
      });

      const response = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          orderType: 'DELIVERY',
          customerId: cust.id,
          customerName: 'Ahmed Khan',
          customerPhone: '03009988776',
          deliveryAddress: 'House 99, Street 15, F-7/2',
          deliveryZoneId: dZone.id,
          packagingCharge: 1.0,
          items: [
            {
              menuItemId: testMenuItemId,
              quantity: 2, // 24.00
            },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.data.order.orderType).toBe('DELIVERY');
      expect(response.body.data.order.customerId).toBe(cust.id);
      expect(response.body.data.order.subtotal).toBe(24.0);
      expect(response.body.data.order.deliveryCharge).toBeGreaterThan(0);
    });

    it('should create an aggregator delivery order marked PREPAID', async () => {
      const response = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          orderType: 'DELIVERY',
          isAggregator: true,
          aggregatorName: 'Foodpanda',
          aggregatorReference: 'FP-ORD-8899',
          paymentMethod: 'PREPAID',
          customerName: 'Online Customer',
          items: [
            {
              menuItemId: testMenuItemId,
              quantity: 1, // 12.00
            },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.data.order.isAggregator).toBe(true);
      expect(response.body.data.order.aggregatorName).toBe('Foodpanda');
      expect(response.body.data.order.paymentStatus).toBe('PAID');
    });
  });

  // ===========================================================================
  // 3. Incremental Items & Courses (Adding Dishes to Active Order)
  // ===========================================================================
  describe('3. Incremental Items & Courses', () => {
    it('should add extra items to an active dine-in order and update totals', async () => {
      const initialRes = await request(app)
        .get(`/api/v1/orders/${createdOrder1Id}`)
        .set('Authorization', `Bearer ${cashierAccessToken}`);
      const initialSubtotal = initialRes.body.data.order.subtotal;

      const response = await request(app)
        .patch(`/api/v1/orders/${createdOrder1Id}/items`)
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          items: [
            {
              menuItemId: testMenuItemId,
              quantity: 1, // 12.00
              specialInstructions: 'Second course',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.data.order.subtotal).toBe(initialSubtotal + 12.0);
      expect(response.body.data.order.items.length).toBe(2);

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: createdOrder1Id,
          action: 'ORDER_ITEMS_ADDED',
        },
      });
      expect(auditLog).not.toBeNull();
    });
  });

  // ===========================================================================
  // 4. Item-Level and Order-Level Discounts
  // ===========================================================================
  describe('4. Item-Level and Order-Level Discounts', () => {
    it('should create an order with item-level discount', async () => {
      const response = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          orderType: 'DINE_IN',
          items: [
            {
              menuItemId: testMenuItemId,
              quantity: 2, // 24.00
              discountType: 'PERCENTAGE',
              discountValue: 20, // 20% off => 4.80 discount => 19.20 net
            },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.data.order.subtotal).toBe(24.0);
      expect(response.body.data.order.itemDiscountsTotal).toBe(4.8);
      expect(response.body.data.order.totalDiscount).toBe(4.8);
      expect(response.body.data.order.items[0].discountAmount).toBe(4.8);
      expect(response.body.data.order.items[0].itemNetTotal).toBe(19.2);
    });

    it('should apply an order-level discount using Manager credentials', async () => {
      const response = await request(app)
        .post(`/api/v1/orders/${createdOrder1Id}/discount`)
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          discountType: 'FIXED_AMOUNT',
          discountValue: 5.0,
          discountReason: 'Loyalty customer discount',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.order.orderDiscountAmount).toBe(5.0);
      expect(response.body.data.order.orderDiscountReason).toBe('Loyalty customer discount');
      expect(response.body.data.order.totalDiscount).toBe(5.0);

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: createdOrder1Id,
          action: 'ORDER_DISCOUNT_APPLIED',
        },
      });
      expect(auditLog).not.toBeNull();
    });
  });

  // ===========================================================================
  // 5. Void & Cancellation Operations
  // ===========================================================================
  describe('5. Void & Cancellation Operations', () => {
    it('should allow Manager to void a single order item with reason', async () => {
      // 1. Fetch current items of order 1
      const orderRes = await request(app)
        .get(`/api/v1/orders/${createdOrder1Id}`)
        .set('Authorization', `Bearer ${cashierAccessToken}`);
      const itemToVoid = orderRes.body.data.order.items[1]; // Second course item (12.00)

      const response = await request(app)
        .post(`/api/v1/orders/${createdOrder1Id}/items/${itemToVoid.id}/void`)
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          voidReason: 'Customer changed order before kitchen started cooking',
        });

      expect(response.status).toBe(200);
      const voidedItem = response.body.data.order.items.find(
        (i: { id: string; status: string; voidReason?: string }) => i.id === itemToVoid.id,
      );
      expect(voidedItem.status).toBe('VOIDED');
      expect(voidedItem.voidReason).toBe('Customer changed order before kitchen started cooking');

      // Verify order subtotal decreased by 12.00
      expect(response.body.data.order.subtotal).toBe(37.0);

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: createdOrder1Id,
          action: 'ORDER_ITEM_VOIDED',
        },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should allow Cashier to void an item by providing valid Manager PIN', async () => {
      // Create a temporary order with 2 items
      const newOrder = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          orderType: 'TAKEAWAY',
          items: [
            { menuItemId: testMenuItemId, quantity: 1 },
            { menuItemId: testMenuItemId, quantity: 1 },
          ],
        });

      const itemId = newOrder.body.data.order.items[0].id;

      // Attempt void without manager PIN -> should fail 400
      const failedVoid = await request(app)
        .post(`/api/v1/orders/${newOrder.body.data.order.id}/items/${itemId}/void`)
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          voidReason: 'Mistakenly punched',
        });
      expect(failedVoid.status).toBe(400);

      // Void with valid Manager PIN -> success
      const successVoid = await request(app)
        .post(`/api/v1/orders/${newOrder.body.data.order.id}/items/${itemId}/void`)
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          voidReason: 'Mistakenly punched',
          managerPin: '6677',
        });

      expect(successVoid.status).toBe(200);
      expect(
        successVoid.body.data.order.items.find(
          (i: { id: string; status: string }) => i.id === itemId,
        ).status,
      ).toBe('VOIDED');
    });

    it('should cancel an active order with reason', async () => {
      const response = await request(app)
        .post(`/api/v1/orders/${createdOrder2Id}/cancel`)
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          reason: 'Customer walked out before payment',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.order.status).toBe('CANCELLED');
      expect(response.body.data.order.cancelReason).toBe('Customer walked out before payment');

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: createdOrder2Id,
          action: 'ORDER_CANCELLED',
        },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should void an entire order with reason using Manager credentials', async () => {
      const newOrder = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          orderType: 'TAKEAWAY',
          items: [{ menuItemId: testMenuItemId, quantity: 1 }],
        });

      const response = await request(app)
        .post(`/api/v1/orders/${newOrder.body.data.order.id}/void`)
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          voidReason: 'Accidental duplicate ticket',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.order.status).toBe('VOIDED');
      expect(response.body.data.order.voidReason).toBe('Accidental duplicate ticket');
    });
  });

  // ===========================================================================
  // 6. Order Lifecycle & Query Endpoints
  // ===========================================================================
  describe('6. Order Lifecycle & Query Endpoints', () => {
    it('should advance order status through lifecycle (CONFIRMED -> PREPARING -> READY -> SERVED -> COMPLETED)', async () => {
      const statuses = ['CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED'] as const;

      for (const st of statuses) {
        const res = await request(app)
          .patch(`/api/v1/orders/${createdOrder1Id}/status`)
          .set('Authorization', `Bearer ${cashierAccessToken}`)
          .send({ status: st });

        expect(res.status).toBe(200);
        expect(res.body.data.order.status).toBe(st);
      }

      // Verify AuditLog for last status
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: createdOrder1Id,
          action: 'ORDER_STATUS_CHANGED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should list and filter orders with pagination', async () => {
      const response = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .query({
          orderType: 'DINE_IN',
          page: 1,
          limit: 10,
        });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data.orders)).toBe(true);
      expect(response.body.data.pagination.total).toBeGreaterThanOrEqual(1);
    });

    it('should get active orders for a dining table', async () => {
      const response = await request(app)
        .get(`/api/v1/orders/table/${testTableId}`)
        .set('Authorization', `Bearer ${cashierAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.table.id).toBe(testTableId);
      expect(Array.isArray(response.body.data.orders)).toBe(true);
    });

    it('should get daily order and sales summary metrics', async () => {
      const response = await request(app)
        .get('/api/v1/orders/summary/daily')
        .set('Authorization', `Bearer ${cashierAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.summary).toHaveProperty('totalOrders');
      expect(response.body.data.summary.totalOrders).toBeGreaterThanOrEqual(1);
      expect(response.body.data.summary).toHaveProperty('totalGrandTotal');
    });
  });

  // ===========================================================================
  // 7. Multi-Tenant Isolation
  // ===========================================================================
  describe('7. Multi-Tenant Isolation', () => {
    it('should isolate orders between different restaurants', async () => {
      // 1. Fetching order of Restaurant A with Restaurant B token -> 404
      const crossOrder = await request(app)
        .get(`/api/v1/orders/${createdOrder1Id}`)
        .set('Authorization', `Bearer ${otherOwnerAccessToken}`);
      expect(crossOrder.status).toBe(404);

      // 2. Listing orders for Restaurant B returns 0 orders
      const crossList = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${otherOwnerAccessToken}`);
      expect(crossList.status).toBe(200);
      expect(crossList.body.data.orders.length).toBe(0);
    });
  });
});
