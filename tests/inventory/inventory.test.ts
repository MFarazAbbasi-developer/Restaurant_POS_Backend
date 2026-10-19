import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

describe('FARMAX POS - Inventory & Stock Management Module Tests', () => {
  let restaurantAId: string;
  let restaurantBId: string;

  let _ownerAToken: string;
  let managerAToken: string;
  let cashierAToken: string;
  let tenantBToken: string;

  let locationKitchenId: string;
  let locationColdRoomId: string;
  let supplierId: string;

  let itemBeefId: string;
  let itemBunId: string;
  let itemCheeseId: string;

  let categoryId: string;
  let menuBurgerId: string;
  let variantDoubleId: string;
  let modifierExtraCheeseId: string;

  beforeAll(async () => {
    // 1. Create Dedicated Suite-Isolated Restaurant A
    const restaurantA = await prisma.restaurant.create({
      data: {
        name: 'Faraz Inventory Flagship',
        slug: 'faraz-inventory-suite-' + Date.now(),
        currency: 'USD',
        taxRate: 10.0,
        taxInclusive: false,
      },
    });
    restaurantAId = restaurantA.id;

    // 2. Create Restaurant B for isolation tests
    const restaurantB = await prisma.restaurant.create({
      data: {
        name: 'Faraz Branch Inventory Test',
        slug: 'faraz-branch-inventory-' + Date.now(),
        currency: 'PKR',
      },
    });
    restaurantBId = restaurantB.id;

    // 3. Setup Roles & Permissions for Restaurant A
    const ownerRoleA = await prisma.role.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Owner Role A',
        isSystem: true,
      },
    });
    const managerRoleA = await prisma.role.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Manager Role A',
        isSystem: true,
      },
    });
    const cashierRoleA = await prisma.role.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Cashier Role A',
        isSystem: true,
      },
    });

    const allPermissions = await prisma.permission.findMany();
    await prisma.rolePermission.createMany({
      data: allPermissions.map((p) => ({
        roleId: ownerRoleA.id,
        permissionId: p.id,
      })),
    });

    const managerPermKeys = [
      'orders.view',
      'orders.create',
      'orders.update',
      'orders.void',
      'inventory.view',
      'inventory.manage',
      'inventory.adjust',
      'inventory.receive',
      'inventory.transfer',
      'inventory.waste',
    ];
    const managerPerms = allPermissions.filter((p) => managerPermKeys.includes(p.key));
    await prisma.rolePermission.createMany({
      data: managerPerms.map((p) => ({
        roleId: managerRoleA.id,
        permissionId: p.id,
      })),
    });

    const cashierPermKeys = ['orders.view', 'orders.create'];
    const cashierPerms = allPermissions.filter((p) => cashierPermKeys.includes(p.key));
    await prisma.rolePermission.createMany({
      data: cashierPerms.map((p) => ({
        roleId: cashierRoleA.id,
        permissionId: p.id,
      })),
    });

    // 4. Setup Roles & Permissions for Restaurant B
    const ownerRoleB = await prisma.role.create({
      data: {
        restaurantId: restaurantBId,
        name: 'Owner Role B',
        isSystem: true,
      },
    });
    await prisma.rolePermission.createMany({
      data: allPermissions.map((p) => ({
        roleId: ownerRoleB.id,
        permissionId: p.id,
      })),
    });

    // 5. Create Users
    const pinHash = await bcrypt.hash('1234', 10);
    const ownerAUser = await prisma.user.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Owner Faraz',
        username: 'owner_inventory_' + Date.now(),
        pinHash,
      },
    });
    await prisma.userRole.create({
      data: { userId: ownerAUser.id, roleId: ownerRoleA.id },
    });

    const managerAUser = await prisma.user.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Manager John',
        username: 'manager_inventory_' + Date.now(),
        pinHash,
      },
    });
    await prisma.userRole.create({
      data: { userId: managerAUser.id, roleId: managerRoleA.id },
    });

    const cashierAUser = await prisma.user.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Cashier Sarah',
        username: 'cashier_inventory_' + Date.now(),
        pinHash,
      },
    });
    await prisma.userRole.create({
      data: { userId: cashierAUser.id, roleId: cashierRoleA.id },
    });

    const ownerBUser = await prisma.user.create({
      data: {
        restaurantId: restaurantBId,
        name: 'Owner Branch B',
        username: 'owner_branch_inv_' + Date.now(),
        pinHash,
      },
    });
    await prisma.userRole.create({
      data: { userId: ownerBUser.id, roleId: ownerRoleB.id },
    });

    // 6. Login and acquire JWTs
    const ownerLogin = await request(app).post('/api/v1/auth/login').send({
      username: ownerAUser.username,
      pin: '1234',
    });
    _ownerAToken = ownerLogin.body.data.accessToken;

    const managerLogin = await request(app).post('/api/v1/auth/login').send({
      username: managerAUser.username,
      pin: '1234',
    });
    managerAToken = managerLogin.body.data.accessToken;

    const cashierLogin = await request(app).post('/api/v1/auth/login').send({
      username: cashierAUser.username,
      pin: '1234',
    });
    cashierAToken = cashierLogin.body.data.accessToken;

    const tenantBLogin = await request(app).post('/api/v1/auth/login').send({
      username: ownerBUser.username,
      pin: '1234',
    });
    tenantBToken = tenantBLogin.body.data.accessToken;

    // 7. Seed Menu Item, Variant, and Modifier Group for Recipe Testing
    const cat = await prisma.category.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Burgers',
      },
    });
    categoryId = cat.id;

    const burger = await prisma.menuItem.create({
      data: {
        restaurantId: restaurantAId,
        categoryId,
        itemCode: 'BURGER-CLS',
        name: 'Classic Gourmet Burger',
        basePrice: 12.0,
      },
    });
    menuBurgerId = burger.id;

    const variant = await prisma.menuItemVariant.create({
      data: {
        menuItemId: menuBurgerId,
        name: 'Double Patty Monster',
        price: 18.0,
      },
    });
    variantDoubleId = variant.id;

    const modGroup = await prisma.modifierGroup.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Add-Ons',
        selectionType: 'MULTIPLE',
      },
    });
    await prisma.menuItemModifierGroup.create({
      data: {
        menuItemId: menuBurgerId,
        modifierGroupId: modGroup.id,
      },
    });

    const modChoice = await prisma.modifier.create({
      data: {
        modifierGroupId: modGroup.id,
        name: 'Extra Cheddar Slice',
        priceAdjustment: 2.0,
      },
    });
    modifierExtraCheeseId = modChoice.id;
  });

  // ---------------------------------------------------------------------------
  // 1. Stock Location Management
  // ---------------------------------------------------------------------------
  describe('1. Stock Location Management', () => {
    it('should create storage locations and enforce single default location', async () => {
      const res1 = await request(app)
        .post('/api/v1/inventory/locations')
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          name: 'Main Kitchen Pantry',
          code: 'KITCHEN_MAIN',
          isDefault: true,
        });

      expect(res1.status).toBe(201);
      expect(res1.body.data.location.name).toBe('Main Kitchen Pantry');
      expect(res1.body.data.location.isDefault).toBe(true);
      locationKitchenId = res1.body.data.location.id;

      const res2 = await request(app)
        .post('/api/v1/inventory/locations')
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          name: 'Cold Storage Room',
          code: 'COLD_ROOM',
          isDefault: true, // should unset kitchen as default
        });

      expect(res2.status).toBe(201);
      expect(res2.body.data.location.isDefault).toBe(true);
      locationColdRoomId = res2.body.data.location.id;

      // Verify list locations
      const listRes = await request(app)
        .get('/api/v1/inventory/locations')
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.locations).toHaveLength(2);
      const kitchen = listRes.body.data.locations.find(
        (l: { id: string }) => l.id === locationKitchenId,
      );
      const coldRoom = listRes.body.data.locations.find(
        (l: { id: string }) => l.id === locationColdRoomId,
      );
      expect(kitchen.isDefault).toBe(false);
      expect(coldRoom.isDefault).toBe(true);
    });

    it('should prevent duplicate location names within the same restaurant', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/locations')
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          name: 'Main Kitchen Pantry',
        });

      expect(res.status).toBe(409);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Supplier Management
  // ---------------------------------------------------------------------------
  describe('2. Supplier Management', () => {
    it('should create and list inventory suppliers', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/suppliers')
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          name: 'Metro Food Distributors',
          contactPerson: 'Kamran Ali',
          phone: '+92 300 9988776',
          email: 'orders@metrofood.com',
          address: 'Plot 45, Industrial Area, Islamabad',
          taxNumber: 'STRN-998877',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.supplier.name).toBe('Metro Food Distributors');
      supplierId = res.body.data.supplier.id;

      const listRes = await request(app)
        .get('/api/v1/inventory/suppliers')
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.suppliers.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Inventory Items CRUD & Ledger Initialization
  // ---------------------------------------------------------------------------
  describe('3. Inventory Items & Opening Stock', () => {
    it('should create inventory items and log opening balance in movement ledger', async () => {
      // 1. Minced Beef (Opening stock: 50.0 KG, Cost: $12.0/KG, MinStock: 15.0 KG)
      const beefRes = await request(app)
        .post('/api/v1/inventory/items')
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          itemCode: 'RAW-BEEF-01',
          name: 'Premium Minced Beef',
          unit: 'KG',
          costPerUnit: 12.0,
          currentStock: 50.0,
          minStockLevel: 15.0,
          targetStockLevel: 100.0,
          locationId: locationColdRoomId,
          supplierId,
        });

      expect(beefRes.status).toBe(201);
      expect(beefRes.body.data.item.currentStock).toBe(50.0);
      expect(beefRes.body.data.item.costPerUnit).toBe(12.0);
      itemBeefId = beefRes.body.data.item.id;

      // 2. Burger Buns (Opening stock: 100 PCS, Cost: $0.50/PCS, MinStock: 30 PCS)
      const bunRes = await request(app)
        .post('/api/v1/inventory/items')
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          itemCode: 'RAW-BUN-01',
          name: 'Brioche Burger Buns',
          unit: 'PCS',
          costPerUnit: 0.5,
          currentStock: 100.0,
          minStockLevel: 30.0,
          targetStockLevel: 200.0,
          locationId: locationKitchenId,
          supplierId,
        });

      expect(bunRes.status).toBe(201);
      itemBunId = bunRes.body.data.item.id;

      // 3. Cheddar Cheese (Opening stock: 20.0 KG, Cost: $8.0/KG, MinStock: 5.0 KG)
      const cheeseRes = await request(app)
        .post('/api/v1/inventory/items')
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          itemCode: 'RAW-CHEESE-01',
          name: 'Cheddar Cheese Block',
          unit: 'KG',
          costPerUnit: 8.0,
          currentStock: 20.0,
          minStockLevel: 5.0,
          targetStockLevel: 40.0,
          locationId: locationColdRoomId,
          supplierId,
        });

      expect(cheeseRes.status).toBe(201);
      itemCheeseId = cheeseRes.body.data.item.id;

      // Verify opening stock movement in ledger for beef
      const ledgerRes = await request(app)
        .get(`/api/v1/inventory/ledger?inventoryItemId=${itemBeefId}`)
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(ledgerRes.status).toBe(200);
      expect(ledgerRes.body.data.movements).toHaveLength(1);
      const openingMov = ledgerRes.body.data.movements[0];
      expect(openingMov.type).toBe('ADJUSTMENT_INCREASE');
      expect(openingMov.quantityChange).toBe(50.0);
      expect(openingMov.balanceAfter).toBe(50.0);
      expect(openingMov.referenceType).toBe('INITIAL_STOCK');
    });

    it('should list inventory items with search and pagination', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/items?search=Beef')
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].name).toBe('Premium Minced Beef');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Recipes & Bill of Materials (BOM)
  // ---------------------------------------------------------------------------
  describe('4. Recipes & Bill of Materials (BOM)', () => {
    it('should link recipe ingredients to menu item, variant, and modifier', async () => {
      // 1. Classic Burger base recipe: 0.150 KG Beef + 1 PCS Bun + 0.050 KG Cheese
      const rec1 = await request(app)
        .post('/api/v1/inventory/recipes')
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          menuItemId: menuBurgerId,
          inventoryItemId: itemBeefId,
          quantity: 0.15,
          wastePercentage: 0,
        });
      expect(rec1.status).toBe(201);

      const rec2 = await request(app)
        .post('/api/v1/inventory/recipes')
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          menuItemId: menuBurgerId,
          inventoryItemId: itemBunId,
          quantity: 1.0,
          wastePercentage: 0,
        });
      expect(rec2.status).toBe(201);

      const rec3 = await request(app)
        .post('/api/v1/inventory/recipes')
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          menuItemId: menuBurgerId,
          inventoryItemId: itemCheeseId,
          quantity: 0.05,
          wastePercentage: 0,
        });
      expect(rec3.status).toBe(201);

      // 2. Double Monster Variant recipe: 0.300 KG Beef (override base portion) + 1 PCS Bun
      const rec4 = await request(app)
        .post('/api/v1/inventory/recipes')
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          variantId: variantDoubleId,
          inventoryItemId: itemBeefId,
          quantity: 0.3,
          wastePercentage: 0,
        });
      expect(rec4.status).toBe(201);

      // 3. Extra Cheddar Modifier recipe: 0.050 KG Cheese
      const rec5 = await request(app)
        .post('/api/v1/inventory/recipes')
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          modifierId: modifierExtraCheeseId,
          inventoryItemId: itemCheeseId,
          quantity: 0.05,
          wastePercentage: 0,
        });
      expect(rec5.status).toBe(201);

      // Verify retrieval of all recipes linked to burger
      const getRes = await request(app)
        .get(`/api/v1/inventory/recipes/menu-item/${menuBurgerId}`)
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.recipes).toHaveLength(5);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Purchase Receiving / Supplier Deliveries
  // ---------------------------------------------------------------------------
  describe('5. Purchase Orders & Stock Receiving', () => {
    it('should receive supplier purchase order and increment stock in ledger', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/purchases')
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          supplierId,
          locationId: locationColdRoomId,
          invoiceNumber: 'INV-METRO-991',
          notes: 'Weekly fresh meat & cheese bulk delivery',
          items: [
            { inventoryItemId: itemBeefId, quantity: 20.0, unitCost: 11.5 }, // 20 KG @ $11.50 = $230.00
            { inventoryItemId: itemCheeseId, quantity: 10.0, unitCost: 7.8 }, // 10 KG @ $7.80 = $78.00
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.purchaseOrder.totalCost).toBe(308.0);
      expect(res.body.data.purchaseOrder.orderNumber).toMatch(/^PO-\d{8}-\d{3}$/);

      // Verify Beef Stock: 50.0 + 20.0 = 70.0 KG, unit cost updated to 11.50
      const beefRes = await request(app)
        .get(`/api/v1/inventory/items/${itemBeefId}`)
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(beefRes.body.data.item.currentStock).toBe(70.0);
      expect(beefRes.body.data.item.costPerUnit).toBe(11.5);

      // Verify Cheese Stock: 20.0 + 10.0 = 30.0 KG, unit cost updated to 7.80
      const cheeseRes = await request(app)
        .get(`/api/v1/inventory/items/${itemCheeseId}`)
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(cheeseRes.body.data.item.currentStock).toBe(30.0);
      expect(cheeseRes.body.data.item.costPerUnit).toBe(7.8);

      // Verify Ledger Movement for Beef
      const ledgerRes = await request(app)
        .get(`/api/v1/inventory/ledger?inventoryItemId=${itemBeefId}`)
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(ledgerRes.body.data.movements).toHaveLength(2);
      const purchaseMov = ledgerRes.body.data.movements[0];
      expect(purchaseMov.type).toBe('PURCHASE_RECEIPT');
      expect(purchaseMov.quantityChange).toBe(20.0);
      expect(purchaseMov.balanceAfter).toBe(70.0);
      expect(purchaseMov.unitCost).toBe(11.5);
      expect(purchaseMov.totalCost).toBe(230.0);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Automatic Stock Consumption on Order Creation
  // ---------------------------------------------------------------------------
  describe('6. Automatic Stock Consumption on Order Creation', () => {
    it('should automatically deduct stock for items, variants, and modifiers upon order creation', async () => {
      // Create Order:
      // - 2x Classic Burgers (2 * 0.150kg = 0.300kg Beef, 2 * 1 = 2 Buns, 2 * 0.050kg = 0.100kg Cheese)
      // - 1x Double Monster Burger with Extra Cheese (1 * 0.300kg = 0.300kg Beef, 1 * 0.050kg Modifier Cheese = 0.050kg Cheese)
      // Total consumption expected:
      // Beef: 0.300 + 0.300 = 0.600 KG (70.0 - 0.600 = 69.400 KG)
      // Buns: 2 PCS (100 - 2 = 98 PCS)
      // Cheese: 0.100 + 0.050 = 0.150 KG (30.0 - 0.150 = 29.850 KG)
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({
          orderType: 'TAKEAWAY',
          items: [
            {
              menuItemId: menuBurgerId,
              quantity: 2,
            },
            {
              menuItemId: menuBurgerId,
              variantId: variantDoubleId,
              quantity: 1,
              modifierIds: [modifierExtraCheeseId],
            },
          ],
        });

      expect(orderRes.status).toBe(201);
      const orderId = orderRes.body.data.order.id;

      // Verify Stock Balances
      const beef = await request(app)
        .get(`/api/v1/inventory/items/${itemBeefId}`)
        .set('Authorization', `Bearer ${managerAToken}`);
      expect(beef.body.data.item.currentStock).toBe(69.4);

      const bun = await request(app)
        .get(`/api/v1/inventory/items/${itemBunId}`)
        .set('Authorization', `Bearer ${managerAToken}`);
      expect(bun.body.data.item.currentStock).toBe(98.0);

      const cheese = await request(app)
        .get(`/api/v1/inventory/items/${itemCheeseId}`)
        .set('Authorization', `Bearer ${managerAToken}`);
      expect(cheese.body.data.item.currentStock).toBe(29.85);

      // Verify Ledger Movement for Sale Consumption
      const ledgerRes = await request(app)
        .get(`/api/v1/inventory/ledger?inventoryItemId=${itemBeefId}`)
        .set('Authorization', `Bearer ${managerAToken}`);

      const saleMov = ledgerRes.body.data.movements.find(
        (m: { referenceId: string }) => m.referenceId === orderId,
      );
      expect(saleMov).toBeDefined();
      expect(saleMov.type).toBe('SALE_CONSUMPTION');
      expect(saleMov.quantityChange).toBe(-0.6);
      expect(saleMov.balanceAfter).toBe(69.4);
    });
  });

  // ---------------------------------------------------------------------------
  // 6b. Automatic Stock Reversal on Order / Item Void
  // ---------------------------------------------------------------------------
  describe('6b. Automatic Stock Reversal on Order / Item Void', () => {
    it('should automatically restore stock when a PENDING item is voided', async () => {
      // 1. Create Order with 1x Classic Burger (Deducts 0.150kg Beef, 1 Bun, 0.050kg Cheese)
      // Current stock before order: Beef 69.4, Bun 98, Cheese 29.85
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({
          orderType: 'TAKEAWAY',
          items: [{ menuItemId: menuBurgerId, quantity: 1 }],
        });

      expect(orderRes.status).toBe(201);
      const order = orderRes.body.data.order;
      const orderId = order.id;
      const itemId = order.items[0].id;

      // Stock deducted: Beef: 69.4 - 0.150 = 69.25, Bun: 98 - 1 = 97, Cheese: 29.85 - 0.05 = 29.80
      const beefAfterOrder = await request(app)
        .get(`/api/v1/inventory/items/${itemBeefId}`)
        .set('Authorization', `Bearer ${managerAToken}`);
      expect(beefAfterOrder.body.data.item.currentStock).toBe(69.25);

      // 2. Void the pending item
      const voidRes = await request(app)
        .post(`/api/v1/orders/${orderId}/items/${itemId}/void`)
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({ voidReason: 'Customer changed mind before kitchen prep' });

      expect(voidRes.status).toBe(200);

      // 3. Verify Stock is Restored: Beef back to 69.4, Bun back to 98, Cheese back to 29.85
      const beefAfterVoid = await request(app)
        .get(`/api/v1/inventory/items/${itemBeefId}`)
        .set('Authorization', `Bearer ${managerAToken}`);
      expect(beefAfterVoid.body.data.item.currentStock).toBe(69.4);

      const bunAfterVoid = await request(app)
        .get(`/api/v1/inventory/items/${itemBunId}`)
        .set('Authorization', `Bearer ${managerAToken}`);
      expect(bunAfterVoid.body.data.item.currentStock).toBe(98.0);

      const cheeseAfterVoid = await request(app)
        .get(`/api/v1/inventory/items/${itemCheeseId}`)
        .set('Authorization', `Bearer ${managerAToken}`);
      expect(cheeseAfterVoid.body.data.item.currentStock).toBe(29.85);

      // 4. Verify ORDER_VOID_RETURN movement in Ledger
      const ledgerRes = await request(app)
        .get(`/api/v1/inventory/ledger?inventoryItemId=${itemBeefId}`)
        .set('Authorization', `Bearer ${managerAToken}`);

      const voidMov = ledgerRes.body.data.movements.find(
        (m: { type: string; referenceId: string }) =>
          m.type === 'ORDER_VOID_RETURN' && m.referenceId === itemId,
      );
      expect(voidMov).toBeDefined();
      expect(voidMov.quantityChange).toBe(0.15);
      expect(voidMov.balanceAfter).toBe(69.4);
    });

    it('should NOT restore stock when voiding an item that is already PREPARING or READY in kitchen', async () => {
      // 1. Create Order with 1x Classic Burger
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({
          orderType: 'DINE_IN',
          items: [{ menuItemId: menuBurgerId, quantity: 1 }],
        });

      const order = orderRes.body.data.order;
      const orderId = order.id;
      const itemId = order.items[0].id;

      // Current Beef: 69.4 - 0.150 = 69.25
      const beefAfterOrder = await request(app)
        .get(`/api/v1/inventory/items/${itemBeefId}`)
        .set('Authorization', `Bearer ${managerAToken}`);
      expect(beefAfterOrder.body.data.item.currentStock).toBe(69.25);

      // 2. Kitchen starts cooking (status becomes PREPARING)
      await prisma.orderItem.update({
        where: { id: itemId },
        data: { kitchenStatus: 'PREPARING' },
      });

      // 3. Void the item
      const voidRes = await request(app)
        .post(`/api/v1/orders/${orderId}/items/${itemId}/void`)
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({ voidReason: 'Food burnt or dropped during cooking' });

      expect(voidRes.status).toBe(200);

      // 4. Verify stock is NOT restored because ingredients were already physically used/wasted
      const beefAfterVoid = await request(app)
        .get(`/api/v1/inventory/items/${itemBeefId}`)
        .set('Authorization', `Bearer ${managerAToken}`);
      expect(beefAfterVoid.body.data.item.currentStock).toBe(69.25); // Unchanged at 69.25

      // Re-adjust beef stock back to 69.4 for subsequent test consistency
      await prisma.inventoryItem.update({
        where: { id: itemBeefId },
        data: { currentStock: 69.4 },
      });
    });

    it('should automatically restore stock for all pending items when an entire order is voided', async () => {
      // 1. Create Order with 2 items
      const orderRes = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({
          orderType: 'TAKEAWAY',
          items: [
            { menuItemId: menuBurgerId, quantity: 2 }, // 2x 0.150 = 0.300kg Beef
          ],
        });

      const order = orderRes.body.data.order;
      const orderId = order.id;

      // Beef: 69.4 - 0.300 = 69.10
      const beefAfterOrder = await request(app)
        .get(`/api/v1/inventory/items/${itemBeefId}`)
        .set('Authorization', `Bearer ${managerAToken}`);
      expect(beefAfterOrder.body.data.item.currentStock).toBe(69.1);

      // 2. Void entire order
      const voidRes = await request(app)
        .post(`/api/v1/orders/${orderId}/void`)
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({ voidReason: 'Customer canceled whole takeaway before prep' });

      expect(voidRes.status).toBe(200);

      // 3. Verify stock is fully restored
      const beefAfterVoid = await request(app)
        .get(`/api/v1/inventory/items/${itemBeefId}`)
        .set('Authorization', `Bearer ${managerAToken}`);
      expect(beefAfterVoid.body.data.item.currentStock).toBe(69.4);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Physical Stock Count Adjustments
  // ---------------------------------------------------------------------------
  describe('7. Physical Stock Count Adjustments', () => {
    it('should reconcile physical inventory counts and record variance in ledger', async () => {
      // Physical count audit:
      // Beef counted: 65.0 KG (system was 69.4 KG => -4.4 KG difference / shortage)
      // Buns counted: 105 PCS (system was 98 PCS => +7 PCS difference / surplus)
      const adjRes = await request(app)
        .post('/api/v1/inventory/adjustments')
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          locationId: locationColdRoomId,
          reason: 'End-of-month kitchen inventory audit',
          items: [
            { inventoryItemId: itemBeefId, actualStock: 65.0 },
            { inventoryItemId: itemBunId, actualStock: 105.0 },
          ],
        });

      expect(adjRes.status).toBe(201);
      expect(adjRes.body.data.adjustment.adjustmentNumber).toMatch(/^ADJ-\d{8}-\d{3}$/);
      expect(adjRes.body.data.adjustment.items).toHaveLength(2);

      // Beef item check
      const beefAdj = adjRes.body.data.adjustment.items.find(
        (i: { inventoryItemId: string }) => i.inventoryItemId === itemBeefId,
      );
      expect(beefAdj.previousStock).toBe(69.4);
      expect(beefAdj.actualStock).toBe(65.0);
      expect(beefAdj.difference).toBe(-4.4);

      // Verify item updated
      const beef = await request(app)
        .get(`/api/v1/inventory/items/${itemBeefId}`)
        .set('Authorization', `Bearer ${managerAToken}`);
      expect(beef.body.data.item.currentStock).toBe(65.0);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Stock Wastage & Spoilage
  // ---------------------------------------------------------------------------
  describe('8. Stock Wastage & Spoilage', () => {
    it('should record spoiled or expired stock with reason and reduce inventory', async () => {
      // Record 5.0 KG of spoiled beef @ $11.50 = $57.50
      const wstRes = await request(app)
        .post('/api/v1/inventory/wastage')
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          locationId: locationColdRoomId,
          reason: 'SPOILED',
          notes: 'Power breakdown spoiled lower shelf',
          items: [
            {
              inventoryItemId: itemBeefId,
              quantity: 5.0,
              itemReason: 'Expired before prep cycle',
            },
          ],
        });

      expect(wstRes.status).toBe(201);
      expect(wstRes.body.data.wastage.wastageNumber).toMatch(/^WST-\d{8}-\d{3}$/);
      expect(wstRes.body.data.wastage.totalWastedValue).toBe(57.5);

      // Verify beef stock: 65.0 - 5.0 = 60.0 KG
      const beef = await request(app)
        .get(`/api/v1/inventory/items/${itemBeefId}`)
        .set('Authorization', `Bearer ${managerAToken}`);
      expect(beef.body.data.item.currentStock).toBe(60.0);

      // Verify ledger entry
      const ledgerRes = await request(app)
        .get(`/api/v1/inventory/ledger?inventoryItemId=${itemBeefId}&type=WASTAGE`)
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(ledgerRes.status).toBe(200);
      expect(ledgerRes.body.data.movements.length).toBeGreaterThanOrEqual(1);
      expect(ledgerRes.body.data.movements[0].quantityChange).toBe(-5.0);
      expect(ledgerRes.body.data.movements[0].balanceAfter).toBe(60.0);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Stock Transfers Between Locations
  // ---------------------------------------------------------------------------
  describe('9. Stock Transfers Between Locations', () => {
    it('should transfer stock between locations and create dual ledger movements', async () => {
      // Transfer 10.0 KG Beef from Cold Room to Main Kitchen
      const trfRes = await request(app)
        .post('/api/v1/inventory/transfers')
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          fromLocationId: locationColdRoomId,
          toLocationId: locationKitchenId,
          notes: 'Daily kitchen replenishment',
          items: [{ inventoryItemId: itemBeefId, quantity: 10.0 }],
        });

      expect(trfRes.status).toBe(201);
      expect(trfRes.body.data.transfer.transferNumber).toMatch(/^TRF-\d{8}-\d{3}$/);

      // Verify ledger has TRANSFER_OUT and TRANSFER_IN
      const ledgerRes = await request(app)
        .get(`/api/v1/inventory/ledger?inventoryItemId=${itemBeefId}`)
        .set('Authorization', `Bearer ${managerAToken}`);

      const types = ledgerRes.body.data.movements.map((m: { type: string }) => m.type);
      expect(types).toContain('TRANSFER_OUT');
      expect(types).toContain('TRANSFER_IN');
    });

    it('should reject transfer when requested quantity exceeds available stock', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/transfers')
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          fromLocationId: locationColdRoomId,
          toLocationId: locationKitchenId,
          items: [{ inventoryItemId: itemBeefId, quantity: 9999.0 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Insufficient stock');
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Summaries, Low-Stock Alerts & Valuation Reports
  // ---------------------------------------------------------------------------
  describe('10. Summaries, Low-Stock & Valuation Reports', () => {
    it('should compute overall inventory valuation and low stock counts', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/summary')
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalItemsCount).toBe(3);
      expect(res.body.data.totalValuation).toBeGreaterThan(0);
      expect(res.body.data.outOfStockItemsCount).toBe(0);
    });

    it('should retrieve itemized and location-breakdown valuation report', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/valuation')
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.grandTotalValuation).toBeGreaterThan(0);
      expect(res.body.data.locationsBreakdown.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.items).toHaveLength(3);
    });

    it('should report low-stock items and recommended reorder quantities', async () => {
      // Create a depleted ingredient with currentStock below minStockLevel
      await request(app)
        .post('/api/v1/inventory/items')
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          itemCode: 'RAW-MAYO-01',
          name: 'Garlic Mayo Sauce',
          unit: 'L',
          costPerUnit: 4.5,
          currentStock: 2.0,
          minStockLevel: 10.0,
          targetStockLevel: 25.0,
          locationId: locationKitchenId,
          supplierId,
        });

      const res = await request(app)
        .get('/api/v1/inventory/low-stock')
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalLowStockItems).toBeGreaterThanOrEqual(1);

      const mayo = res.body.data.items.find(
        (i: { itemCode: string }) => i.itemCode === 'RAW-MAYO-01',
      );
      expect(mayo).toBeDefined();
      expect(mayo.currentStock).toBe(2.0);
      expect(mayo.minStockLevel).toBe(10.0);
      expect(mayo.recommendedReorderQuantity).toBe(23.0); // target 25 - stock 2
      expect(mayo.estimatedReorderCost).toBe(103.5); // 23 * 4.50
    });
  });

  // ---------------------------------------------------------------------------
  // 11. Security, RBAC & Multi-Tenant Isolation
  // ---------------------------------------------------------------------------
  describe('11. Security, RBAC & Multi-Tenant Isolation', () => {
    it('should reject unauthenticated request with HTTP 401', async () => {
      const res = await request(app).get('/api/v1/inventory/items');
      expect(res.status).toBe(401);
    });

    it('should reject staff lacking inventory permissions with HTTP 403', async () => {
      const res = await request(app)
        .post('/api/v1/inventory/items')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({
          itemCode: 'UNAUTH-01',
          name: 'Unauthorized Item',
          unit: 'PCS',
          costPerUnit: 1.0,
        });

      expect(res.status).toBe(403);
    });

    it('should ensure Tenant B receives isolated empty inventory records', async () => {
      const res = await request(app)
        .get('/api/v1/inventory/items')
        .set('Authorization', `Bearer ${tenantBToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(0);

      const summaryRes = await request(app)
        .get('/api/v1/inventory/summary')
        .set('Authorization', `Bearer ${tenantBToken}`);

      expect(summaryRes.status).toBe(200);
      expect(summaryRes.body.data.totalItemsCount).toBe(0);
      expect(summaryRes.body.data.totalValuation).toBe(0);
    });
  });
});
