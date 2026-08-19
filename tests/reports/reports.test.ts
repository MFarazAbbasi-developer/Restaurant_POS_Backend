import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

describe('Faraz POS - Reporting & Analytics Module Tests', () => {
  let restaurantAId: string;
  let restaurantBId: string;

  let ownerAToken: string;
  let cashierAToken: string;
  let tenantBToken: string;

  let categoryFoodId: string;
  let categoryDrinksId: string;

  let itemBurgerId: string;
  let itemPizzaId: string;
  let itemDrinkId: string;

  let tableAId: string;
  let riderAId: string;

  let dineInOrderId: string;
  let takeawayOrderId: string;
  let deliveryOrderId: string;
  let cancelledOrderId: string;
  let voidedOrderId: string;

  beforeAll(async () => {
    // 1. Create Dedicated Suite-Isolated Restaurant A
    const restaurantA = await prisma.restaurant.create({
      data: {
        name: 'Faraz Reports Flagship',
        slug: 'faraz-reports-suite-' + Date.now(),
        currency: 'USD',
        taxRate: 10.0,
        taxInclusive: false,
        serviceChargeRate: 5.0,
        serviceChargeEnabled: true,
      },
    });
    restaurantAId = restaurantA.id;

    // 2. Create Restaurant B for isolation tests
    const restaurantB = await prisma.restaurant.create({
      data: {
        name: 'Faraz Branch Reports Test',
        slug: 'faraz-reports-branch-' + Date.now(),
        currency: 'PKR',
      },
    });
    restaurantBId = restaurantB.id;

    const defaultPinHash = await bcrypt.hash('1234', 10);
    const cashierPinHash = await bcrypt.hash('4321', 10);

    const allPerms = await prisma.permission.findMany();
    const permMap = new Map(allPerms.map((p) => [p.key, p.id]));

    // Create OWNER Role (has reports.view, reports.export, etc.)
    const ownerRole = await prisma.role.create({
      data: {
        restaurantId: restaurantAId,
        name: 'OWNER_' + Date.now(),
        rolePermissions: {
          create: allPerms.map((p) => ({ permissionId: p.id })),
        },
      },
    });

    // Create CASHIER Role (lacks reports.view)
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
            'orders.cancel',
            'orders.void',
            'payments.view',
            'payments.create',
            'shifts.view',
            'shifts.manage',
            'shifts.open',
            'shifts.close',
            'shifts.cash_drop',
            'shifts.adjust',
          ]
            .filter((k) => permMap.has(k))
            .map((k) => ({ permissionId: permMap.get(k)! })),
        },
      },
    });

    // 3. Login Owner A
    const ownerUser = await prisma.user.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Reports Owner',
        username: 'rep_owner_' + Date.now(),
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
        name: 'Reports Cashier',
        username: 'rep_cashier_' + Date.now(),
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

    // 5. Tenant B User setup
    const roleB = await prisma.role.create({
      data: {
        restaurantId: restaurantBId,
        name: 'ROLE_B_' + Date.now(),
        rolePermissions: {
          create: [{ permissionId: permMap.get('reports.view')! }],
        },
      },
    });

    const userB = await prisma.user.create({
      data: {
        restaurantId: restaurantBId,
        name: 'Tenant B User',
        username: 'rep_tenant_b_' + Date.now(),
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

    // 6. Seed Rider
    const riderUser = await prisma.user.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Express Rider',
        username: 'rep_rider_' + Date.now(),
        pinHash: defaultPinHash,
        isActive: true,
      },
    });
    riderAId = riderUser.id;

    // 7. Seed Categories & Items
    const categoryFood = await prisma.category.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Food & Meals ' + Date.now(),
        sortOrder: 1,
      },
    });
    categoryFoodId = categoryFood.id;

    const categoryDrinks = await prisma.category.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Beverages ' + Date.now(),
        sortOrder: 2,
      },
    });
    categoryDrinksId = categoryDrinks.id;

    const itemBurger = await prisma.menuItem.create({
      data: {
        restaurantId: restaurantAId,
        categoryId: categoryFoodId,
        itemCode: 'BURGER-' + Date.now(),
        name: 'Double Gourmet Burger',
        basePrice: 20.0,
      },
    });
    itemBurgerId = itemBurger.id;

    const itemPizza = await prisma.menuItem.create({
      data: {
        restaurantId: restaurantAId,
        categoryId: categoryFoodId,
        itemCode: 'PIZZA-' + Date.now(),
        name: 'Woodfired Pizza',
        basePrice: 30.0,
      },
    });
    itemPizzaId = itemPizza.id;

    const itemDrink = await prisma.menuItem.create({
      data: {
        restaurantId: restaurantAId,
        categoryId: categoryDrinksId,
        itemCode: 'DRINK-' + Date.now(),
        name: 'Fresh Iced Tea',
        basePrice: 5.0,
      },
    });
    itemDrinkId = itemDrink.id;

    // Seating Table
    const zone = await prisma.zone.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Main Dining ' + Date.now(),
        sortOrder: 1,
      },
    });

    const table = await prisma.restaurantTable.create({
      data: {
        restaurantId: restaurantAId,
        zoneId: zone.id,
        name: 'Table 1 ' + Date.now(),
        capacity: 4,
      },
    });
    tableAId = table.id;

    // 8. Open Cashier Shift for Shift Settlement Reporting
    await request(app)
      .post('/api/v1/shifts/open')
      .set('Authorization', `Bearer ${cashierAToken}`)
      .send({
        openingCash: 100.0,
        registerName: 'Main Terminal',
      });

    // 9. Create Order 1: Dine-In (2 Burgers + 2 Drinks = $50, 10% discount = -$5.00, tax 10% = $4.50, service 5% = $2.25 => Grand Total = $51.75)
    const dineInRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${cashierAToken}`)
      .send({
        orderType: 'DINE_IN',
        tableId: tableAId,
        guestCount: 2,
        items: [
          { menuItemId: itemBurgerId, quantity: 2 },
          { menuItemId: itemDrinkId, quantity: 2 },
        ],
      });
    dineInOrderId = dineInRes.body.data.order.id;

    // Apply 10% Discount
    await request(app)
      .post(`/api/v1/orders/${dineInOrderId}/discount`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        discountType: 'PERCENTAGE',
        discountValue: 10,
        discountReason: 'Happy Hour Promotion',
      });

    // Make Split Payment: $30 Cash + $21.75 Card
    await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${cashierAToken}`)
      .send({
        orderId: dineInOrderId,
        paymentMethod: 'CASH',
        amount: 30.0,
        amountTendered: 30.0,
      });

    await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${cashierAToken}`)
      .send({
        orderId: dineInOrderId,
        paymentMethod: 'CARD',
        amount: 21.75,
        reference: 'REP-CARD-' + Date.now(),
      });

    // 10. Create Order 2: Takeaway (1 Pizza = $30, Packaging = $3, Tax 10% = $3 => Grand Total = $36)
    const takeawayRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${cashierAToken}`)
      .send({
        orderType: 'TAKEAWAY',
        customerName: 'Bilal Ahmed',
        packagingCharge: 3.0,
        items: [{ menuItemId: itemPizzaId, quantity: 1 }],
      });
    takeawayOrderId = takeawayRes.body.data.order.id;

    // Pay Takeaway in Full with CASH
    await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${cashierAToken}`)
      .send({
        orderId: takeawayOrderId,
        paymentMethod: 'CASH',
        amount: 36.0,
        amountTendered: 50.0,
      });

    // 11. Create Order 3: Delivery (1 Burger = $20, Flat delivery fee = $5 => Grand Total = $27)
    const deliveryRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${cashierAToken}`)
      .send({
        orderType: 'DELIVERY',
        customerName: 'Sara Qureshi',
        deliveryAddress: 'Sector F-7/2, Islamabad',
        flatDeliveryFee: 5.0,
        items: [{ menuItemId: itemBurgerId, quantity: 1 }],
      });
    deliveryOrderId = deliveryRes.body.data.order.id;

    // Assign Rider
    await prisma.order.update({
      where: { id: deliveryOrderId },
      data: { riderId: riderAId, status: 'COMPLETED' },
    });

    // Pay Delivery in Full with CASH
    const delPayRes = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${cashierAToken}`)
      .send({
        orderId: deliveryOrderId,
        paymentMethod: 'CASH',
        amount: 27.0,
        amountTendered: 30.0,
      });
    const delPaymentId = delPayRes.body.data.payment.id;

    // Issue a partial refund on delivery payment ($5 refund)
    await request(app)
      .post(`/api/v1/payments/${delPaymentId}/refund`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        amount: 5.0,
        reason: 'Customer reported cold food discount concession',
      });

    // 12. Create Order 4: Cancelled Order
    const cancelRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${cashierAToken}`)
      .send({
        orderType: 'DINE_IN',
        items: [{ menuItemId: itemBurgerId, quantity: 1 }],
      });
    cancelledOrderId = cancelRes.body.data.order.id;

    await request(app)
      .post(`/api/v1/orders/${cancelledOrderId}/cancel`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ reason: 'Customer walked out due to delay' });

    // 13. Create Order 5: Voided Order
    const voidRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${cashierAToken}`)
      .send({
        orderType: 'TAKEAWAY',
        items: [{ menuItemId: itemDrinkId, quantity: 2 }],
      });
    voidedOrderId = voidRes.body.data.order.id;

    await request(app)
      .post(`/api/v1/orders/${voidedOrderId}/void`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ voidReason: 'Accidental double entry by cashier' });

    // 14. Cash Drop on Shift & Close Shift
    await request(app)
      .post('/api/v1/shifts/current/cash-drop')
      .set('Authorization', `Bearer ${cashierAToken}`)
      .send({
        amount: 50.0,
        reason: 'Mid-day safe deposit drop',
      });

    await request(app)
      .post('/api/v1/shifts/current/close')
      .set('Authorization', `Bearer ${cashierAToken}`)
      .send({
        actualClosingCash: 140.0,
        closingNotes: 'Shift reconciled cleanly',
      });
  });

  // ---------------------------------------------------------------------------
  // 1. Executive Sales Summary
  // ---------------------------------------------------------------------------
  describe('1. Executive Sales Summary', () => {
    it('should calculate accurate gross sales, net sales, taxes, and order distributions', async () => {
      const res = await request(app)
        .get('/api/v1/reports/sales-summary')
        .set('Authorization', `Bearer ${ownerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { summary, ordersMetrics } = res.body.data;

      // Valid Orders Subtotals: DineIn ($50) + Takeaway ($30) + Delivery ($20) = $100.00
      expect(summary.grossSales).toBe(100.0);
      expect(summary.totalDiscounts).toBe(5.0);
      expect(summary.netSales).toBe(95.0);
      expect(summary.packagingCharges).toBe(3.0);
      expect(summary.deliveryCharges).toBe(5.0);
      expect(summary.grandTotal).toBeGreaterThan(100.0);
      expect(summary.totalPaid).toBeGreaterThan(100.0);

      // Order counts
      expect(ordersMetrics.validOrdersCount).toBe(3);
      expect(ordersMetrics.cancelledOrdersCount).toBe(1);
      expect(ordersMetrics.cancelledValue).toBeGreaterThan(0);
      expect(ordersMetrics.voidedOrdersCount).toBe(1);
      expect(ordersMetrics.averageOrderValue).toBeGreaterThan(0);
    });

    it('should filter summary by date range', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const res = await request(app)
        .get(`/api/v1/reports/sales-summary?startDate=${today}&endDate=${today}`)
        .set('Authorization', `Bearer ${ownerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.summary.grossSales).toBe(100.0);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Sales by Order Type (Channel Breakdown)
  // ---------------------------------------------------------------------------
  describe('2. Sales by Order Type', () => {
    it('should provide complete channel breakdown for Dine-In, Takeaway, and Delivery', async () => {
      const res = await request(app)
        .get('/api/v1/reports/by-order-type')
        .set('Authorization', `Bearer ${ownerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { channels, totalRevenue } = res.body.data;
      expect(totalRevenue).toBeGreaterThan(0);
      expect(channels.length).toBe(3);

      const dineIn = channels.find((c: { orderType: string }) => c.orderType === 'DINE_IN');
      const takeaway = channels.find((c: { orderType: string }) => c.orderType === 'TAKEAWAY');
      const delivery = channels.find((c: { orderType: string }) => c.orderType === 'DELIVERY');

      expect(dineIn).toBeDefined();
      expect(dineIn.grossSales).toBe(50.0);
      expect(dineIn.discounts).toBe(5.0);
      expect(dineIn.netSales).toBe(45.0);
      expect(dineIn.percentageOfTotal).toBeGreaterThan(0);

      expect(takeaway).toBeDefined();
      expect(takeaway.packagingCharge).toBe(3.0);

      expect(delivery).toBeDefined();
      expect(delivery.deliveryCharge).toBe(5.0);
    });

    it('should filter channel breakdown by specific order type', async () => {
      const res = await request(app)
        .get('/api/v1/reports/by-order-type?orderType=TAKEAWAY')
        .set('Authorization', `Bearer ${ownerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.channels).toHaveLength(1);
      expect(res.body.data.channels[0].orderType).toBe('TAKEAWAY');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Sales by Payment Method
  // ---------------------------------------------------------------------------
  describe('3. Sales by Payment Method', () => {
    it('should aggregate gross collections, refunds issued, and net collections by method', async () => {
      const res = await request(app)
        .get('/api/v1/reports/by-payment-method')
        .set('Authorization', `Bearer ${ownerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { methods, totalCollected } = res.body.data;
      expect(totalCollected).toBeGreaterThan(0);

      const cashMethod = methods.find((m: { paymentMethod: string }) => m.paymentMethod === 'CASH');
      const cardMethod = methods.find((m: { paymentMethod: string }) => m.paymentMethod === 'CARD');

      expect(cashMethod).toBeDefined();
      expect(cashMethod.grossAmount).toBe(93.0); // $30 + $36 + $27
      expect(cashMethod.refundAmount).toBe(5.0); // $5 partial refund on delivery
      expect(cashMethod.netAmount).toBe(88.0);
      expect(cashMethod.transactionCount).toBe(3);

      expect(cardMethod).toBeDefined();
      expect(cardMethod.grossAmount).toBe(21.75);
      expect(cardMethod.transactionCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Product / Item Sales Ranking
  // ---------------------------------------------------------------------------
  describe('4. Product / Item Sales Ranking', () => {
    it('should rank items by revenue descending with pagination', async () => {
      const res = await request(app)
        .get('/api/v1/reports/items-ranking?sortBy=revenue&sortOrder=desc&page=1&limit=10')
        .set('Authorization', `Bearer ${ownerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { items, totalItems, totalSalesVolume } = res.body.data;
      expect(totalItems).toBe(3); // Burger, Pizza, Drink
      expect(totalSalesVolume).toBe(100.0);

      // Burger: 3 sold (2 dine-in + 1 delivery) = $60
      // Pizza: 1 sold = $30
      // Drink: 2 sold = $10
      expect(items[0].name).toBe('Double Gourmet Burger');
      expect(items[0].quantitySold).toBe(3);
      expect(items[0].grossRevenue).toBe(60.0);

      expect(items[1].name).toBe('Woodfired Pizza');
      expect(items[1].quantitySold).toBe(1);

      expect(items[2].name).toBe('Fresh Iced Tea');
      expect(items[2].quantitySold).toBe(2);
    });

    it('should filter item ranking by category', async () => {
      const res = await request(app)
        .get(`/api/v1/reports/items-ranking?categoryId=${categoryDrinksId}`)
        .set('Authorization', `Bearer ${ownerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].name).toBe('Fresh Iced Tea');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Category Sales Summary
  // ---------------------------------------------------------------------------
  describe('5. Category Sales Summary', () => {
    it('should summarize volume and revenue contribution per category', async () => {
      const res = await request(app)
        .get('/api/v1/reports/by-category')
        .set('Authorization', `Bearer ${ownerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { categories, totalCategoryRevenue } = res.body.data;
      expect(totalCategoryRevenue).toBe(100.0);
      expect(categories).toHaveLength(2);

      const foodCat = categories.find(
        (c: { categoryId: string }) => c.categoryId === categoryFoodId,
      );
      const drinkCat = categories.find(
        (c: { categoryId: string }) => c.categoryId === categoryDrinksId,
      );

      expect(foodCat).toBeDefined();
      expect(foodCat.itemsSold).toBe(4); // 3 burgers + 1 pizza
      expect(foodCat.grossRevenue).toBe(90.0);
      expect(foodCat.revenueShare).toBe(90.0);

      expect(drinkCat).toBeDefined();
      expect(drinkCat.itemsSold).toBe(2);
      expect(drinkCat.grossRevenue).toBe(10.0);
      expect(drinkCat.revenueShare).toBe(10.0);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Taxes, Discounts, Voids & Cancellations Audit
  // ---------------------------------------------------------------------------
  describe('6. Financial Adjustments & Audit Report', () => {
    it('should report tax collections, discount reasons, void statistics, and cancellations', async () => {
      const res = await request(app)
        .get('/api/v1/reports/financial-adjustments')
        .set('Authorization', `Bearer ${ownerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { taxes, discounts, voids, cancellations } = res.body.data;

      // Taxes & Service Charge
      expect(taxes.totalTaxCollected).toBeGreaterThan(0);
      expect(taxes.totalServiceCharges).toBeGreaterThan(0);

      // Discounts
      expect(discounts.orderDiscountsTotal).toBe(5.0);
      expect(discounts.reasonsBreakdown.length).toBeGreaterThanOrEqual(1);
      expect(discounts.reasonsBreakdown[0].reason).toBe('Happy Hour Promotion');

      // Voids
      expect(voids.voidedOrdersCount).toBe(1);
      expect(voids.reasonsBreakdown.length).toBeGreaterThanOrEqual(1);
      expect(voids.reasonsBreakdown[0].reason).toContain('Accidental double entry');

      // Cancellations
      expect(cancellations.cancelledOrdersCount).toBe(1);
      expect(cancellations.reasonsBreakdown.length).toBeGreaterThanOrEqual(1);
      expect(cancellations.reasonsBreakdown[0].reason).toContain('walked out');
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Hourly Sales & Traffic Trends
  // ---------------------------------------------------------------------------
  describe('7. Hourly Sales & Traffic Trends', () => {
    it('should return 24-hour distribution and identify peak trading hour', async () => {
      const res = await request(app)
        .get('/api/v1/reports/hourly-trends')
        .set('Authorization', `Bearer ${ownerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { hourlyDistribution, peakHour, totalOrders } = res.body.data;
      expect(hourlyDistribution).toHaveLength(24);
      expect(totalOrders).toBe(3);
      expect(peakHour.revenue).toBeGreaterThan(0);
      expect(typeof peakHour.hour).toBe('number');
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Staff & Cashier Performance
  // ---------------------------------------------------------------------------
  describe('8. Staff & Cashier Performance', () => {
    it('should aggregate orders, sales, and shift counts for staff members', async () => {
      const res = await request(app)
        .get('/api/v1/reports/staff-performance')
        .set('Authorization', `Bearer ${ownerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { staff } = res.body.data;
      expect(staff.length).toBeGreaterThanOrEqual(1);

      const cashierStats = staff.find((s: { name: string }) => s.name === 'Reports Cashier');
      expect(cashierStats).toBeDefined();
      expect(cashierStats.ordersProcessed).toBeGreaterThanOrEqual(3);
      expect(cashierStats.grossSales).toBeGreaterThan(0);
      expect(cashierStats.shiftsCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Shift Settlement Summary
  // ---------------------------------------------------------------------------
  describe('9. Shift Settlement Summary', () => {
    it('should aggregate register shift metrics, cash drops, and variance', async () => {
      const res = await request(app)
        .get('/api/v1/reports/shifts-summary')
        .set('Authorization', `Bearer ${ownerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { summary, shifts } = res.body.data;
      expect(summary.totalShifts).toBeGreaterThanOrEqual(1);
      expect(summary.totalOpeningCash).toBe(100.0);
      expect(summary.totalCashDrops).toBe(50.0);
      expect(shifts.length).toBeGreaterThanOrEqual(1);

      const closedShift = shifts.find((s: { status: string }) => s.status === 'CLOSED');
      expect(closedShift).toBeDefined();
      expect(closedShift.actualClosingCash).toBe(140.0);
      expect(closedShift.variance).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Delivery & Takeaway Operations Performance
  // ---------------------------------------------------------------------------
  describe('10. Delivery & Takeaway Operations Performance', () => {
    it('should provide takeaway token volume and delivery rider fulfillment metrics', async () => {
      const res = await request(app)
        .get('/api/v1/reports/operations-performance')
        .set('Authorization', `Bearer ${ownerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { takeaway, delivery } = res.body.data;
      expect(takeaway.totalOrders).toBe(1);

      expect(delivery.totalOrders).toBe(1);
      expect(delivery.completedDeliveries).toBe(1);
      expect(delivery.totalDeliveryFees).toBe(5.0);
      expect(delivery.ridersBreakdown).toHaveLength(1);
      expect(delivery.ridersBreakdown[0].riderName).toBe('Express Rider');
      expect(delivery.ridersBreakdown[0].deliveriesCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 11. Security, RBAC & Multi-Tenant Isolation
  // ---------------------------------------------------------------------------
  describe('11. Security, RBAC & Multi-Tenant Isolation', () => {
    it('should reject unauthenticated request with HTTP 401', async () => {
      const res = await request(app).get('/api/v1/reports/sales-summary');
      expect(res.status).toBe(401);
    });

    it('should reject user lacking reports.view permission with HTTP 403', async () => {
      const res = await request(app)
        .get('/api/v1/reports/sales-summary')
        .set('Authorization', `Bearer ${cashierAToken}`);

      expect(res.status).toBe(403);
    });

    it('should ensure Tenant B receives isolated empty reports with HTTP 200', async () => {
      const res = await request(app)
        .get('/api/v1/reports/sales-summary')
        .set('Authorization', `Bearer ${tenantBToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.summary.grossSales).toBe(0);
      expect(res.body.data.ordersMetrics.totalOrdersCount).toBe(0);
    });
  });
});
