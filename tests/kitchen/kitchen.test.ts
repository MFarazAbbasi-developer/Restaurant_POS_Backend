import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

describe('Faraz POS - Kitchen Display System (KDS) & Operations Module Tests', () => {
  let restaurantAId: string;
  let restaurantBId: string;

  let ownerAToken: string;
  let kitchenStaffAToken: string;
  let cashierAToken: string;
  let tenantBToken: string;

  let categoryGrillId: string;
  let categoryBeveragesId: string;

  let itemBurgerId: string;
  let itemSteakId: string;
  let itemSodaId: string;

  let tableAId: string;

  beforeAll(async () => {
    // 1. Fetch Demo Restaurant A
    const restaurantA = await prisma.restaurant.findUniqueOrThrow({
      where: { slug: 'faraz-flagship' },
    });
    restaurantAId = restaurantA.id;

    // 2. Create Restaurant B for isolation tests
    const restaurantB = await prisma.restaurant.upsert({
      where: { slug: 'faraz-test-branch-kds' },
      update: {},
      create: {
        name: 'Faraz Branch KDS Test',
        slug: 'faraz-test-branch-kds',
        currency: 'PKR',
      },
    });
    restaurantBId = restaurantB.id;

    const defaultPinHash = await bcrypt.hash('1234', 10);
    const cashierPinHash = await bcrypt.hash('4321', 10);

    // 3. Login Owner A
    await prisma.user.updateMany({
      where: { restaurantId: restaurantAId, username: 'owner_admin' },
      data: { pinHash: defaultPinHash, isActive: true },
    });

    const ownerLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'owner_admin',
      pin: '1234',
    });
    ownerAToken = ownerLogin.body.data.accessToken;

    // 4. Create KITCHEN role & staff user for Restaurant A
    const kitchenRole = await prisma.role.findFirst({
      where: { restaurantId: restaurantAId, name: 'KITCHEN' },
    });

    const kitchenUser = await prisma.user.upsert({
      where: {
        restaurantId_username: {
          restaurantId: restaurantAId,
          username: 'chef_mario',
        },
      },
      update: { isActive: true, pinHash: defaultPinHash },
      create: {
        restaurantId: restaurantAId,
        name: 'Chef Mario',
        username: 'chef_mario',
        pinHash: defaultPinHash,
        isActive: true,
      },
    });

    if (kitchenRole) {
      await prisma.userRole.upsert({
        where: {
          userId_roleId: {
            userId: kitchenUser.id,
            roleId: kitchenRole.id,
          },
        },
        update: {},
        create: {
          userId: kitchenUser.id,
          roleId: kitchenRole.id,
        },
      });
    }

    const kitchenLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'chef_mario',
      pin: '1234',
    });
    kitchenStaffAToken = kitchenLogin.body.data.accessToken;

    // 5. Cashier A Login
    await prisma.user.updateMany({
      where: { restaurantId: restaurantAId, username: 'cashier_sarah' },
      data: { pinHash: cashierPinHash, isActive: true },
    });

    const cashierLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'cashier_sarah',
      pin: '4321',
    });
    cashierAToken = cashierLogin.body.data.accessToken;

    // 6. Tenant B User setup with kitchen.view permission in Restaurant B
    const kitchenPerm = await prisma.permission.findUnique({
      where: { key: 'kitchen.view' },
    });

    const roleB = await prisma.role.create({
      data: {
        restaurantId: restaurantBId,
        name: 'KITCHEN_B_' + Date.now(),
        rolePermissions: {
          create: [{ permissionId: kitchenPerm!.id }],
        },
      },
    });

    await prisma.user.upsert({
      where: {
        restaurantId_username: {
          restaurantId: restaurantBId,
          username: 'tenant_b_chef',
        },
      },
      update: { isActive: true, pinHash: defaultPinHash },
      create: {
        restaurantId: restaurantBId,
        name: 'Tenant B Chef',
        username: 'tenant_b_chef',
        pinHash: defaultPinHash,
        isActive: true,
        userRoles: {
          create: [{ roleId: roleB.id }],
        },
      },
    });

    const userBLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'tenant_b_chef',
      pin: '1234',
    });
    tenantBToken = userBLogin.body.data.accessToken;

    // 7. Seed categories & menu items for Restaurant A
    const categoryGrill = await prisma.category.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Grill & Steaks ' + Date.now(),
        sortOrder: 1,
      },
    });
    categoryGrillId = categoryGrill.id;

    const categoryBeverages = await prisma.category.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Beverages ' + Date.now(),
        sortOrder: 2,
      },
    });
    categoryBeveragesId = categoryBeverages.id;

    const itemBurger = await prisma.menuItem.create({
      data: {
        restaurantId: restaurantAId,
        categoryId: categoryGrillId,
        itemCode: 'GRL-01-' + Date.now(),
        name: 'Smoked Beef Burger',
        basePrice: 15.0,
      },
    });
    itemBurgerId = itemBurger.id;

    const itemSteak = await prisma.menuItem.create({
      data: {
        restaurantId: restaurantAId,
        categoryId: categoryGrillId,
        itemCode: 'GRL-02-' + Date.now(),
        name: 'Ribeye Steak',
        basePrice: 35.0,
      },
    });
    itemSteakId = itemSteak.id;

    const itemSoda = await prisma.menuItem.create({
      data: {
        restaurantId: restaurantAId,
        categoryId: categoryBeveragesId,
        itemCode: 'BEV-01-' + Date.now(),
        name: 'Craft Cola',
        basePrice: 3.5,
      },
    });
    itemSodaId = itemSoda.id;

    // Fetch dining table
    const table = await prisma.restaurantTable.findFirst({
      where: { restaurantId: restaurantAId, isActive: true },
    });
    tableAId = table!.id;
  });

  // ---------------------------------------------------------------------------
  // 1. Kitchen Station Management
  // ---------------------------------------------------------------------------
  describe('1. Kitchen Station Management', () => {
    let createdStationId: string;

    it('should allow manager/owner to create a kitchen station with category mapping', async () => {
      const res = await request(app)
        .post('/api/v1/kitchen/stations')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          name: 'Main Grill Station ' + Date.now(),
          code: 'GRILL-01',
          displayOrder: 1,
          categoryIds: [categoryGrillId],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.station.name).toContain('Main Grill Station');
      expect(res.body.data.station.categories).toHaveLength(1);
      expect(res.body.data.station.categories[0].category.id).toBe(categoryGrillId);

      createdStationId = res.body.data.station.id;
    });

    it('should reject creating duplicate kitchen station name within same restaurant', async () => {
      const stationName = 'Station Unique Name ' + Date.now();
      await request(app)
        .post('/api/v1/kitchen/stations')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ name: stationName });

      const res = await request(app)
        .post('/api/v1/kitchen/stations')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ name: stationName });

      expect(res.status).toBe(409);
      expect(res.body.error.message).toContain('already exists');
    });

    it('should list all kitchen stations for restaurant', async () => {
      const res = await request(app)
        .get('/api/v1/kitchen/stations')
        .set('Authorization', `Bearer ${kitchenStaffAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.stations)).toBe(true);
      expect(res.body.data.stations.length).toBeGreaterThanOrEqual(1);
    });

    it('should get kitchen station by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/kitchen/stations/${createdStationId}`)
        .set('Authorization', `Bearer ${kitchenStaffAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.station.id).toBe(createdStationId);
    });

    it('should update kitchen station name and mapped categories', async () => {
      const res = await request(app)
        .patch(`/api/v1/kitchen/stations/${createdStationId}`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          name: 'Hot Line & Grill Station ' + Date.now(),
          displayOrder: 2,
          categoryIds: [categoryGrillId, categoryBeveragesId],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.station.name).toContain('Hot Line & Grill Station');
      expect(res.body.data.station.categories).toHaveLength(2);
    });

    it('should delete a kitchen station', async () => {
      // Create temporary station to delete
      const tempRes = await request(app)
        .post('/api/v1/kitchen/stations')
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({
          name: 'Temp Station To Delete ' + Date.now(),
        });

      const tempId = tempRes.body.data.station.id;

      const deleteRes = await request(app)
        .delete(`/api/v1/kitchen/stations/${tempId}`)
        .set('Authorization', `Bearer ${ownerAToken}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.data.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. KDS Active Queue & Ticket Display
  // ---------------------------------------------------------------------------
  describe('2. KDS Active Queue & Ticket Filtering', () => {
    let dineInOrderId: string;
    let takeawayOrderId: string;

    beforeAll(async () => {
      // Create Dine-In Order
      const dineInRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({
          orderType: 'DINE_IN',
          tableId: tableAId,
          items: [
            { menuItemId: itemBurgerId, quantity: 2, specialInstructions: 'Medium rare' },
            { menuItemId: itemSodaId, quantity: 2 },
          ],
        });
      dineInOrderId = dineInRes.body.data.order.id;

      // Create Takeaway Order
      const takeawayRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({
          orderType: 'TAKEAWAY',
          customerName: 'Zubair KDS',
          customerPhone: '+92 300 9988776',
          items: [{ menuItemId: itemSteakId, quantity: 1, specialInstructions: 'Well done' }],
        });
      takeawayOrderId = takeawayRes.body.data.order.id;
    });

    it('should fetch active kitchen queue containing created orders with urgency tier and elapsed time', async () => {
      const res = await request(app)
        .get('/api/v1/kitchen/queue')
        .set('Authorization', `Bearer ${kitchenStaffAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tickets.length).toBeGreaterThanOrEqual(2);

      const ticket = res.body.data.tickets.find((t: { id: string }) => t.id === dineInOrderId);
      expect(ticket).toBeDefined();
      expect(ticket.orderType).toBe('DINE_IN');
      expect(ticket.itemsSummary.total).toBe(2);
      expect(ticket.itemsSummary.pending).toBe(2);
      expect(ticket.urgencyTier).toBe('NORMAL');
      expect(typeof ticket.elapsedSeconds).toBe('number');
      expect(ticket.items[0].itemName).toBe('Smoked Beef Burger');
      expect(ticket.items[0].kitchenStatus).toBe('PENDING');
    });

    it('should filter kitchen queue by orderType', async () => {
      const res = await request(app)
        .get('/api/v1/kitchen/queue?orderType=TAKEAWAY')
        .set('Authorization', `Bearer ${kitchenStaffAToken}`);

      expect(res.status).toBe(200);
      expect(
        res.body.data.tickets.every((t: { orderType: string }) => t.orderType === 'TAKEAWAY'),
      ).toBe(true);
      expect(res.body.data.tickets.some((t: { id: string }) => t.id === takeawayOrderId)).toBe(
        true,
      );
    });

    it('should filter kitchen queue by categoryId', async () => {
      const res = await request(app)
        .get(`/api/v1/kitchen/queue?categoryId=${categoryGrillId}`)
        .set('Authorization', `Bearer ${kitchenStaffAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.tickets.length).toBeGreaterThanOrEqual(1);
    });

    it('should retrieve single detailed kitchen ticket by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/kitchen/orders/${dineInOrderId}`)
        .set('Authorization', `Bearer ${kitchenStaffAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.ticket.id).toBe(dineInOrderId);
      expect(res.body.data.ticket.items).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Ticket-Level Bump Bar Operations
  // ---------------------------------------------------------------------------
  describe('3. Ticket-Level Bump Bar Operations', () => {
    let orderToBumpId: string;

    beforeAll(async () => {
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({
          orderType: 'DINE_IN',
          tableId: tableAId,
          items: [{ menuItemId: itemBurgerId, quantity: 1 }],
        });
      orderToBumpId = orderRes.body.data.order.id;
    });

    it('should bump order status to PREPARING and cascade item status', async () => {
      const res = await request(app)
        .patch(`/api/v1/kitchen/orders/${orderToBumpId}/status`)
        .set('Authorization', `Bearer ${kitchenStaffAToken}`)
        .send({ status: 'PREPARING' });

      expect(res.status).toBe(200);
      expect(res.body.data.ticket.status).toBe('PREPARING');
      expect(res.body.data.ticket.items[0].kitchenStatus).toBe('PREPARING');
    });

    it('should bump order status to READY and mark items ready with timestamp', async () => {
      const res = await request(app)
        .patch(`/api/v1/kitchen/orders/${orderToBumpId}/status`)
        .set('Authorization', `Bearer ${kitchenStaffAToken}`)
        .send({ status: 'READY' });

      expect(res.status).toBe(200);
      expect(res.body.data.ticket.status).toBe('READY');
      expect(res.body.data.ticket.items[0].kitchenStatus).toBe('READY');
      expect(res.body.data.ticket.items[0].preparedAt).toBeDefined();
    });

    it('should bump order status to SERVED', async () => {
      const res = await request(app)
        .patch(`/api/v1/kitchen/orders/${orderToBumpId}/status`)
        .set('Authorization', `Bearer ${kitchenStaffAToken}`)
        .send({ status: 'SERVED' });

      expect(res.status).toBe(200);
      expect(res.body.data.ticket.status).toBe('SERVED');
      expect(res.body.data.ticket.items[0].kitchenStatus).toBe('SERVED');
    });

    it('should recall a SERVED order back to PREPARING', async () => {
      const res = await request(app)
        .post(`/api/v1/kitchen/orders/${orderToBumpId}/recall`)
        .set('Authorization', `Bearer ${kitchenStaffAToken}`)
        .send({ reason: 'Guest asked for extra heat' });

      expect(res.status).toBe(200);
      expect(res.body.data.ticket.status).toBe('PREPARING');
      expect(res.body.data.ticket.items[0].kitchenStatus).toBe('PREPARING');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Item-Level Bump Bar & Automatic Order State Sync
  // ---------------------------------------------------------------------------
  describe('4. Item-Level Bump Bar & Automatic Order State Sync', () => {
    let orderMultiId: string;
    let itemId1: string;
    let itemId2: string;

    beforeAll(async () => {
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({
          orderType: 'DINE_IN',
          tableId: tableAId,
          items: [
            { menuItemId: itemBurgerId, quantity: 1 },
            { menuItemId: itemSteakId, quantity: 1 },
          ],
        });
      orderMultiId = orderRes.body.data.order.id;
      itemId1 = orderRes.body.data.order.items[0].id;
      itemId2 = orderRes.body.data.order.items[1].id;
    });

    it('should advance order status to PREPARING when first item starts PREPARING', async () => {
      const res = await request(app)
        .patch(`/api/v1/kitchen/orders/${orderMultiId}/items/${itemId1}/status`)
        .set('Authorization', `Bearer ${kitchenStaffAToken}`)
        .send({ status: 'PREPARING' });

      expect(res.status).toBe(200);
      expect(res.body.data.ticket.status).toBe('PREPARING');
      const item1 = res.body.data.ticket.items.find((i: { id: string }) => i.id === itemId1);
      const item2 = res.body.data.ticket.items.find((i: { id: string }) => i.id === itemId2);
      expect(item1.kitchenStatus).toBe('PREPARING');
      expect(item2.kitchenStatus).toBe('PENDING');
    });

    it('should keep order in PREPARING when only 1 out of 2 items is READY', async () => {
      const res = await request(app)
        .patch(`/api/v1/kitchen/orders/${orderMultiId}/items/${itemId1}/status`)
        .set('Authorization', `Bearer ${kitchenStaffAToken}`)
        .send({ status: 'READY' });

      expect(res.status).toBe(200);
      expect(res.body.data.ticket.status).toBe('PREPARING');
    });

    it('should automatically advance order to READY when all items are marked READY', async () => {
      const res = await request(app)
        .patch(`/api/v1/kitchen/orders/${orderMultiId}/items/${itemId2}/status`)
        .set('Authorization', `Bearer ${kitchenStaffAToken}`)
        .send({ status: 'READY' });

      expect(res.status).toBe(200);
      expect(res.body.data.ticket.status).toBe('READY');
      expect(
        res.body.data.ticket.items.every(
          (i: { kitchenStatus: string }) => i.kitchenStatus === 'READY',
        ),
      ).toBe(true);
    });

    it('should recall a single item and revert order back to PREPARING', async () => {
      const res = await request(app)
        .post(`/api/v1/kitchen/orders/${orderMultiId}/items/${itemId2}/recall`)
        .set('Authorization', `Bearer ${kitchenStaffAToken}`)
        .send({ reason: 'Steak needs to be cooked medium rare instead of well done' });

      expect(res.status).toBe(200);
      expect(res.body.data.ticket.status).toBe('PREPARING');
      const item2 = res.body.data.ticket.items.find((i: { id: string }) => i.id === itemId2);
      expect(item2.kitchenStatus).toBe('PREPARING');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Kitchen Performance Analytics
  // ---------------------------------------------------------------------------
  describe('5. Kitchen Performance Analytics', () => {
    it('should return performance metrics for kitchen queue', async () => {
      const res = await request(app)
        .get('/api/v1/kitchen/performance')
        .set('Authorization', `Bearer ${kitchenStaffAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.activeTicketsCount).toBe('number');
      expect(typeof res.body.data.preparingTicketsCount).toBe('number');
      expect(typeof res.body.data.readyTicketsCount).toBe('number');
      expect(typeof res.body.data.delayedTicketsCount).toBe('number');
      expect(typeof res.body.data.completedTicketsToday).toBe('number');
      expect(typeof res.body.data.avgPrepTimeMinutes).toBe('number');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Security, RBAC & Multi-Tenant Isolation
  // ---------------------------------------------------------------------------
  describe('6. Security, RBAC & Multi-Tenant Isolation', () => {
    it('should reject unauthenticated requests with HTTP 401', async () => {
      const res = await request(app).get('/api/v1/kitchen/queue');
      expect(res.status).toBe(401);
    });

    it('should reject users lacking kitchen.manage from creating stations with HTTP 403', async () => {
      const res = await request(app)
        .post('/api/v1/kitchen/stations')
        .set('Authorization', `Bearer ${kitchenStaffAToken}`)
        .send({ name: 'Unauthorized Station' });

      expect(res.status).toBe(403);
    });

    it('should prevent Tenant B user from accessing Tenant A kitchen queue', async () => {
      const res = await request(app)
        .get('/api/v1/kitchen/queue')
        .set('Authorization', `Bearer ${tenantBToken}`);

      // Tenant B has no active orders
      expect(res.status).toBe(200);
      expect(res.body.data.tickets).toHaveLength(0);
    });
  });
});
