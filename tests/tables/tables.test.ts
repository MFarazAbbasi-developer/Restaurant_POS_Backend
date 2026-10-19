import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

describe('FARMAX POS - Table & Floor Management Module Tests', () => {
  let restaurantId: string;
  let ownerAccessToken: string;
  let managerAccessToken: string;
  let waiterAccessToken: string;

  // Secondary restaurant for tenant isolation testing
  let otherRestaurantId: string;
  let otherOwnerAccessToken: string;

  let testZoneId1: string;
  let testZoneId2: string;
  let testTable1Id: string;
  let testTable2Id: string;
  let testOrderId: string;

  beforeAll(async () => {
    // 1. Fetch primary seeded restaurant
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: 'faraz-flagship' },
    });
    if (!restaurant) {
      throw new Error('Database not seeded!');
    }
    restaurantId = restaurant.id;

    // 2. Login as Owner
    const ownerLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'owner_admin',
      pin: '1234',
    });
    ownerAccessToken = ownerLogin.body.data.accessToken;

    // 3. Login as Manager
    const managerLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'manager_john',
      pin: '2233',
    });
    managerAccessToken = managerLogin.body.data.accessToken;

    // 4. Create/Login as Waiter
    const waiterRole = await prisma.role.findFirst({
      where: { restaurantId, name: 'WAITER' },
    });

    let waiterUser = await prisma.user.findFirst({
      where: { restaurantId, username: 'table_test_waiter' },
    });

    if (!waiterUser && waiterRole) {
      const pinHash = await (await import('bcrypt')).hash('8899', 10);
      waiterUser = await prisma.user.create({
        data: {
          restaurantId,
          name: 'Table Test Waiter',
          username: 'table_test_waiter',
          pinHash,
          userRoles: {
            create: { roleId: waiterRole.id },
          },
        },
      });
    }

    const waiterLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'table_test_waiter',
      pin: '8899',
    });
    waiterAccessToken = waiterLogin.body.data.accessToken;

    // 5. Create Secondary Restaurant for Tenant Isolation Tests
    const otherRest = await prisma.restaurant.upsert({
      where: { slug: 'isolation-test-bistro' },
      update: {},
      create: {
        name: 'Isolation Test Bistro',
        slug: 'isolation-test-bistro',
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
        description: 'Owner of other restaurant',
      },
    });

    await prisma.user.upsert({
      where: {
        restaurantId_username: {
          restaurantId: otherRestaurantId,
          username: 'other_owner',
        },
      },
      update: {},
      create: {
        restaurantId: otherRestaurantId,
        name: 'Other Owner',
        username: 'other_owner',
        pinHash: pinHashOther,
        userRoles: {
          create: { roleId: otherOwnerRole.id },
        },
      },
    });

    const otherLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'other_owner',
      pin: '1234',
    });
    otherOwnerAccessToken = otherLogin.body.data.accessToken;

    // Clean up any leftover records from prior test runs
    await prisma.tableOrder.deleteMany({
      where: { restaurantId: { in: [restaurantId, otherRestaurantId] } },
    });
    await prisma.restaurantTable.deleteMany({
      where: {
        name: { in: ['TEST-T1', 'TEST-T2', 'TEST-T3', 'ISO-T1'] },
      },
    });
    await prisma.zone.deleteMany({
      where: {
        name: {
          in: [
            'Test Executive Floor',
            'Test Executive Floor Updated',
            'Test Rooftop Lounge',
            'Empty Deletable Zone',
            'Other Zone',
          ],
        },
      },
    });
  });

  afterAll(async () => {
    // Cleanup created test records
    await prisma.tableOrder.deleteMany({
      where: { restaurantId: { in: [restaurantId, otherRestaurantId] } },
    });
    await prisma.restaurantTable.deleteMany({
      where: {
        name: { in: ['TEST-T1', 'TEST-T2', 'TEST-T3', 'ISO-T1'] },
      },
    });
    await prisma.zone.deleteMany({
      where: {
        name: {
          in: [
            'Test Executive Floor',
            'Test Executive Floor Updated',
            'Test Rooftop Lounge',
            'Empty Deletable Zone',
            'Other Zone',
          ],
        },
      },
    });
    await prisma.user.deleteMany({
      where: { username: { in: ['table_test_waiter', 'other_owner'] } },
    });
    await prisma.role.deleteMany({
      where: { restaurantId: otherRestaurantId },
    });
    await prisma.restaurant.deleteMany({
      where: { id: otherRestaurantId },
    });
  });

  // ===========================================================================
  // 1. Zone Management
  // ===========================================================================
  describe('1. Seating Zone Management', () => {
    it('should create a new seating zone with tables.manage permission', async () => {
      const response = await request(app)
        .post('/api/v1/zones')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          name: 'Test Executive Floor',
          description: 'VIP Executive suites and meeting dining spaces',
          sortOrder: 10,
          isActive: true,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.zone).toMatchObject({
        name: 'Test Executive Floor',
        description: 'VIP Executive suites and meeting dining spaces',
        sortOrder: 10,
        isActive: true,
        restaurantId,
      });

      testZoneId1 = response.body.data.zone.id;

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: testZoneId1,
          action: 'ZONE_CREATED',
        },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should create a second zone for reordering tests', async () => {
      const response = await request(app)
        .post('/api/v1/zones')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          name: 'Test Rooftop Lounge',
          description: 'Open sky panoramic dining section',
          sortOrder: 20,
          isActive: true,
        });

      expect(response.status).toBe(201);
      testZoneId2 = response.body.data.zone.id;
    });

    it('should reject duplicate zone name in the same restaurant with 409 Conflict', async () => {
      const response = await request(app)
        .post('/api/v1/zones')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          name: 'Test Executive Floor', // duplicate
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('should list all zones ordered by sortOrder with tables.view permission', async () => {
      const response = await request(app)
        .get('/api/v1/zones')
        .set('Authorization', `Bearer ${waiterAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.zones.length).toBeGreaterThanOrEqual(2);
    });

    it('should get a single zone by ID', async () => {
      const response = await request(app)
        .get(`/api/v1/zones/${testZoneId1}`)
        .set('Authorization', `Bearer ${waiterAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.zone.id).toBe(testZoneId1);
      expect(response.body.data.zone.name).toBe('Test Executive Floor');
    });

    it('should update zone name and description', async () => {
      const response = await request(app)
        .patch(`/api/v1/zones/${testZoneId1}`)
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          name: 'Test Executive Floor Updated',
          description: 'Updated executive description',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.zone.name).toBe('Test Executive Floor Updated');
      expect(response.body.data.zone.description).toBe('Updated executive description');
    });

    it('should toggle zone active status', async () => {
      const response = await request(app)
        .patch(`/api/v1/zones/${testZoneId1}/status`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ isActive: false });

      expect(response.status).toBe(200);
      expect(response.body.data.zone.isActive).toBe(false);

      // Reactivate
      const reactivate = await request(app)
        .patch(`/api/v1/zones/${testZoneId1}/status`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ isActive: true });

      expect(reactivate.status).toBe(200);
      expect(reactivate.body.data.zone.isActive).toBe(true);
    });

    it('should reorder zones atomically', async () => {
      const response = await request(app)
        .patch('/api/v1/zones/reorder')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          items: [
            { id: testZoneId1, sortOrder: 50 },
            { id: testZoneId2, sortOrder: 40 },
          ],
        });

      expect(response.status).toBe(200);
      const z1 = response.body.data.zones.find((z: { id: string }) => z.id === testZoneId1);
      const z2 = response.body.data.zones.find((z: { id: string }) => z.id === testZoneId2);
      expect(z1.sortOrder).toBe(50);
      expect(z2.sortOrder).toBe(40);
    });

    it('should create and delete an empty zone', async () => {
      const createRes = await request(app)
        .post('/api/v1/zones')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          name: 'Empty Deletable Zone',
        });
      const emptyZoneId = createRes.body.data.zone.id;

      const deleteRes = await request(app)
        .delete(`/api/v1/zones/${emptyZoneId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.data.deleted).toBe(true);
    });
  });

  // ===========================================================================
  // 2. Table CRUD & Status Transitions
  // ===========================================================================
  describe('2. Table CRUD & Operational Statuses', () => {
    it('should create tables in a zone', async () => {
      const res1 = await request(app)
        .post('/api/v1/tables')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          zoneId: testZoneId1,
          name: 'TEST-T1',
          capacity: 4,
          sortOrder: 1,
        });

      expect(res1.status).toBe(201);
      expect(res1.body.data.table.name).toBe('TEST-T1');
      expect(res1.body.data.table.status).toBe('AVAILABLE');
      testTable1Id = res1.body.data.table.id;

      const res2 = await request(app)
        .post('/api/v1/tables')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          zoneId: testZoneId1,
          name: 'TEST-T2',
          capacity: 6,
          sortOrder: 2,
        });
      testTable2Id = res2.body.data.table.id;

      const res3 = await request(app)
        .post('/api/v1/tables')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          zoneId: testZoneId2,
          name: 'TEST-T3',
          capacity: 2,
          sortOrder: 1,
        });
      expect(res3.status).toBe(201);

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: testTable1Id,
          action: 'TABLE_CREATED',
        },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should reject duplicate table name in same restaurant with 409 Conflict', async () => {
      const response = await request(app)
        .post('/api/v1/tables')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          zoneId: testZoneId1,
          name: 'TEST-T1', // duplicate
          capacity: 4,
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('should reject creating table with invalid non-existent zone', async () => {
      const response = await request(app)
        .post('/api/v1/tables')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          zoneId: '00000000-0000-0000-0000-000000000000',
          name: 'INVALID-T',
          capacity: 4,
        });

      expect(response.status).toBe(400);
    });

    it('should reject deleting a zone that contains tables', async () => {
      const response = await request(app)
        .delete(`/api/v1/zones/${testZoneId1}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('containing tables');
    });

    it('should list tables with search and zone filters', async () => {
      const response = await request(app)
        .get(`/api/v1/tables?zoneId=${testZoneId1}&search=TEST`)
        .set('Authorization', `Bearer ${waiterAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.tables.length).toBe(2);
      expect(response.body.data.tables[0].name).toBe('TEST-T1');
    });

    it('should update table capacity and sortOrder', async () => {
      const response = await request(app)
        .patch(`/api/v1/tables/${testTable1Id}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          capacity: 8,
          sortOrder: 5,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.table.capacity).toBe(8);
      expect(response.body.data.table.sortOrder).toBe(5);
    });

    it('should transition table status through lifecycle (AVAILABLE -> RESERVED -> CLEANING -> AVAILABLE)', async () => {
      // 1. Set to RESERVED
      const res1 = await request(app)
        .patch(`/api/v1/tables/${testTable1Id}/status`)
        .set('Authorization', `Bearer ${waiterAccessToken}`)
        .send({ status: 'RESERVED' });
      expect(res1.status).toBe(200);
      expect(res1.body.data.table.status).toBe('RESERVED');

      // 2. Set to CLEANING
      const res2 = await request(app)
        .patch(`/api/v1/tables/${testTable1Id}/status`)
        .set('Authorization', `Bearer ${waiterAccessToken}`)
        .send({ status: 'CLEANING' });
      expect(res2.status).toBe(200);
      expect(res2.body.data.table.status).toBe('CLEANING');

      // 3. Set back to AVAILABLE
      const res3 = await request(app)
        .patch(`/api/v1/tables/${testTable1Id}/status`)
        .set('Authorization', `Bearer ${waiterAccessToken}`)
        .send({ status: 'AVAILABLE' });
      expect(res3.status).toBe(200);
      expect(res3.body.data.table.status).toBe('AVAILABLE');
    });
  });

  // ===========================================================================
  // 3. Multi-Orders / Sub-bills & Table Release Protection
  // ===========================================================================
  describe('3. Table Orders & Release Protection', () => {
    it('should open a new table order and automatically transition table to OCCUPIED', async () => {
      const response = await request(app)
        .post(`/api/v1/tables/${testTable1Id}/orders`)
        .set('Authorization', `Bearer ${waiterAccessToken}`)
        .send({
          subBillName: 'Party A - Main Order',
          guestCount: 4,
          notes: 'Near window seating preference',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.order.status).toBe('ACTIVE');
      expect(response.body.data.order.subBillName).toBe('Party A - Main Order');
      testOrderId = response.body.data.order.id;

      // Verify table automatically became OCCUPIED
      const tableCheck = await request(app)
        .get(`/api/v1/tables/${testTable1Id}`)
        .set('Authorization', `Bearer ${waiterAccessToken}`);
      expect(tableCheck.body.data.table.status).toBe('OCCUPIED');
    });

    it('should open a second independent sub-bill on the same table', async () => {
      const response = await request(app)
        .post(`/api/v1/tables/${testTable1Id}/orders`)
        .set('Authorization', `Bearer ${waiterAccessToken}`)
        .send({
          subBillName: 'Party B - Separate Bill',
          guestCount: 2,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.order.subBillName).toBe('Party B - Separate Bill');

      // Verify table has 2 active orders
      const ordersRes = await request(app)
        .get(`/api/v1/tables/${testTable1Id}/orders?activeOnly=true`)
        .set('Authorization', `Bearer ${waiterAccessToken}`);
      expect(ordersRes.status).toBe(200);
      expect(ordersRes.body.data.orders.length).toBe(2);
    });

    it('should prevent table from becoming AVAILABLE while active orders exist (Table Release Protection)', async () => {
      const response = await request(app)
        .patch(`/api/v1/tables/${testTable1Id}/status`)
        .set('Authorization', `Bearer ${waiterAccessToken}`)
        .send({ status: 'AVAILABLE' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
      expect(response.body.error.message).toContain('active order');
    });

    it('should close table orders and allow table release after settling', async () => {
      // 1. Close first order
      const close1 = await request(app)
        .patch(`/api/v1/tables/${testTable1Id}/orders/${testOrderId}/status`)
        .set('Authorization', `Bearer ${waiterAccessToken}`)
        .send({ status: 'CLOSED' });
      expect(close1.status).toBe(200);
      expect(close1.body.data.order.status).toBe('CLOSED');

      // 2. Fetch second order ID and close it
      const activeOrders = await request(app)
        .get(`/api/v1/tables/${testTable1Id}/orders?activeOnly=true`)
        .set('Authorization', `Bearer ${waiterAccessToken}`);
      const secondOrdId = activeOrders.body.data.orders[0].id;

      const close2 = await request(app)
        .patch(`/api/v1/tables/${testTable1Id}/orders/${secondOrdId}/status`)
        .set('Authorization', `Bearer ${waiterAccessToken}`)
        .send({ status: 'CLOSED' });
      expect(close2.status).toBe(200);

      // 3. Now releasing table to AVAILABLE should succeed
      const releaseRes = await request(app)
        .patch(`/api/v1/tables/${testTable1Id}/status`)
        .set('Authorization', `Bearer ${waiterAccessToken}`)
        .send({ status: 'AVAILABLE' });

      expect(releaseRes.status).toBe(200);
      expect(releaseRes.body.data.table.status).toBe('AVAILABLE');
    });
  });

  // ===========================================================================
  // 4. Table Transfers & Merges
  // ===========================================================================
  describe('4. Table Transfers & Merges', () => {
    it('should atomically transfer active table orders from Table 1 to Table 2', async () => {
      // 1. Open order on Table 1
      await request(app)
        .post(`/api/v1/tables/${testTable1Id}/orders`)
        .set('Authorization', `Bearer ${waiterAccessToken}`)
        .send({
          subBillName: 'Transferable Party',
          guestCount: 3,
        });

      // 2. Transfer from Table 1 to Table 2
      const transferRes = await request(app)
        .post('/api/v1/tables/transfer')
        .set('Authorization', `Bearer ${waiterAccessToken}`)
        .send({
          fromTableId: testTable1Id,
          toTableId: testTable2Id,
          targetStatus: 'OCCUPIED',
        });

      expect(transferRes.status).toBe(200);
      expect(transferRes.body.data.transferredOrdersCount).toBe(1);
      expect(transferRes.body.data.fromTable.status).toBe('AVAILABLE');
      expect(transferRes.body.data.toTable.status).toBe('OCCUPIED');

      // Verify Table 2 now holds the active order
      const t2Orders = await request(app)
        .get(`/api/v1/tables/${testTable2Id}/orders?activeOnly=true`)
        .set('Authorization', `Bearer ${waiterAccessToken}`);
      expect(t2Orders.body.data.orders.length).toBe(1);
      expect(t2Orders.body.data.orders[0].subBillName).toBe('Transferable Party');

      // Verify Table 1 has 0 active orders
      const t1Orders = await request(app)
        .get(`/api/v1/tables/${testTable1Id}/orders?activeOnly=true`)
        .set('Authorization', `Bearer ${waiterAccessToken}`);
      expect(t1Orders.body.data.orders.length).toBe(0);

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          action: 'TABLE_TRANSFERRED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should merge multiple tables together under a primary table', async () => {
      const mergeRes = await request(app)
        .post('/api/v1/tables/merge')
        .set('Authorization', `Bearer ${waiterAccessToken}`)
        .send({
          primaryTableId: testTable2Id,
          secondaryTableIds: [testTable1Id],
        });

      expect(mergeRes.status).toBe(200);
      expect(mergeRes.body.data.primaryTable.status).toBe('OCCUPIED');

      // Check Table 1 has mergedIntoTableId set to Table 2
      const t1Check = await request(app)
        .get(`/api/v1/tables/${testTable1Id}`)
        .set('Authorization', `Bearer ${waiterAccessToken}`);
      expect(t1Check.body.data.table.mergedIntoTableId).toBe(testTable2Id);
      expect(t1Check.body.data.table.isMerged).toBe(true);

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          action: 'TABLES_MERGED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should unmerge tables and restore secondary table status', async () => {
      const unmergeRes = await request(app)
        .post(`/api/v1/tables/${testTable1Id}/unmerge`)
        .set('Authorization', `Bearer ${waiterAccessToken}`);

      expect(unmergeRes.status).toBe(200);
      expect(unmergeRes.body.data.unmerged).toBe(true);

      const t1Check = await request(app)
        .get(`/api/v1/tables/${testTable1Id}`)
        .set('Authorization', `Bearer ${waiterAccessToken}`);
      expect(t1Check.body.data.table.mergedIntoTableId).toBeNull();
      expect(t1Check.body.data.table.status).toBe('AVAILABLE');
    });
  });

  // ===========================================================================
  // 5. POS Floor Layout View & Realtime Payloads
  // ===========================================================================
  describe('5. POS Floor Layout View (GET /api/v1/tables/pos-view)', () => {
    it('should return complete structured floor layout with summaries and active orders', async () => {
      const response = await request(app)
        .get('/api/v1/tables/pos-view')
        .set('Authorization', `Bearer ${waiterAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.restaurantId).toBe(restaurantId);
      expect(response.body.data).toHaveProperty('summary');
      expect(response.body.data.summary.totalZones).toBeGreaterThanOrEqual(2);
      expect(Array.isArray(response.body.data.zones)).toBe(true);

      const targetZone = response.body.data.zones.find((z: { id: string }) => z.id === testZoneId1);
      expect(targetZone).toBeDefined();
      expect(targetZone.tables.length).toBeGreaterThanOrEqual(2);

      const table2 = targetZone.tables.find((t: { id: string }) => t.id === testTable2Id);
      expect(table2).toBeDefined();
      expect(table2.status).toBe('OCCUPIED');
      expect(table2.activeOrders.length).toBe(1);
    });
  });

  // ===========================================================================
  // 6. Tenant Isolation
  // ===========================================================================
  describe('6. Multi-Tenant Isolation', () => {
    it('should strictly isolate tables and zones between different restaurants', async () => {
      // 1. Create zone and table in other restaurant
      const otherZone = await prisma.zone.create({
        data: {
          restaurantId: otherRestaurantId,
          name: 'Other Zone',
        },
      });

      const otherTable = await prisma.restaurantTable.create({
        data: {
          restaurantId: otherRestaurantId,
          zoneId: otherZone.id,
          name: 'ISO-T1',
        },
      });

      // 2. Primary restaurant user attempting to fetch other restaurant table should receive 404
      const crossFetch = await request(app)
        .get(`/api/v1/tables/${otherTable.id}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`);
      expect(crossFetch.status).toBe(404);

      // 3. Primary restaurant user attempting to transfer to other restaurant table should receive 404
      const crossTransfer = await request(app)
        .post('/api/v1/tables/transfer')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          fromTableId: testTable2Id,
          toTableId: otherTable.id,
        });
      expect(crossTransfer.status).toBe(404);

      // 4. Other restaurant user fetching their own table should succeed
      const ownFetch = await request(app)
        .get(`/api/v1/tables/${otherTable.id}`)
        .set('Authorization', `Bearer ${otherOwnerAccessToken}`);
      expect(ownFetch.status).toBe(200);
      expect(ownFetch.body.data.table.name).toBe('ISO-T1');
    });
  });
});
