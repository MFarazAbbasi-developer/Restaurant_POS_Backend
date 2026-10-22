import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

describe('FARMAX POS - Discounts & Promotions Module Tests', () => {
  let restaurantAId: string;
  let restaurantBId: string;

  let ownerAToken: string;
  let managerAToken: string;
  let cashierAToken: string;
  let tenantBToken: string;

  let categoryBurgersId: string;
  let categoryDrinksId: string;

  let itemBurgerId: string;
  let itemFriesId: string;
  let itemDrinkId: string;

  let customerAId: string;

  let percentPromoId: string;
  let fixedPromoId: string;
  let bogoPromoId: string;

  beforeAll(async () => {
    // 1. Create Dedicated Suite-Isolated Restaurant A
    const restaurantA = await prisma.restaurant.create({
      data: {
        name: 'Promo Flagship Suite',
        slug: 'promo-suite-' + Date.now(),
        currency: 'USD',
        taxRate: 10.0,
        taxInclusive: false,
        serviceChargeRate: 0,
        serviceChargeEnabled: false,
      },
    });
    restaurantAId = restaurantA.id;

    // 2. Create Restaurant B for isolation tests
    const restaurantB = await prisma.restaurant.create({
      data: {
        name: 'Branch Promo Test',
        slug: 'promo-branch-' + Date.now(),
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

    // Create MANAGER Role (has promotions.manage, promotions.view, promotions.apply, orders.*)
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
                'promotions.view',
                'promotions.manage',
                'promotions.apply',
              ].includes(p.key),
            )
            .map((p) => ({ permissionId: p.id })),
        },
      },
    });

    // Create CASHIER Role (has promotions.view, promotions.apply, orders.create - but NOT promotions.manage)
    const cashierRole = await prisma.role.create({
      data: {
        restaurantId: restaurantAId,
        name: 'CASHIER_' + Date.now(),
        rolePermissions: {
          create: allPerms
            .filter((p) =>
              ['orders.view', 'orders.create', 'promotions.view', 'promotions.apply'].includes(
                p.key,
              ),
            )
            .map((p) => ({ permissionId: p.id })),
        },
      },
    });

    // Create Users for Restaurant A
    const ownerUser = await prisma.user.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Promo Owner',
        username: 'owner_promo_' + Date.now(),
        pinHash: defaultPinHash,
        userRoles: { create: [{ roleId: ownerRole.id }] },
      },
    });

    const managerUser = await prisma.user.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Promo Manager',
        username: 'manager_promo_' + Date.now(),
        pinHash: defaultPinHash,
        userRoles: { create: [{ roleId: managerRole.id }] },
      },
    });

    const cashierUser = await prisma.user.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Promo Cashier',
        username: 'cashier_promo_' + Date.now(),
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
        username: 'tenant_b_promo_' + Date.now(),
        pinHash: defaultPinHash,
        userRoles: { create: [{ roleId: ownerBRole.id }] },
      },
    });

    // Obtain JWT Tokens
    const ownerLogin = await request(app).post('/api/v1/auth/login').send({
      username: ownerUser.username,
      pin: '1234',
    });
    ownerAToken = ownerLogin.body.data.accessToken;

    const managerLogin = await request(app).post('/api/v1/auth/login').send({
      username: managerUser.username,
      pin: '1234',
    });
    managerAToken = managerLogin.body.data.accessToken;

    const cashierLogin = await request(app).post('/api/v1/auth/login').send({
      username: cashierUser.username,
      pin: '4321',
    });
    cashierAToken = cashierLogin.body.data.accessToken;

    const tenantBLogin = await request(app).post('/api/v1/auth/login').send({
      username: ownerBUser.username,
      pin: '1234',
    });
    tenantBToken = tenantBLogin.body.data.accessToken;

    // Seed Categories & Menu Items in Restaurant A
    const catBurgers = await prisma.category.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Burgers Category',
        sortOrder: 1,
      },
    });
    categoryBurgersId = catBurgers.id;

    const catDrinks = await prisma.category.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Drinks Category',
        sortOrder: 2,
      },
    });
    categoryDrinksId = catDrinks.id;

    const burger = await prisma.menuItem.create({
      data: {
        restaurantId: restaurantAId,
        categoryId: categoryBurgersId,
        itemCode: 'BGR-01',
        name: 'Deluxe Burger',
        basePrice: 10.0,
      },
    });
    itemBurgerId = burger.id;

    const fries = await prisma.menuItem.create({
      data: {
        restaurantId: restaurantAId,
        categoryId: categoryBurgersId,
        itemCode: 'FRS-01',
        name: 'French Fries',
        basePrice: 5.0,
      },
    });
    itemFriesId = fries.id;

    const drink = await prisma.menuItem.create({
      data: {
        restaurantId: restaurantAId,
        categoryId: categoryDrinksId,
        itemCode: 'DRK-01',
        name: 'Soda Can',
        basePrice: 3.0,
      },
    });
    itemDrinkId = drink.id;

    // Create Customer
    const customer = await prisma.customer.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Alice Customer',
        phone: '1234567890',
      },
    });
    customerAId = customer.id;
  });

  // ===========================================================================
  // 1. Promotion Management CRUD
  // ===========================================================================
  describe('1. Promotion Management CRUD', () => {
    it('should allow Manager to create a Percentage Order-Level Promotion with code', async () => {
      const res = await request(app)
        .post('/api/v1/promotions')
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          name: 'Welcome 20% Off',
          code: 'WELCOME20',
          description: '20% off whole order for new customers',
          type: 'PERCENTAGE',
          targetType: 'ORDER',
          discountValue: 20.0,
          minOrderAmount: 15.0,
          maxDiscountAmount: 10.0,
          isActive: true,
          isAutoApply: false,
          priority: 5,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.promotion.name).toBe('Welcome 20% Off');
      expect(res.body.data.promotion.code).toBe('WELCOME20');
      expect(res.body.data.promotion.discountValue).toBe(20);
      expect(res.body.data.promotion.minOrderAmount).toBe(15);
      expect(res.body.data.promotion.maxDiscountAmount).toBe(10);
      percentPromoId = res.body.data.promotion.id;
    });

    it('should reject duplicate promo code within the same restaurant', async () => {
      const res = await request(app)
        .post('/api/v1/promotions')
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          name: 'Duplicate Promo Code',
          code: 'WELCOME20',
          discountValue: 10.0,
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('should create an Automatic Fixed Amount Order Promotion with minimum subtotal', async () => {
      const res = await request(app)
        .post('/api/v1/promotions')
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          name: 'Auto $5 Off Over $25',
          description: 'Automatically gives $5 off on orders $25 and above',
          type: 'FIXED_AMOUNT',
          targetType: 'ORDER',
          discountValue: 5.0,
          minOrderAmount: 25.0,
          isAutoApply: true,
          isActive: true,
          priority: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.promotion.isAutoApply).toBe(true);
      expect(res.body.data.promotion.discountValue).toBe(5);
      fixedPromoId = res.body.data.promotion.id;
    });

    it('should create a Buy-X-Get-Y (BOGO) Item-Targeted Promotion', async () => {
      const res = await request(app)
        .post('/api/v1/promotions')
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          name: 'Buy 2 Burgers Get 1 Free',
          type: 'BUY_X_GET_Y',
          targetType: 'ITEM',
          buyQuantity: 2,
          getQuantity: 1,
          getDiscountPercentage: 100.0,
          menuItemIds: [itemBurgerId],
          isAutoApply: true,
          isActive: true,
          priority: 10,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.promotion.type).toBe('BUY_X_GET_Y');
      expect(res.body.data.promotion.buyQuantity).toBe(2);
      expect(res.body.data.promotion.getQuantity).toBe(1);
      expect(res.body.data.promotion.menuItems.length).toBe(1);
      bogoPromoId = res.body.data.promotion.id;
      expect(bogoPromoId).toBeDefined();
      expect(itemDrinkId).toBeDefined();
    });

    it('should list all promotions with pagination and filters', async () => {
      const res = await request(app)
        .get('/api/v1/promotions')
        .set('Authorization', `Bearer ${managerAToken}`)
        .query({ page: 1, limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body.data.promotions.length).toBeGreaterThanOrEqual(3);
      expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(3);
    });

    it('should get a single promotion by ID with linked items and metrics', async () => {
      const res = await request(app)
        .get(`/api/v1/promotions/${percentPromoId}`)
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.promotion.id).toBe(percentPromoId);
      expect(res.body.data.promotion.code).toBe('WELCOME20');
    });

    it('should update an existing promotion', async () => {
      const res = await request(app)
        .put(`/api/v1/promotions/${percentPromoId}`)
        .set('Authorization', `Bearer ${managerAToken}`)
        .send({
          description: 'Updated description: 20% off all orders',
          maxDiscountAmount: 15.0,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.promotion.maxDiscountAmount).toBe(15);
      expect(res.body.data.promotion.description).toBe('Updated description: 20% off all orders');
    });

    it('should toggle promotion active status', async () => {
      const res = await request(app)
        .patch(`/api/v1/promotions/${fixedPromoId}/toggle-status`)
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(false);

      // Toggle back to active
      const res2 = await request(app)
        .patch(`/api/v1/promotions/${fixedPromoId}/toggle-status`)
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(res2.status).toBe(200);
      expect(res2.body.data.isActive).toBe(true);
    });
  });

  // ===========================================================================
  // 2. Pre-Checkout Preview & Code Validation
  // ===========================================================================
  describe('2. Pre-Checkout Preview & Code Validation', () => {
    it('should preview basket calculation with auto-applied BOGO discount', async () => {
      // 3 Burgers ($10 each = $30 gross) -> Buy 2 Get 1 Free -> Discount = $10
      const res = await request(app)
        .post('/api/v1/promotions/preview')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({
          orderType: 'DINE_IN',
          items: [{ menuItemId: itemBurgerId, quantity: 3 }],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.subtotal).toBe(30.0);
      expect(res.body.data.promotionDiscount).toBe(10.0);
      expect(res.body.data.discountedSubtotal).toBe(20.0);
      expect(res.body.data.appliedPromotions.length).toBeGreaterThan(0);
      expect(res.body.data.appliedPromotions[0].type).toBe('BUY_X_GET_Y');
    });

    it('should validate an active promo code and calculate estimated discount', async () => {
      const res = await request(app)
        .post('/api/v1/promotions/validate-code')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({
          code: 'WELCOME20',
          orderType: 'DINE_IN',
          items: [{ menuItemId: itemBurgerId, quantity: 2 }], // $20 subtotal >= $15 minOrderAmount
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isValid).toBe(true);
      expect(res.body.data.promotion.code).toBe('WELCOME20');
      expect(res.body.data.estimatedDiscount).toBe(4.0); // 20% of $20 = $4
    });

    it('should reject promo code validation if order does not meet minimum order amount', async () => {
      const res = await request(app)
        .post('/api/v1/promotions/validate-code')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({
          code: 'WELCOME20',
          orderType: 'DINE_IN',
          items: [{ menuItemId: itemFriesId, quantity: 1 }], // $5 < $15 minimum
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Minimum order amount');
    });

    it('should return 404 for non-existent promo code', async () => {
      const res = await request(app)
        .post('/api/v1/promotions/validate-code')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({
          code: 'DOESNOTEXIST99',
        });

      expect(res.status).toBe(404);
    });
  });

  // ===========================================================================
  // 3. Order Creation & Promotion Ledger Integration
  // ===========================================================================
  describe('3. Order Creation with Promotions', () => {
    it('should create an order with an entered Promo Code and record PromotionUsage ledger', async () => {
      // Create order with 2 burgers ($20 gross) and WELCOME20 (20% off -> $4 discount)
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({
          orderType: 'DINE_IN',
          promoCode: 'WELCOME20',
          customerId: customerAId,
          items: [{ menuItemId: itemBurgerId, quantity: 2 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.order.subtotal).toBe(20.0);
      expect(res.body.data.order.promotionDiscount).toBe(4.0);
      expect(res.body.data.order.totalDiscount).toBe(4.0);
      expect(res.body.data.order.promoCode).toBe('WELCOME20');
      // Tax is 10% on discounted subtotal ($16) = $1.60 => Grand Total = $17.60
      expect(res.body.data.order.grandTotal).toBe(17.6);

      const orderId = res.body.data.order.id;

      // Verify PromotionUsage record
      const usage = await prisma.promotionUsage.findFirst({
        where: { orderId, promotionId: percentPromoId },
      });
      expect(usage).not.toBeNull();
      expect(Number(usage!.discountAmount)).toBe(4.0);

      // Verify promotion usageCount incremented
      const promoAfter = await prisma.promotion.findUnique({
        where: { id: percentPromoId },
      });
      expect(promoAfter?.usageCount).toBe(1);
    });

    it('should apply automatic BOGO promotion and record item-level discount portion', async () => {
      // Create order with 3 burgers ($30 gross). BOGO applies $10 discount automatically.
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({
          orderType: 'DINE_IN',
          items: [{ menuItemId: itemBurgerId, quantity: 3 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.order.subtotal).toBe(30.0);
      expect(res.body.data.order.promotionDiscount).toBe(10.0);
      expect(res.body.data.order.totalDiscount).toBe(10.0);
      expect(res.body.data.order.items[0].promotionDiscount).toBe(10.0);
      // Tax: 10% on ($30 - $10 = $20) = $2.00 => Grand total = $22.00
      expect(res.body.data.order.grandTotal).toBe(22.0);
    });

    it('should combine manual item discount with order promotion discount correctly', async () => {
      // 1 Burger ($10) with 10% manual discount ($1) + WELCOME20 promo code (20% off subtotal)
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({
          orderType: 'DINE_IN',
          promoCode: 'WELCOME20',
          items: [
            {
              menuItemId: itemBurgerId,
              quantity: 2, // $20
              discountType: 'PERCENTAGE',
              discountValue: 10, // Manual item discount: 10% of $20 = $2
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.order.subtotal).toBe(20.0);
      expect(res.body.data.order.itemDiscountsTotal).toBe(2.0);
      expect(res.body.data.order.promotionDiscount).toBe(4.0);
      expect(res.body.data.order.totalDiscount).toBe(6.0); // $2 + $4
      // Tax: 10% on ($20 - $6 = $14) = $1.40 => Grand total = $15.40
      expect(res.body.data.order.grandTotal).toBe(15.4);
    });

    it('should view historical usage log of a promotion', async () => {
      const res = await request(app)
        .get(`/api/v1/promotions/${percentPromoId}/usages`)
        .set('Authorization', `Bearer ${managerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.usages.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.usages[0].discountAmount).toBeGreaterThan(0);
      expect(res.body.data.promotion.usageCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ===========================================================================
  // 4. Advanced Restrictions & Rules
  // ===========================================================================
  describe('4. Advanced Restrictions & Limits', () => {
    it('should enforce order-type restrictions (DELIVERY only promo fails on DINE_IN)', async () => {
      const deliveryOnlyPromo = await prisma.promotion.create({
        data: {
          restaurantId: restaurantAId,
          name: 'Delivery Only $3 Off',
          type: 'FIXED_AMOUNT',
          targetType: 'ORDER',
          discountValue: 3.0,
          orderTypes: ['DELIVERY'],
          isAutoApply: true,
          isActive: true,
          priority: 2,
        },
      });

      // Dine In preview -> Delivery Only promo should not qualify
      const previewRes = await request(app)
        .post('/api/v1/promotions/preview')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({
          orderType: 'DINE_IN',
          items: [{ menuItemId: itemBurgerId, quantity: 1 }],
        });

      expect(previewRes.status).toBe(200);
      const hasDeliveryPromo = previewRes.body.data.appliedPromotions.some(
        (p: { promotionId: string }) => p.promotionId === deliveryOnlyPromo.id,
      );
      expect(hasDeliveryPromo).toBe(false);

      // Clean up
      await prisma.promotion.delete({ where: { id: deliveryOnlyPromo.id } });
    });

    it('should enforce per-customer usage limits', async () => {
      const oneTimePromo = await prisma.promotion.create({
        data: {
          restaurantId: restaurantAId,
          name: 'One Time Coupon',
          code: 'ONETIME',
          type: 'FIXED_AMOUNT',
          targetType: 'ORDER',
          discountValue: 5.0,
          perCustomerLimit: 1,
          isActive: true,
        },
      });

      // First use by customer A
      const order1 = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({
          orderType: 'DINE_IN',
          promoCode: 'ONETIME',
          customerId: customerAId,
          items: [{ menuItemId: itemBurgerId, quantity: 2 }],
        });
      expect(order1.status).toBe(201);
      expect(order1.body.data.order.promotionDiscount).toBe(5.0);

      // Second use by same customer A should fail
      const order2 = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({
          orderType: 'DINE_IN',
          promoCode: 'ONETIME',
          customerId: customerAId,
          items: [{ menuItemId: itemBurgerId, quantity: 2 }],
        });
      expect(order2.status).toBe(400);
      expect(order2.body.error.message).toContain('maximum usage limit');

      // Clean up
      await prisma.promotionUsage.deleteMany({ where: { promotionId: oneTimePromo.id } });
      await prisma.promotion.delete({ where: { id: oneTimePromo.id } });
    });

    it('should enforce global usage limit', async () => {
      const limitedPromo = await prisma.promotion.create({
        data: {
          restaurantId: restaurantAId,
          name: 'First 1 Customers Only',
          code: 'FIRST1',
          type: 'FIXED_AMOUNT',
          targetType: 'ORDER',
          discountValue: 2.0,
          usageLimit: 1,
          isActive: true,
        },
      });

      // 1st order succeeds
      const order1 = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({
          orderType: 'DINE_IN',
          promoCode: 'FIRST1',
          items: [{ menuItemId: itemBurgerId, quantity: 1 }],
        });
      expect(order1.status).toBe(201);

      // 2nd order fails due to global limit
      const order2 = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({
          orderType: 'DINE_IN',
          promoCode: 'FIRST1',
          items: [{ menuItemId: itemBurgerId, quantity: 1 }],
        });
      expect(order2.status).toBe(400);
      expect(order2.body.error.message).toContain('usage limit has been reached');

      // Clean up
      await prisma.promotionUsage.deleteMany({ where: { promotionId: limitedPromo.id } });
      await prisma.promotion.delete({ where: { id: limitedPromo.id } });
    });
  });

  // ===========================================================================
  // 5. Security, RBAC & Multi-Tenant Isolation
  // ===========================================================================
  describe('5. Security, RBAC & Multi-Tenant Isolation', () => {
    it('should return 401 for unauthenticated requests', async () => {
      const res = await request(app).get('/api/v1/promotions');
      expect(res.status).toBe(401);
    });

    it('should return 403 when Cashier tries to create a promotion (requires promotions.manage)', async () => {
      const res = await request(app)
        .post('/api/v1/promotions')
        .set('Authorization', `Bearer ${cashierAToken}`)
        .send({
          name: 'Cashier Unauthorized Promo',
          discountValue: 10.0,
        });

      expect(res.status).toBe(403);
    });

    it('should isolate promotions between different restaurants', async () => {
      // Tenant B tries to access Restaurant A's promotion
      const res = await request(app)
        .get(`/api/v1/promotions/${percentPromoId}`)
        .set('Authorization', `Bearer ${tenantBToken}`);

      expect(res.status).toBe(404);

      // Tenant B tries to use Restaurant A's promo code
      const validateRes = await request(app)
        .post('/api/v1/promotions/validate-code')
        .set('Authorization', `Bearer ${tenantBToken}`)
        .send({
          code: 'WELCOME20',
        });

      expect(validateRes.status).toBe(404);
    });

    it('should allow Owner to delete a promotion', async () => {
      const promoToDelete = await prisma.promotion.create({
        data: {
          restaurantId: restaurantAId,
          name: 'Temporary Promo to Delete',
          discountValue: 5.0,
        },
      });

      const res = await request(app)
        .delete(`/api/v1/promotions/${promoToDelete.id}`)
        .set('Authorization', `Bearer ${ownerAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const check = await prisma.promotion.findUnique({ where: { id: promoToDelete.id } });
      expect(check).toBeNull();
    });
  });
});
