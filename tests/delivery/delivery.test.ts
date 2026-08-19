import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

describe('Faraz POS - Delivery Management Module Tests', () => {
  let restaurantId: string;
  let _ownerAccessToken: string;
  let managerAccessToken: string;
  let cashierAccessToken: string;
  let riderAccessToken: string;
  let riderUserId: string;

  // Secondary restaurant for tenant isolation testing
  let otherRestaurantId: string;
  let otherOwnerAccessToken: string;

  let testCategoryId: string;
  let testMenuItemId: string;
  let testVariantId: string;
  let testModifierGroupId: string;
  let testModifierId: string;
  let testZoneId: string;

  let createdDeliveryOrder1Id: string;
  let createdDeliveryOrder2Id: string;
  let testCustomerId: string;

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
    const deliveryRole = await prisma.role.findFirst({
      where: { restaurantId, name: 'DELIVERY' },
    });

    const bcrypt = await import('bcrypt');
    const pinHashManager = await bcrypt.hash('9988', 10);
    const pinHashCashier = await bcrypt.hash('9977', 10);
    const pinHashRider = await bcrypt.hash('9966', 10);

    // Create Suite-Isolated Manager
    await prisma.user.upsert({
      where: {
        restaurantId_username: { restaurantId, username: 'del_test_manager' },
      },
      update: { isActive: true, pinHash: pinHashManager },
      create: {
        restaurantId,
        name: 'Del Test Manager',
        username: 'del_test_manager',
        pinHash: pinHashManager,
        userRoles: { create: { roleId: managerRole!.id } },
      },
    });

    // Create Suite-Isolated Cashier
    await prisma.user.upsert({
      where: {
        restaurantId_username: { restaurantId, username: 'del_test_cashier' },
      },
      update: { isActive: true, pinHash: pinHashCashier },
      create: {
        restaurantId,
        name: 'Del Test Cashier',
        username: 'del_test_cashier',
        pinHash: pinHashCashier,
        userRoles: { create: { roleId: cashierRole!.id } },
      },
    });

    // Create Suite-Isolated Rider
    const riderUser = await prisma.user.upsert({
      where: {
        restaurantId_username: { restaurantId, username: 'del_test_rider' },
      },
      update: { isActive: true, pinHash: pinHashRider },
      create: {
        restaurantId,
        name: 'Ali Rider',
        username: 'del_test_rider',
        pinHash: pinHashRider,
        userRoles: { create: { roleId: deliveryRole!.id } },
      },
    });
    riderUserId = riderUser.id;

    // Login suite users
    const managerLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'del_test_manager',
      pin: '9988',
    });
    managerAccessToken = managerLogin.body.data.accessToken;

    const cashierLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'del_test_cashier',
      pin: '9977',
    });
    cashierAccessToken = cashierLogin.body.data.accessToken;

    const riderLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'del_test_rider',
      pin: '9966',
    });
    riderAccessToken = riderLogin.body.data.accessToken;

    _ownerAccessToken = managerAccessToken;

    // 6. Create Secondary Restaurant for Tenant Isolation Tests
    const otherRest = await prisma.restaurant.upsert({
      where: { slug: 'delivery-iso-bistro' },
      update: {},
      create: {
        name: 'Delivery Isolation Bistro',
        slug: 'delivery-iso-bistro',
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
        description: 'Owner of delivery other restaurant',
      },
    });

    await prisma.user.upsert({
      where: {
        restaurantId_username: {
          restaurantId: otherRestaurantId,
          username: 'delivery_other_owner',
        },
      },
      update: {},
      create: {
        restaurantId: otherRestaurantId,
        name: 'Delivery Other Owner',
        username: 'delivery_other_owner',
        pinHash: pinHashOther,
        userRoles: {
          create: { roleId: otherOwnerRole.id },
        },
      },
    });

    const otherLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'delivery_other_owner',
      pin: '1234',
    });
    otherOwnerAccessToken = otherLogin.body.data.accessToken;

    // 7. Clean up existing delivery data
    await prisma.deliveryOrderItem.deleteMany({
      where: { deliveryOrder: { restaurantId: { in: [restaurantId, otherRestaurantId] } } },
    });
    await prisma.deliveryOrder.deleteMany({
      where: { restaurantId: { in: [restaurantId, otherRestaurantId] } },
    });
    await prisma.riderSettlement.deleteMany({
      where: { restaurantId: { in: [restaurantId, otherRestaurantId] } },
    });
    await prisma.deliveryDailySequence.deleteMany({
      where: { restaurantId: { in: [restaurantId, otherRestaurantId] } },
    });
    await prisma.customerAddress.deleteMany({
      where: { customer: { restaurantId: { in: [restaurantId, otherRestaurantId] } } },
    });
    await prisma.customer.deleteMany({
      where: { restaurantId: { in: [restaurantId, otherRestaurantId] } },
    });
    await prisma.deliveryZone.deleteMany({
      where: { name: 'Sector H-12 NUST Campus' },
    });

    // 8. Seed Test Menu Items, Variants, and Modifiers
    const cat = await prisma.category.create({
      data: {
        restaurantId,
        name: 'Delivery Test Fast Food',
        sortOrder: 1,
      },
    });
    testCategoryId = cat.id;

    const item = await prisma.menuItem.create({
      data: {
        restaurantId,
        categoryId: testCategoryId,
        itemCode: 'DEL-PIZZA-01',
        name: 'Supreme Cheese Pizza',
        basePrice: 15.0,
        sortOrder: 1,
      },
    });
    testMenuItemId = item.id;

    const variant = await prisma.menuItemVariant.create({
      data: {
        menuItemId: testMenuItemId,
        name: 'Large 14 inch',
        price: 20.0,
      },
    });
    testVariantId = variant.id;

    const modGroup = await prisma.modifierGroup.create({
      data: {
        restaurantId,
        name: 'Pizza Toppings',
        selectionType: 'MULTIPLE',
      },
    });
    testModifierGroupId = modGroup.id;

    const mod = await prisma.modifier.create({
      data: {
        modifierGroupId: testModifierGroupId,
        name: 'Extra Mushrooms',
        priceAdjustment: 2.0,
      },
    });
    testModifierId = mod.id;

    // 9. Fetch or create Delivery Zone
    const zone = await prisma.deliveryZone.findFirst({
      where: { restaurantId, name: 'Standard Delivery (Within 5km)' },
    });
    testZoneId = zone!.id;
  });

  afterAll(async () => {
    // Clean up created records
    await prisma.deliveryOrderItem.deleteMany({
      where: { deliveryOrder: { restaurantId: { in: [restaurantId, otherRestaurantId] } } },
    });
    await prisma.deliveryOrder.deleteMany({
      where: { restaurantId: { in: [restaurantId, otherRestaurantId] } },
    });
    await prisma.riderSettlement.deleteMany({
      where: { restaurantId: { in: [restaurantId, otherRestaurantId] } },
    });
    await prisma.deliveryDailySequence.deleteMany({
      where: { restaurantId: { in: [restaurantId, otherRestaurantId] } },
    });
    await prisma.customerAddress.deleteMany({
      where: { customer: { restaurantId: { in: [restaurantId, otherRestaurantId] } } },
    });
    await prisma.customer.deleteMany({
      where: { restaurantId: { in: [restaurantId, otherRestaurantId] } },
    });
    await prisma.deliveryZone.deleteMany({
      where: { name: 'Sector H-12 NUST Campus' },
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

    await prisma.user.deleteMany({
      where: {
        username: {
          in: ['delivery_other_owner', 'del_test_manager', 'del_test_cashier', 'del_test_rider'],
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
  // 1. Customer Foundation & Phone Lookup
  // ===========================================================================
  describe('1. Customer Foundation & Phone Lookup', () => {
    it('should return null when customer phone is not found', async () => {
      const response = await request(app)
        .get('/api/v1/customers/lookup?phone=03009999999')
        .set('Authorization', `Bearer ${cashierAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.customer).toBeNull();
    });

    it('should create a customer with address and landmark', async () => {
      const response = await request(app)
        .post('/api/v1/customers')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          name: 'Usman Tariq',
          phone: '03001122334',
          notes: 'Frequent weekend customer',
          address: 'House 45, Street 12, F-8/2',
          landmark: 'Near City Park',
          deliveryZoneId: testZoneId,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.customer).toMatchObject({
        name: 'Usman Tariq',
        phone: '03001122334',
        notes: 'Frequent weekend customer',
      });
      expect(response.body.data.customer.addresses.length).toBe(1);
      expect(response.body.data.customer.addresses[0].address).toBe('House 45, Street 12, F-8/2');

      testCustomerId = response.body.data.customer.id;
    });

    it('should lookup existing customer by phone and return saved addresses and past orders', async () => {
      const response = await request(app)
        .get('/api/v1/customers/lookup?phone=03001122334')
        .set('Authorization', `Bearer ${cashierAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.customer).not.toBeNull();
      expect(response.body.data.customer.name).toBe('Usman Tariq');
      expect(response.body.data.customer.addresses.length).toBe(1);
      expect(Array.isArray(response.body.data.customer.deliveryOrders)).toBe(true);
    });

    it('should add an additional delivery address to the customer', async () => {
      const response = await request(app)
        .post(`/api/v1/customers/${testCustomerId}/addresses`)
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          address: 'Office 301, Blue Area Tower',
          landmark: 'Opposite Metro Station',
          deliveryZoneId: testZoneId,
          isDefault: true,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.address.address).toBe('Office 301, Blue Area Tower');
      expect(response.body.data.address.isDefault).toBe(true);
    });
  });

  // ===========================================================================
  // 2. Delivery Zones & Pricing
  // ===========================================================================
  describe('2. Delivery Zones & Pricing', () => {
    it('should list configured delivery zones for the restaurant', async () => {
      const response = await request(app)
        .get('/api/v1/delivery/zones')
        .set('Authorization', `Bearer ${cashierAccessToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data.zones)).toBe(true);
      expect(response.body.data.zones.length).toBeGreaterThanOrEqual(1);
    });

    it('should create a custom delivery zone', async () => {
      const response = await request(app)
        .post('/api/v1/delivery/zones')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          name: 'Sector H-12 NUST Campus',
          deliveryCharge: 5.5,
          estimatedMinutes: 35,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.zone.name).toBe('Sector H-12 NUST Campus');
      expect(response.body.data.zone.deliveryCharge).toBe(5.5);
    });
  });

  // ===========================================================================
  // 3. Delivery Order Creation & Price Snapshot Integrity
  // ===========================================================================
  describe('3. Delivery Order Creation & Price Snapshots', () => {
    it('should create a phone-in delivery order with zone fee and calculate totals', async () => {
      const response = await request(app)
        .post('/api/v1/delivery/orders')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          customerName: 'Usman Tariq',
          customerPhone: '03001122334',
          deliveryAddress: 'House 45, Street 12, F-8/2',
          landmark: 'Near City Park',
          deliveryZoneId: testZoneId, // 3.50
          packagingCharge: 1.0,
          paymentMethod: 'CASH',
          items: [
            {
              menuItemId: testMenuItemId,
              variantId: testVariantId, // 20.0
              quantity: 2, // 40.0
              modifierIds: [testModifierId], // +2.0 => 22.0 * 2 = 44.0
              specialInstructions: 'Extra crispy crust',
            },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.order).toMatchObject({
        customerName: 'Usman Tariq',
        customerPhone: '03001122334',
        deliveryAddress: 'House 45, Street 12, F-8/2',
        status: 'PENDING',
        paymentStatus: 'PENDING',
        paymentMethod: 'CASH',
        subtotal: 44.0,
        deliveryCharge: 3.5,
        packagingCharge: 1.0,
      });

      expect(response.body.data.order.orderCode).toMatch(/^DEL-\d{8}-001$/);
      expect(response.body.data.order.items.length).toBe(1);
      expect(response.body.data.order.items[0].name).toBe('Supreme Cheese Pizza');
      expect(response.body.data.order.items[0].variantName).toBe('Large 14 inch');

      createdDeliveryOrder1Id = response.body.data.order.id;

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: createdDeliveryOrder1Id,
          action: 'DELIVERY_ORDER_CREATED',
        },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should preserve historical order prices when menu item price is updated in catalog', async () => {
      // 1. Fetch order 1 initially created
      const initialRes = await request(app)
        .get(`/api/v1/delivery/orders/${createdDeliveryOrder1Id}`)
        .set('Authorization', `Bearer ${cashierAccessToken}`);
      const initialTotal = initialRes.body.data.order.totalAmount;

      // 2. Update menu item base price from 15.0 to 50.0
      await prisma.menuItem.update({
        where: { id: testMenuItemId },
        data: { basePrice: 50.0 },
      });

      // 3. Fetch order 1 again
      const response = await request(app)
        .get(`/api/v1/delivery/orders/${createdDeliveryOrder1Id}`)
        .set('Authorization', `Bearer ${cashierAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.order.subtotal).toBe(44.0);
      expect(response.body.data.order.totalAmount).toBe(initialTotal);

      // Restore base price
      await prisma.menuItem.update({
        where: { id: testMenuItemId },
        data: { basePrice: 15.0 },
      });
    });

    it('should create an aggregator delivery order (Foodpanda) marked PREPAID', async () => {
      const response = await request(app)
        .post('/api/v1/delivery/orders')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          customerName: 'Ayesha Bibi',
          customerPhone: '0333-5544332',
          deliveryAddress: 'Flat 4B, Silver Heights',
          flatDeliveryFee: 0,
          packagingCharge: 0.5,
          paymentMethod: 'PREPAID',
          isAggregator: true,
          aggregatorName: 'Foodpanda',
          aggregatorReference: 'FP-998811',
          items: [
            {
              menuItemId: testMenuItemId,
              quantity: 1, // 15.0
            },
          ],
        });

      expect(response.status).toBe(201);
      expect(response.body.data.order.isAggregator).toBe(true);
      expect(response.body.data.order.aggregatorName).toBe('Foodpanda');
      expect(response.body.data.order.aggregatorReference).toBe('FP-998811');
      expect(response.body.data.order.paymentStatus).toBe('PAID');
      expect(response.body.data.order.subtotal).toBe(15.0);

      createdDeliveryOrder2Id = response.body.data.order.id;
    });
  });

  // ===========================================================================
  // 4. Rider Assignment & Delivery Lifecycle
  // ===========================================================================
  describe('4. Rider Assignment & Delivery Lifecycle', () => {
    it('should list eligible delivery riders', async () => {
      const response = await request(app)
        .get('/api/v1/delivery/riders')
        .set('Authorization', `Bearer ${cashierAccessToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data.riders)).toBe(true);
      const rider = response.body.data.riders.find((r: { id: string }) => r.id === riderUserId);
      expect(rider).toBeDefined();
    });

    it('should assign a rider to a delivery order', async () => {
      const response = await request(app)
        .post(`/api/v1/delivery/orders/${createdDeliveryOrder1Id}/assign-rider`)
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({ riderId: riderUserId });

      expect(response.status).toBe(200);
      expect(response.body.data.order.riderId).toBe(riderUserId);
      expect(response.body.data.order.rider.name).toBe('Ali Rider');
    });

    it('should advance order status through lifecycle: PENDING -> PREPARING -> READY -> DISPATCHED -> DELIVERED', async () => {
      // 1. PENDING -> PREPARING
      const res1 = await request(app)
        .patch(`/api/v1/delivery/orders/${createdDeliveryOrder1Id}/status`)
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({ status: 'PREPARING' });
      expect(res1.status).toBe(200);
      expect(res1.body.data.order.status).toBe('PREPARING');

      // 2. PREPARING -> READY
      const res2 = await request(app)
        .patch(`/api/v1/delivery/orders/${createdDeliveryOrder1Id}/status`)
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({ status: 'READY' });
      expect(res2.status).toBe(200);
      expect(res2.body.data.order.status).toBe('READY');

      // 3. READY -> DISPATCHED
      const res3 = await request(app)
        .patch(`/api/v1/delivery/orders/${createdDeliveryOrder1Id}/status`)
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({ status: 'DISPATCHED' });
      expect(res3.status).toBe(200);
      expect(res3.body.data.order.status).toBe('DISPATCHED');

      // 4. View rider active deliveries
      const riderActive = await request(app)
        .get(`/api/v1/delivery/riders/${riderUserId}/active`)
        .set('Authorization', `Bearer ${riderAccessToken}`);
      expect(riderActive.status).toBe(200);
      expect(riderActive.body.data.deliveries.length).toBeGreaterThanOrEqual(1);

      // 5. DISPATCHED -> DELIVERED
      const res4 = await request(app)
        .patch(`/api/v1/delivery/orders/${createdDeliveryOrder1Id}/status`)
        .set('Authorization', `Bearer ${riderAccessToken}`)
        .send({ status: 'DELIVERED', markPaid: true });
      expect(res4.status).toBe(200);
      expect(res4.body.data.order.status).toBe('DELIVERED');
      expect(res4.body.data.order.paymentStatus).toBe('PAID');
    });

    it('should reject status updates on an already DELIVERED order', async () => {
      const response = await request(app)
        .patch(`/api/v1/delivery/orders/${createdDeliveryOrder1Id}/status`)
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({ status: 'READY' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('already DELIVERED');
    });

    it('should cancel an active delivery order with reason', async () => {
      const response = await request(app)
        .post(`/api/v1/delivery/orders/${createdDeliveryOrder2Id}/cancel`)
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({ reason: 'Aggregator cancelled order before food prep' });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('CANCELLED');
      expect(response.body.data.cancelReason).toBe('Aggregator cancelled order before food prep');
    });
  });

  // ===========================================================================
  // 5. Dispatcher Queue View
  // ===========================================================================
  describe('5. Dispatcher Queue View', () => {
    it('should return active dispatcher queue with summary counts and elapsed age', async () => {
      const response = await request(app)
        .get('/api/v1/delivery/dispatcher')
        .set('Authorization', `Bearer ${cashierAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('summary');
      expect(Array.isArray(response.body.data.queue)).toBe(true);
    });
  });

  // ===========================================================================
  // 6. Rider Cash Ledger & Settlement Reconciliation
  // ===========================================================================
  describe('6. Rider Cash Reconciliation & Settlement', () => {
    let expectedRemittance: number;

    it('should calculate rider outstanding cash for delivered un-settled orders', async () => {
      const response = await request(app)
        .get(`/api/v1/delivery/riders/${riderUserId}/outstanding`)
        .set('Authorization', `Bearer ${managerAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.rider.id).toBe(riderUserId);
      expect(response.body.data.expectedCash).toBeGreaterThan(0);
      expect(response.body.data.totalOutstandingOrders).toBe(1);

      expectedRemittance = response.body.data.expectedCash;
    });

    it('should record rider settlement atomically and mark orders as settled', async () => {
      const response = await request(app)
        .post('/api/v1/delivery/riders/settle')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          riderId: riderUserId,
          orderIds: [createdDeliveryOrder1Id],
          collectedAmount: expectedRemittance,
          remittedAmount: expectedRemittance,
          notes: 'Evening shift delivery reconciliation completed',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.settlement.remittedAmount).toBe(expectedRemittance);
      expect(response.body.data.settlement.varianceAmount).toBe(0);
      expect(response.body.data.settlement.ordersCount).toBe(1);

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          action: 'DELIVERY_RIDER_SETTLEMENT_CLOSED',
        },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should prevent double-settlement of already settled delivery orders', async () => {
      const response = await request(app)
        .post('/api/v1/delivery/riders/settle')
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          riderId: riderUserId,
          orderIds: [createdDeliveryOrder1Id],
          collectedAmount: expectedRemittance,
          remittedAmount: expectedRemittance,
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('already settled');
    });

    it('should list historical rider settlements', async () => {
      const response = await request(app)
        .get('/api/v1/delivery/settlements')
        .set('Authorization', `Bearer ${managerAccessToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data.settlements)).toBe(true);
      expect(response.body.data.settlements.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ===========================================================================
  // 7. Multi-Tenant Isolation
  // ===========================================================================
  describe('7. Multi-Tenant Isolation', () => {
    it('should isolate delivery orders and customers between different restaurants', async () => {
      // 1. Cross-fetch delivery order returns 404
      const crossOrder = await request(app)
        .get(`/api/v1/delivery/orders/${createdDeliveryOrder1Id}`)
        .set('Authorization', `Bearer ${otherOwnerAccessToken}`);
      expect(crossOrder.status).toBe(404);

      // 2. Cross-fetch customer returns 404 / null
      const crossCustomer = await request(app)
        .get('/api/v1/customers/lookup?phone=03001122334')
        .set('Authorization', `Bearer ${otherOwnerAccessToken}`);
      expect(crossCustomer.body.data.customer).toBeNull();
    });
  });
});
