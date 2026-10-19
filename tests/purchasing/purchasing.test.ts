import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

describe('FARMAX POS - Purchasing & Supplier Management Module Tests', () => {
  let restaurantAId: string;
  let restaurantBId: string;

  let _ownerAToken: string;
  let managerAToken: string;
  let cashierAToken: string;
  let tenantBToken: string;

  let locationMainStoreId: string;
  let itemBeefId: string;
  let itemChickenId: string;
  let itemFlourId: string;

  let supplierPoultryId: string;
  let supplierMeatId: string;

  beforeAll(async () => {
    // 1. Create Dedicated Suite-Isolated Restaurant A
    const restaurantA = await prisma.restaurant.create({
      data: {
        name: 'Faraz Purchasing Bistro',
        slug: 'faraz-purchasing-suite-' + Date.now(),
        currency: 'PKR',
      },
    });
    restaurantAId = restaurantA.id;

    // 2. Create Restaurant B for isolation tests
    const restaurantB = await prisma.restaurant.create({
      data: {
        name: 'Faraz Branch Purchasing Test',
        slug: 'faraz-branch-purchasing-' + Date.now(),
        currency: 'PKR',
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

    // Create MANAGER Role (has purchasing.*, suppliers.manage, inventory.*)
    const managerRole = await prisma.role.create({
      data: {
        restaurantId: restaurantAId,
        name: 'MANAGER_' + Date.now(),
        rolePermissions: {
          create: allPerms
            .filter((p) =>
              [
                'inventory.view',
                'inventory.manage',
                'inventory.receive',
                'purchasing.view',
                'purchasing.manage',
                'purchasing.receive',
                'suppliers.manage',
              ].includes(p.key),
            )
            .map((p) => ({ permissionId: p.id })),
        },
      },
    });

    // Create CASHIER Role (only has purchasing.view, purchasing.receive)
    const cashierRole = await prisma.role.create({
      data: {
        restaurantId: restaurantAId,
        name: 'CASHIER_' + Date.now(),
        rolePermissions: {
          create: allPerms
            .filter((p) =>
              ['inventory.view', 'purchasing.view', 'purchasing.receive'].includes(p.key),
            )
            .map((p) => ({ permissionId: p.id })),
        },
      },
    });

    // Create Users
    const ownerUser = await prisma.user.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Purchasing Owner',
        username: 'owner_pur_' + Date.now(),
        pinHash: defaultPinHash,
        userRoles: { create: [{ roleId: ownerRole.id }] },
      },
    });

    const managerUser = await prisma.user.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Purchasing Manager',
        username: 'manager_pur_' + Date.now(),
        pinHash: defaultPinHash,
        userRoles: { create: [{ roleId: managerRole.id }] },
      },
    });

    const cashierUser = await prisma.user.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Receiving Staff',
        username: 'cashier_pur_' + Date.now(),
        pinHash: cashierPinHash,
        userRoles: { create: [{ roleId: cashierRole.id }] },
      },
    });

    // Tenant B Setup
    const ownerBRole = await prisma.role.create({
      data: {
        restaurantId: restaurantBId,
        name: 'OWNER_B_' + Date.now(),
        rolePermissions: {
          create: allPerms.map((p) => ({ permissionId: p.id })),
        },
      },
    });

    const ownerBUser = await prisma.user.create({
      data: {
        restaurantId: restaurantBId,
        name: 'Tenant B Owner',
        username: 'tenant_b_pur_' + Date.now(),
        pinHash: defaultPinHash,
        userRoles: { create: [{ roleId: ownerBRole.id }] },
      },
    });

    // Logins
    const ownerLogin = await request(app).post('/api/v1/auth/login').send({
      username: ownerUser.username,
      pin: '1234',
    });
    _ownerAToken = `Bearer ${ownerLogin.body.data.accessToken}`;

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

    // Seed Stock Location & Inventory Items
    const location = await prisma.stockLocation.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Main Storage Room',
        isDefault: true,
      },
    });
    locationMainStoreId = location.id;

    const beef = await prisma.inventoryItem.create({
      data: {
        restaurantId: restaurantAId,
        itemCode: 'RAW-BEEF-01',
        name: 'Fresh Boneless Beef',
        unit: 'KG',
        costPerUnit: 1400.0,
        currentStock: 10.0,
        minStockLevel: 5.0,
        locationId: locationMainStoreId,
      },
    });
    itemBeefId = beef.id;

    const chicken = await prisma.inventoryItem.create({
      data: {
        restaurantId: restaurantAId,
        itemCode: 'RAW-CHK-01',
        name: 'Fresh Whole Chicken',
        unit: 'KG',
        costPerUnit: 650.0,
        currentStock: 20.0,
        minStockLevel: 10.0,
        locationId: locationMainStoreId,
      },
    });
    itemChickenId = chicken.id;

    const flour = await prisma.inventoryItem.create({
      data: {
        restaurantId: restaurantAId,
        itemCode: 'FLR-FINE-01',
        name: 'All Purpose White Flour',
        unit: 'KG',
        costPerUnit: 120.0,
        currentStock: 50.0,
        locationId: locationMainStoreId,
      },
    });
    itemFlourId = flour.id;
  });

  // ===========================================================================
  // 1. Supplier CRUD & History Tests
  // ===========================================================================
  describe('Supplier Management', () => {
    it('should create a new supplier (POST /api/v1/purchasing/suppliers)', async () => {
      const res = await request(app)
        .post('/api/v1/purchasing/suppliers')
        .set('Authorization', managerAToken)
        .send({
          name: 'Al-Madina Poultry Traders',
          contactPerson: 'Rashid Mahmood',
          phone: '+923001234567',
          email: 'rashid@almadina.pk',
          address: 'Tollinton Market, Lahore',
          taxNumber: 'NTN-8877665',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.supplier.name).toBe('Al-Madina Poultry Traders');
      supplierPoultryId = res.body.data.supplier.id;
    });

    it('should reject creating duplicate supplier with same name (409)', async () => {
      const res = await request(app)
        .post('/api/v1/purchasing/suppliers')
        .set('Authorization', managerAToken)
        .send({
          name: 'Al-Madina Poultry Traders',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('should create second supplier for meat supply', async () => {
      const res = await request(app)
        .post('/api/v1/purchasing/suppliers')
        .set('Authorization', managerAToken)
        .send({
          name: 'Punjab Halal Meats Corp',
          contactPerson: 'Malik Tariq',
          phone: '+923214567890',
        });

      expect(res.status).toBe(201);
      supplierMeatId = res.body.data.supplier.id;
    });

    it('should list suppliers with search and pagination (GET /api/v1/purchasing/suppliers)', async () => {
      const res = await request(app)
        .get('/api/v1/purchasing/suppliers')
        .query({ search: 'Poultry' })
        .set('Authorization', managerAToken);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].id).toBe(supplierPoultryId);
    });

    it('should update supplier details (PUT /api/v1/purchasing/suppliers/:id)', async () => {
      const res = await request(app)
        .put(`/api/v1/purchasing/suppliers/${supplierPoultryId}`)
        .set('Authorization', managerAToken)
        .send({
          phone: '+923009998877',
          address: 'Updated Shop 5, Tollinton Market, Lahore',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.supplier.phone).toBe('+923009998877');
    });

    it('should get supplier details (GET /api/v1/purchasing/suppliers/:id)', async () => {
      const res = await request(app)
        .get(`/api/v1/purchasing/suppliers/${supplierPoultryId}`)
        .set('Authorization', managerAToken);

      expect(res.status).toBe(200);
      expect(res.body.data.supplier.id).toBe(supplierPoultryId);
    });
  });

  // ===========================================================================
  // 2. Purchase Orders Workflow Tests
  // ===========================================================================
  describe('Purchase Orders Workflow', () => {
    let draftPoId: string;
    let standardPoId: string;
    let standardPoItem1Id: string;
    let standardPoItem2Id: string;

    it('should create a purchase order in DRAFT status (POST /api/v1/purchasing/orders)', async () => {
      const res = await request(app)
        .post('/api/v1/purchasing/orders')
        .set('Authorization', managerAToken)
        .send({
          supplierId: supplierPoultryId,
          locationId: locationMainStoreId,
          status: 'DRAFT',
          notes: 'Weekly fresh chicken procurement draft',
          items: [
            {
              inventoryItemId: itemChickenId,
              quantity: 50,
              unitCost: 620,
              taxRate: 0,
              discountRate: 0,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const po = res.body.data.purchaseOrder;
      expect(po.orderNumber).toMatch(/^PO-\d{8}-\d{3}$/);
      expect(po.status).toBe('DRAFT');
      expect(Number(po.totalAmount)).toBe(31000);
      draftPoId = po.id;
    });

    it('should update DRAFT purchase order line items and taxes (PUT /api/v1/purchasing/orders/:id)', async () => {
      const res = await request(app)
        .put(`/api/v1/purchasing/orders/${draftPoId}`)
        .set('Authorization', managerAToken)
        .send({
          notes: 'Revised quantity for festival weekend',
          items: [
            {
              inventoryItemId: itemChickenId,
              quantity: 60,
              unitCost: 600, // 36,000
              taxRate: 5, // +1,800
              discountRate: 0,
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(Number(res.body.data.purchaseOrder.subtotal)).toBe(36000);
      expect(Number(res.body.data.purchaseOrder.taxAmount)).toBe(1800);
      expect(Number(res.body.data.purchaseOrder.totalAmount)).toBe(37800);
    });

    it('should transition DRAFT to ORDERED (POST /api/v1/purchasing/orders/:id/order)', async () => {
      const res = await request(app)
        .post(`/api/v1/purchasing/orders/${draftPoId}/order`)
        .set('Authorization', managerAToken);

      expect(res.status).toBe(200);
      expect(res.body.data.purchaseOrder.status).toBe('ORDERED');
      expect(res.body.data.purchaseOrder.orderedAt).toBeDefined();
    });

    it('should create multi-item purchase order in ORDERED status directly', async () => {
      const res = await request(app)
        .post('/api/v1/purchasing/orders')
        .set('Authorization', managerAToken)
        .send({
          supplierId: supplierMeatId,
          locationId: locationMainStoreId,
          status: 'ORDERED',
          invoiceNumber: 'INV-MEAT-2026',
          items: [
            {
              inventoryItemId: itemBeefId,
              quantity: 20,
              unitCost: 1500, // 30,000
            },
            {
              inventoryItemId: itemFlourId,
              quantity: 100,
              unitCost: 110, // 11,000
            },
          ],
        });

      expect(res.status).toBe(201);
      const po = res.body.data.purchaseOrder;
      expect(po.status).toBe('ORDERED');
      expect(po.items.length).toBe(2);
      standardPoId = po.id;
      standardPoItem1Id = po.items[0].id;
      standardPoItem2Id = po.items[1].id;
    });

    // =========================================================================
    // Partial & Full Goods Receiving
    // =========================================================================
    it('should partially receive goods and update inventory stock (POST /api/v1/purchasing/orders/:id/receive)', async () => {
      const beefBefore = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemBeefId },
      });
      const beefStockBefore = Number(beefBefore.currentStock);

      const res = await request(app)
        .post(`/api/v1/purchasing/orders/${standardPoId}/receive`)
        .set('Authorization', cashierAToken)
        .send({
          invoiceNumber: 'DELIVERY-SLIP-01',
          items: [
            {
              purchaseOrderItemId: standardPoItem1Id,
              quantityReceived: 10, // 10 out of 20
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.purchaseOrder.status).toBe('PARTIALLY_RECEIVED');

      // Verify stock was incremented by 10
      const beefAfter = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemBeefId } });
      expect(Number(beefAfter.currentStock)).toBe(beefStockBefore + 10);
      expect(Number(beefAfter.costPerUnit)).toBe(1500);

      // Verify stock movement ledger was created
      const movement = await prisma.stockMovement.findFirst({
        where: {
          restaurantId: restaurantAId,
          referenceId: standardPoId,
          type: 'PURCHASE_RECEIPT',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(movement).toBeDefined();
      expect(Number(movement?.quantityChange)).toBe(10);
    });

    it('should reject receiving more than remaining ordered quantity (400)', async () => {
      // 10 already received out of 20. Attempting to receive 15 more should fail
      const res = await request(app)
        .post(`/api/v1/purchasing/orders/${standardPoId}/receive`)
        .set('Authorization', cashierAToken)
        .send({
          items: [
            {
              purchaseOrderItemId: standardPoItem1Id,
              quantityReceived: 15,
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Maximum remaining is 10');
    });

    it('should complete receiving remaining items and transition PO to RECEIVED', async () => {
      const flourBefore = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemFlourId },
      });
      const flourStockBefore = Number(flourBefore.currentStock);

      const res = await request(app)
        .post(`/api/v1/purchasing/orders/${standardPoId}/receive`)
        .set('Authorization', cashierAToken)
        .send({
          items: [
            {
              purchaseOrderItemId: standardPoItem1Id,
              quantityReceived: 10, // complete beef
            },
            {
              purchaseOrderItemId: standardPoItem2Id,
              quantityReceived: 100, // complete flour
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.purchaseOrder.status).toBe('RECEIVED');
      expect(res.body.data.purchaseOrder.receivedAt).toBeDefined();

      const flourAfter = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemFlourId },
      });
      expect(Number(flourAfter.currentStock)).toBe(flourStockBefore + 100);
      expect(Number(flourAfter.costPerUnit)).toBe(110);
    });

    it('should reject receiving on an already fully received PO (400)', async () => {
      const res = await request(app)
        .post(`/api/v1/purchasing/orders/${standardPoId}/receive`)
        .set('Authorization', cashierAToken)
        .send({
          items: [
            {
              purchaseOrderItemId: standardPoItem1Id,
              quantityReceived: 5,
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ===========================================================================
  // 3. Purchase Returns Tests
  // ===========================================================================
  describe('Purchase Returns', () => {
    let returnTargetPoId: string;
    let returnTargetPoItemId: string;

    beforeAll(async () => {
      // Create and receive PO
      const res = await request(app)
        .post('/api/v1/purchasing/orders')
        .set('Authorization', managerAToken)
        .send({
          supplierId: supplierMeatId,
          locationId: locationMainStoreId,
          status: 'RECEIVED', // Direct received
          items: [
            {
              inventoryItemId: itemBeefId,
              quantity: 15,
              unitCost: 1450,
            },
          ],
        });

      returnTargetPoId = res.body.data.purchaseOrder.id;
      returnTargetPoItemId = res.body.data.purchaseOrder.items[0].id;
    });

    it('should process purchase return for received goods and deduct inventory stock (POST /api/v1/purchasing/orders/:id/returns)', async () => {
      const beefBefore = await prisma.inventoryItem.findUniqueOrThrow({
        where: { id: itemBeefId },
      });
      const beefStockBefore = Number(beefBefore.currentStock);

      const res = await request(app)
        .post(`/api/v1/purchasing/orders/${returnTargetPoId}/returns`)
        .set('Authorization', managerAToken)
        .send({
          reason: 'Quality issue - fat percentage higher than agreed spec',
          notes: 'Driver agreed to return 5 KG and adjust invoice',
          items: [
            {
              purchaseOrderItemId: returnTargetPoItemId,
              quantity: 5,
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const pr = res.body.data.purchaseReturn;
      expect(pr.returnNumber).toMatch(/^PR-\d{8}-\d{3}$/);
      expect(Number(pr.totalRefundAmount)).toBe(5 * 1450);

      // Verify stock was deducted by 5
      const beefAfter = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemBeefId } });
      expect(Number(beefAfter.currentStock)).toBe(beefStockBefore - 5);

      // Verify stock movement of type PURCHASE_RETURN
      const movement = await prisma.stockMovement.findFirst({
        where: {
          restaurantId: restaurantAId,
          referenceId: pr.id,
          type: 'PURCHASE_RETURN',
        },
      });
      expect(movement).toBeDefined();
      expect(Number(movement?.quantityChange)).toBe(-5);
    });

    it('should reject returning more than received/returnable quantity (400)', async () => {
      // 15 received, 5 already returned. Maximum returnable is 10. Attempting 12 should fail
      const res = await request(app)
        .post(`/api/v1/purchasing/orders/${returnTargetPoId}/returns`)
        .set('Authorization', managerAToken)
        .send({
          reason: 'Excessive return attempt',
          items: [
            {
              purchaseOrderItemId: returnTargetPoItemId,
              quantity: 12,
            },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Maximum returnable received quantity is 10');
    });
  });

  // ===========================================================================
  // 4. Cancellation & Summary Analytics Tests
  // ===========================================================================
  describe('Cancellation & Summary Analytics', () => {
    it('should cancel unreceived purchase order (POST /api/v1/purchasing/orders/:id/cancel)', async () => {
      const newPo = await request(app)
        .post('/api/v1/purchasing/orders')
        .set('Authorization', managerAToken)
        .send({
          supplierId: supplierPoultryId,
          locationId: locationMainStoreId,
          status: 'ORDERED',
          items: [
            {
              inventoryItemId: itemChickenId,
              quantity: 20,
              unitCost: 650,
            },
          ],
        });

      const poId = newPo.body.data.purchaseOrder.id;

      const cancelRes = await request(app)
        .post(`/api/v1/purchasing/orders/${poId}/cancel`)
        .set('Authorization', managerAToken);

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.purchaseOrder.status).toBe('CANCELLED');
    });

    it('should reject cancelling a purchase order that has already been received (400)', async () => {
      const listRes = await request(app)
        .get('/api/v1/purchasing/orders')
        .query({ status: 'RECEIVED' })
        .set('Authorization', managerAToken);

      const receivedPoId = listRes.body.data.items[0].id;

      const res = await request(app)
        .post(`/api/v1/purchasing/orders/${receivedPoId}/cancel`)
        .set('Authorization', managerAToken);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should get purchasing summary analytics (GET /api/v1/purchasing/summary)', async () => {
      const res = await request(app)
        .get('/api/v1/purchasing/summary')
        .set('Authorization', managerAToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalOrders).toBeGreaterThanOrEqual(1);
      expect(res.body.data.totalSpend).toBeGreaterThan(0);
      expect(res.body.data.statusBreakdown).toBeDefined();
      expect(Array.isArray(res.body.data.topSuppliers)).toBe(true);
    });

    it('should get supplier purchase history and spend stats (GET /api/v1/purchasing/suppliers/:id/history)', async () => {
      const res = await request(app)
        .get(`/api/v1/purchasing/suppliers/${supplierMeatId}/history`)
        .set('Authorization', managerAToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.supplier.id).toBe(supplierMeatId);
      expect(res.body.data.summary.totalOrders).toBeGreaterThanOrEqual(1);
      expect(res.body.data.summary.totalSpent).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // 5. Tenant Isolation & RBAC Tests
  // ===========================================================================
  describe('Tenant Isolation & RBAC', () => {
    it('should prevent Tenant B from viewing or updating Tenant A supplier (404)', async () => {
      const res = await request(app)
        .get(`/api/v1/purchasing/suppliers/${supplierMeatId}`)
        .set('Authorization', tenantBToken);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should prevent Cashier from creating a purchase order without purchasing.manage permission (403)', async () => {
      const res = await request(app)
        .post('/api/v1/purchasing/orders')
        .set('Authorization', cashierAToken)
        .send({
          supplierId: supplierMeatId,
          items: [{ inventoryItemId: itemBeefId, quantity: 10, unitCost: 1500 }],
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});
