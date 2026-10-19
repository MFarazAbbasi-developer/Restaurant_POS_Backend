import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

describe('FARMAX POS - Receipt & Printing Management Module Tests', () => {
  let restaurantAId: string;
  let restaurantBId: string;

  let ownerAToken: string;
  let cashierAToken: string;
  let waiterAToken: string;
  let tenantBToken: string;

  let categoryGrillId: string;
  let categoryBeverageId: string;

  let itemBurgerId: string;
  let itemSodaId: string;
  let modGroupCheeseId: string;
  let modOptionCheddarId: string;

  let tableAId: string;
  let stationGrillId: string;

  let completedDineInOrderId: string;
  let completedTakeawayOrderId: string;
  let completedDeliveryOrderId: string;

  beforeAll(async () => {
    // 1. Create Dedicated Suite-Isolated Restaurant A
    const restaurantA = await prisma.restaurant.create({
      data: {
        name: 'Faraz Flagship Bistro',
        slug: 'faraz-receipts-suite-' + Date.now(),
        legalName: 'Faraz Flagship Bistro Pvt. Ltd.',
        phone: '+92 51 1122334',
        address: 'Plot 14-B, Blue Area, Sector F-6, Islamabad',
        taxNumber: 'NTN-99887766-1',
        receiptHeader: 'Welcome to the Premier Dining Experience',
        receiptFooter: 'Feedback: feedback@farazpos.com | WiFi: FarazGuest',
        currency: 'USD',
        taxRate: 16.0,
        taxInclusive: false,
        serviceChargeRate: 5.0,
        serviceChargeEnabled: true,
      },
    });
    restaurantAId = restaurantA.id;

    // 2. Create Restaurant B for isolation tests
    const restaurantB = await prisma.restaurant.create({
      data: {
        name: 'Faraz Branch Receipts Test',
        slug: 'faraz-branch-receipts-' + Date.now(),
        currency: 'PKR',
      },
    });
    restaurantBId = restaurantB.id;

    const defaultPinHash = await bcrypt.hash('1234', 10);
    const cashierPinHash = await bcrypt.hash('4321', 10);

    // Fetch or create permissions
    const allPerms = await prisma.permission.findMany();
    const permMap = new Map(allPerms.map((p) => [p.key, p.id]));

    // Create OWNER Role for Restaurant A
    const ownerRole = await prisma.role.create({
      data: {
        restaurantId: restaurantAId,
        name: 'OWNER_' + Date.now(),
        rolePermissions: {
          create: allPerms.map((p) => ({ permissionId: p.id })),
        },
      },
    });

    // Create CASHIER Role for Restaurant A
    const cashierRole = await prisma.role.create({
      data: {
        restaurantId: restaurantAId,
        name: 'CASHIER_' + Date.now(),
        rolePermissions: {
          create: [
            'orders.view',
            'orders.create',
            'orders.update',
            'orders.discount',
            'payments.view',
            'payments.create',
            'receipts.view',
            'receipts.reprint',
          ]
            .filter((k) => permMap.has(k))
            .map((k) => ({ permissionId: permMap.get(k)! })),
        },
      },
    });

    // Create WAITER Role for Restaurant A (lacks receipts.reprint)
    const waiterRole = await prisma.role.create({
      data: {
        restaurantId: restaurantAId,
        name: 'WAITER_' + Date.now(),
        rolePermissions: {
          create: ['orders.view', 'orders.create', 'orders.update', 'receipts.view']
            .filter((k) => permMap.has(k))
            .map((k) => ({ permissionId: permMap.get(k)! })),
        },
      },
    });

    // 3. Login Owner A
    const ownerUser = await prisma.user.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Owner Admin',
        username: 'rcp_owner_' + Date.now(),
        pinHash: defaultPinHash,
        isActive: true,
        userRoles: { create: [{ roleId: ownerRole.id }] },
      },
    });

    const ownerLogin = await request(app).post('/api/v1/auth/login').send({
      username: ownerUser.username,
      pin: '1234',
    });
    ownerAToken = ownerLogin.body.data.accessToken;

    // 4. Cashier A Login
    const cashierUser = await prisma.user.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Sarah Cashier',
        username: 'rcp_cashier_' + Date.now(),
        pinHash: cashierPinHash,
        isActive: true,
        userRoles: { create: [{ roleId: cashierRole.id }] },
      },
    });

    const cashierLogin = await request(app).post('/api/v1/auth/login').send({
      username: cashierUser.username,
      pin: '4321',
    });
    cashierAToken = cashierLogin.body.data.accessToken;

    // 5. Waiter A Login
    const waiterUser = await prisma.user.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Tony Waiter',
        username: 'rcp_waiter_' + Date.now(),
        pinHash: defaultPinHash,
        isActive: true,
        userRoles: { create: [{ roleId: waiterRole.id }] },
      },
    });

    const waiterLogin = await request(app).post('/api/v1/auth/login').send({
      username: waiterUser.username,
      pin: '1234',
    });
    waiterAToken = waiterLogin.body.data.accessToken;

    // 6. Tenant B User setup
    const roleB = await prisma.role.create({
      data: {
        restaurantId: restaurantBId,
        name: 'ROLE_B_' + Date.now(),
        rolePermissions: {
          create: [{ permissionId: permMap.get('receipts.view')! }],
        },
      },
    });

    const userB = await prisma.user.create({
      data: {
        restaurantId: restaurantBId,
        name: 'Tenant B Staff',
        username: 'rcp_tenant_b_' + Date.now(),
        pinHash: defaultPinHash,
        isActive: true,
        userRoles: { create: [{ roleId: roleB.id }] },
      },
    });

    const userBLogin = await request(app).post('/api/v1/auth/login').send({
      username: userB.username,
      pin: '1234',
    });
    tenantBToken = userBLogin.body.data.accessToken;

    // 7. Seed categories, items & modifier groups for Restaurant A
    const categoryGrill = await prisma.category.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Grill Section ' + Date.now(),
        sortOrder: 1,
      },
    });
    categoryGrillId = categoryGrill.id;

    const categoryBeverage = await prisma.category.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Cold Beverages ' + Date.now(),
        sortOrder: 2,
      },
    });
    categoryBeverageId = categoryBeverage.id;

    const itemBurger = await prisma.menuItem.create({
      data: {
        restaurantId: restaurantAId,
        categoryId: categoryGrillId,
        itemCode: 'RCP-GRL-' + Date.now(),
        name: 'Angus Gourmet Burger',
        basePrice: 20.0,
      },
    });
    itemBurgerId = itemBurger.id;

    const itemSoda = await prisma.menuItem.create({
      data: {
        restaurantId: restaurantAId,
        categoryId: categoryBeverageId,
        itemCode: 'RCP-BEV-' + Date.now(),
        name: 'Fresh Mint Lemonade',
        basePrice: 5.0,
      },
    });
    itemSodaId = itemSoda.id;

    // Create Modifier Group & Option
    const modGroup = await prisma.modifierGroup.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Cheese Add-ons ' + Date.now(),
        selectionType: 'MULTIPLE',
        minSelections: 0,
        maxSelections: 2,
      },
    });
    modGroupCheeseId = modGroup.id;

    const modOption = await prisma.modifier.create({
      data: {
        modifierGroupId: modGroupCheeseId,
        name: 'Aged Cheddar Slice',
        priceAdjustment: 2.0,
      },
    });
    modOptionCheddarId = modOption.id;

    await prisma.menuItemModifierGroup.create({
      data: {
        menuItemId: itemBurgerId,
        modifierGroupId: modGroupCheeseId,
      },
    });

    // Seating Zone & Table
    const zone = await prisma.zone.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Ground Floor ' + Date.now(),
        sortOrder: 1,
      },
    });

    const table = await prisma.restaurantTable.create({
      data: {
        restaurantId: restaurantAId,
        zoneId: zone.id,
        name: 'T-01',
        capacity: 4,
      },
    });
    tableAId = table.id;

    // Kitchen Station
    const station = await prisma.kitchenStation.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Hot Grill Station ' + Date.now(),
        code: 'GRILL',
        categories: {
          create: [{ categoryId: categoryGrillId }],
        },
      },
    });
    stationGrillId = station.id;

    // 8. Create Test Orders
    // Order 1: Dine-In Order with items, modifier, discount, and split payment
    const dineInRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${cashierAToken}`)
      .send({
        orderType: 'DINE_IN',
        tableId: tableAId,
        guestCount: 2,
        items: [
          {
            menuItemId: itemBurgerId,
            quantity: 2,
            modifierIds: [modOptionCheddarId],
            specialInstructions: 'Well done, extra pickles',
          },
          {
            menuItemId: itemSodaId,
            quantity: 2,
          },
        ],
      });
    completedDineInOrderId = dineInRes.body.data.order.id;

    // Apply Order Discount
    await request(app)
      .post(`/api/v1/orders/${completedDineInOrderId}/discount`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        discountType: 'PERCENTAGE',
        discountValue: 10,
        discountReason: 'VIP Customer Promotion',
      });

    // Make Split Payment on Dine-In Order: $30 Cash + remainder Card
    await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${cashierAToken}`)
      .send({
        orderId: completedDineInOrderId,
        paymentMethod: 'CASH',
        amount: 30.0,
        amountTendered: 40.0,
      });

    await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${cashierAToken}`)
      .send({
        orderId: completedDineInOrderId,
        paymentMethod: 'CARD',
        amount: 25.0,
        cardBrand: 'VISA',
        cardLast4: '4242',
        reference: 'AUTH-TX-' + Date.now(),
      });

    // Order 2: Takeaway Order
    const takeawayRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${cashierAToken}`)
      .send({
        orderType: 'TAKEAWAY',
        customerName: 'Hamza Khan',
        customerPhone: '+92 321 5566778',
        packagingCharge: 2.5,
        items: [
          {
            menuItemId: itemBurgerId,
            quantity: 1,
          },
        ],
      });
    completedTakeawayOrderId = takeawayRes.body.data.order.id;

    // Order 3: Delivery Order
    const deliveryRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${cashierAToken}`)
      .send({
        orderType: 'DELIVERY',
        customerName: 'Ayesha Malik',
        customerPhone: '+92 333 4455667',
        deliveryAddress: 'House 22, Street 7, F-7/2, Islamabad',
        flatDeliveryFee: 5.0,
        items: [
          {
            menuItemId: itemBurgerId,
            quantity: 3,
          },
        ],
      });
    completedDeliveryOrderId = deliveryRes.body.data.order.id;
  });

  // ---------------------------------------------------------------------------
  // 1. Customer Receipt Generation
  // ---------------------------------------------------------------------------
  describe('1. Customer Receipt Generation', () => {
    it('should generate structured customer receipt and ASCII slip for Dine-In order', async () => {
      const res = await request(app)
        .get(`/api/v1/receipts/orders/${completedDineInOrderId}/customer?paperWidth=80mm`)
        .set('Authorization', `Bearer ${cashierAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const receipt = res.body.data.receipt;
      expect(receipt.title).toBe('CUSTOMER RECEIPT');
      expect(receipt.isReprint).toBe(false);

      // Restaurant branding
      expect(receipt.restaurant.name).toBe('Faraz Flagship Bistro');
      expect(receipt.restaurant.legalName).toBe('Faraz Flagship Bistro Pvt. Ltd.');
      expect(receipt.restaurant.phone).toBe('+92 51 1122334');
      expect(receipt.restaurant.taxNumber).toBe('NTN-99887766-1');
      expect(receipt.restaurant.receiptHeader).toBe('Welcome to the Premier Dining Experience');

      // Order metadata
      expect(receipt.metadata.orderType).toBe('DINE_IN');
      expect(receipt.metadata.tableName).toBe('T-01');
      expect(receipt.metadata.guestCount).toBe(2);
      expect(receipt.metadata.cashierName).toBeDefined();
      expect(receipt.metadata.barcodePayload).toBeDefined();

      // Items & Modifiers
      expect(receipt.items.length).toBe(2);
      const burgerItem = receipt.items.find(
        (i: { itemName: string }) => i.itemName === 'Angus Gourmet Burger',
      );
      expect(burgerItem).toBeDefined();
      expect(burgerItem.quantity).toBe(2);
      expect(burgerItem.modifiers.length).toBe(1);
      expect(burgerItem.modifiers[0].modifierOptionName).toBe('Aged Cheddar Slice');
      expect(burgerItem.specialInstructions).toContain('Well done');

      // Financials
      expect(Number(receipt.totals.subtotal)).toBeGreaterThan(0);
      expect(Number(receipt.totals.totalDiscount)).toBeGreaterThan(0);
      expect(receipt.totals.taxRate).toBe(16.0);
      expect(Number(receipt.totals.grandTotal)).toBeGreaterThan(0);

      // Payments
      expect(receipt.payments.length).toBe(2);
      expect(receipt.payments[0].paymentMethod).toBe('CASH');
      expect(receipt.payments[1].paymentMethod).toBe('CARD');
      expect(receipt.payments[1].cardBrand).toBe('VISA');
      expect(receipt.payments[1].cardLast4).toBe('4242');

      // Rendered ASCII slip
      expect(typeof receipt.renderedSlip).toBe('string');
      expect(receipt.renderedSlip).toContain('Faraz Flagship Bistro');
      expect(receipt.renderedSlip).toContain('CUSTOMER RECEIPT');
      expect(receipt.renderedSlip).toContain('Angus Gourmet Burger');
      expect(receipt.renderedSlip).toContain('Aged Cheddar Slice');
      expect(receipt.renderedSlip).toContain('GRAND TOTAL');
      expect(receipt.renderedSlip).toContain('VISA (x-4242)');
    });

    it('should generate 58mm compact width customer receipt', async () => {
      const res = await request(app)
        .get(`/api/v1/receipts/orders/${completedDineInOrderId}/customer?paperWidth=58mm`)
        .set('Authorization', `Bearer ${cashierAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.receipt.renderedSlip).toBeDefined();
      // Verify lines are formatted within 32 character width
      const lines = res.body.data.receipt.renderedSlip.split('\n');
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(32);
      }
    });

    it('should generate takeaway receipt with sequential token number and packaging fee', async () => {
      const res = await request(app)
        .get(`/api/v1/receipts/orders/${completedTakeawayOrderId}/customer`)
        .set('Authorization', `Bearer ${cashierAToken}`);

      expect(res.status).toBe(200);
      const receipt = res.body.data.receipt;
      expect(receipt.metadata.orderType).toBe('TAKEAWAY');
      expect(receipt.metadata.customerName).toBe('Hamza Khan');
      expect(receipt.totals.packagingCharge).toBe(2.5);
      expect(receipt.renderedSlip).toContain('Token #: TK-');
      expect(receipt.renderedSlip).toContain('Hamza Khan');
    });

    it('should generate delivery receipt with customer address and delivery fee', async () => {
      const res = await request(app)
        .get(`/api/v1/receipts/orders/${completedDeliveryOrderId}/customer`)
        .set('Authorization', `Bearer ${cashierAToken}`);

      expect(res.status).toBe(200);
      const receipt = res.body.data.receipt;
      expect(receipt.metadata.orderType).toBe('DELIVERY');
      expect(receipt.metadata.customerName).toBe('Ayesha Malik');
      expect(receipt.metadata.deliveryAddress).toContain('House 22, Street 7');
      expect(receipt.totals.deliveryCharge).toBe(5.0);
      expect(receipt.renderedSlip).toContain('Address: House 22, Street 7');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Kitchen Order Ticket (KOT) Generation
  // ---------------------------------------------------------------------------
  describe('2. Kitchen Order Ticket (KOT) Generation', () => {
    it('should generate full kitchen order ticket with instructions and items breakdown', async () => {
      const res = await request(app)
        .get(`/api/v1/receipts/orders/${completedDineInOrderId}/kitchen?paperWidth=80mm`)
        .set('Authorization', `Bearer ${waiterAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const ticket = res.body.data.ticket;
      expect(ticket.title).toBe('KITCHEN ORDER TICKET (KOT)');
      expect(ticket.metadata.orderType).toBe('DINE_IN');
      expect(ticket.metadata.tableName).toBe('T-01');
      expect(ticket.items.length).toBe(2);

      const burger = ticket.items.find(
        (i: { itemName: string }) => i.itemName === 'Angus Gourmet Burger',
      );
      expect(burger.specialInstructions).toContain('Well done');
      expect(burger.modifiers[0].modifierOptionName).toBe('Aged Cheddar Slice');

      expect(ticket.renderedSlip).toContain('KITCHEN ORDER TICKET (KOT)');
      expect(ticket.renderedSlip).toContain('Angus Gourmet Burger');
      expect(ticket.renderedSlip).toContain('INSTRUCTION: Well done, extra pickles');
    });

    it('should generate station-filtered KOT ticket', async () => {
      const res = await request(app)
        .get(
          `/api/v1/receipts/orders/${completedDineInOrderId}/kitchen?stationId=${stationGrillId}`,
        )
        .set('Authorization', `Bearer ${waiterAToken}`);

      expect(res.status).toBe(200);
      const ticket = res.body.data.ticket;
      expect(ticket.stationName).toContain('Hot Grill Station');
      // Only Grill category item should be included (Angus Gourmet Burger), excluding Soda
      expect(ticket.items.length).toBe(1);
      expect(ticket.items[0].itemName).toBe('Angus Gourmet Burger');
      expect(ticket.renderedSlip).toContain('STATION: HOT GRILL STATION');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Receipt Reprint & Audit Logging
  // ---------------------------------------------------------------------------
  describe('3. Receipt Reprint & Audit Logging', () => {
    it('should reprint receipt with duplicate watermark and log audit trail', async () => {
      const res = await request(app)
        .post(`/api/v1/receipts/orders/${completedDineInOrderId}/reprint`)
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({
          reason: 'Customer requested printed physical copy for company reimbursement',
          paperWidth: '80mm',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const receipt = res.body.data.receipt;
      expect(receipt.isReprint).toBe(true);
      expect(receipt.reprintCount).toBe(1);
      expect(receipt.reprintReason).toContain('company reimbursement');
      expect(receipt.renderedSlip).toContain('*** DUPLICATE RECEIPT / REPRINT ***');
      expect(receipt.renderedSlip).toContain('Reprint #1');

      // Verify AuditLog in Database
      const auditEntry = await prisma.auditLog.findFirst({
        where: {
          restaurantId: restaurantAId,
          entityType: 'ORDER',
          entityId: completedDineInOrderId,
          action: 'RECEIPT_REPRINTED',
        },
      });

      expect(auditEntry).toBeDefined();
      expect(auditEntry?.metadata).toMatchObject({
        reprintCount: 1,
        reason: 'Customer requested printed physical copy for company reimbursement',
      });
    });

    it('should increment reprint count on subsequent reprint requests', async () => {
      const res = await request(app)
        .post(`/api/v1/receipts/orders/${completedDineInOrderId}/reprint`)
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({
          reason: 'Second reprint for accountant copy',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.receipt.reprintCount).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Sample Receipt Preview
  // ---------------------------------------------------------------------------
  describe('4. Sample Receipt Preview', () => {
    it('should generate mock layout preview with restaurant branding and tax configuration', async () => {
      const res = await request(app)
        .get('/api/v1/receipts/preview?sampleType=DINE_IN&paperWidth=80mm')
        .set('Authorization', `Bearer ${cashierAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const receipt = res.body.data.receipt;
      expect(receipt.restaurant.name).toBe('Faraz Flagship Bistro');
      expect(receipt.restaurant.receiptHeader).toBe('Welcome to the Premier Dining Experience');
      expect(receipt.items.length).toBeGreaterThanOrEqual(1);
      expect(typeof receipt.renderedSlip).toBe('string');
      expect(receipt.renderedSlip).toContain('Faraz Flagship Bistro');
      expect(receipt.renderedSlip).toContain('GRAND TOTAL');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Security, RBAC & Multi-Tenant Isolation
  // ---------------------------------------------------------------------------
  describe('5. Security, RBAC & Multi-Tenant Isolation', () => {
    it('should reject unauthenticated request with HTTP 401', async () => {
      const res = await request(app).get(
        `/api/v1/receipts/orders/${completedDineInOrderId}/customer`,
      );
      expect(res.status).toBe(401);
    });

    it('should prevent user lacking receipts.reprint from reprinting with HTTP 403', async () => {
      const res = await request(app)
        .post(`/api/v1/receipts/orders/${completedDineInOrderId}/reprint`)
        .set('Authorization', `Bearer ${waiterAToken}`)
        .send({ reason: 'Attempt unauthorized reprint' });

      expect(res.status).toBe(403);
    });

    it('should prevent Tenant B user from accessing Tenant A order receipt with HTTP 404', async () => {
      const res = await request(app)
        .get(`/api/v1/receipts/orders/${completedDineInOrderId}/customer`)
        .set('Authorization', `Bearer ${tenantBToken}`);

      expect(res.status).toBe(404);
    });
  });
});
