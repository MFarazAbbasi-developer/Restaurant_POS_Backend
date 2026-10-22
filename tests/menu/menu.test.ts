import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

describe('FARMAX POS - Menu Management Module Tests', () => {
  let restaurantId: string;
  let ownerAccessToken: string;
  let managerAccessToken: string;
  let waiterAccessToken: string;

  let createdCategoryId: string;
  let secondCategoryId: string;
  let createdItemId: string;
  let createdVariantId: string;
  let createdModifierGroupId: string;
  let createdModifierId: string;

  beforeAll(async () => {
    // 1. Fetch default restaurant
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: 'flagship-shinwari' },
    });
    if (!restaurant) {
      throw new Error('Database not seeded!');
    }
    restaurantId = restaurant.id;

    // 2. Login as Owner (all permissions)
    const ownerLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'owner_admin',
      pin: '1234',
    });
    ownerAccessToken = ownerLogin.body.data.accessToken;

    // 3. Login as Manager (has menu.view, menu.manage, menu.price_update)
    const managerLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'manager_john',
      pin: '2233',
    });
    managerAccessToken = managerLogin.body.data.accessToken;

    // 4. Create / Login as Waiter (has menu.view, but NOT menu.manage or menu.price_update)
    const waiterRole = await prisma.role.findFirst({
      where: { restaurantId, name: 'WAITER' },
    });

    let waiterUser = await prisma.user.findFirst({
      where: { restaurantId, username: 'test_waiter_user' },
    });

    if (!waiterUser && waiterRole) {
      const pinHash = await (await import('bcrypt')).hash('9988', 10);
      waiterUser = await prisma.user.create({
        data: {
          restaurantId,
          name: 'Test Waiter',
          username: 'test_waiter_user',
          pinHash,
          userRoles: {
            create: { roleId: waiterRole.id },
          },
        },
      });
    }

    const waiterLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'test_waiter_user',
      pin: '9988',
    });
    waiterAccessToken = waiterLogin.body.data.accessToken;
  });

  afterAll(async () => {
    // Clean up test data created during menu tests
    if (createdItemId) {
      await prisma.menuItemModifierGroup.deleteMany({ where: { menuItemId: createdItemId } });
      await prisma.menuItemVariant.deleteMany({ where: { menuItemId: createdItemId } });
      await prisma.menuItem.deleteMany({ where: { id: createdItemId } });
    }
    if (createdModifierGroupId) {
      await prisma.modifier.deleteMany({ where: { modifierGroupId: createdModifierGroupId } });
      await prisma.modifierGroup.deleteMany({ where: { id: createdModifierGroupId } });
    }
    if (createdCategoryId || secondCategoryId) {
      await prisma.category.deleteMany({
        where: { id: { in: [createdCategoryId, secondCategoryId].filter(Boolean) } },
      });
    }
    await prisma.user.deleteMany({
      where: { username: 'test_waiter_user' },
    });
  });

  // ===========================================================================
  // 1. Categories
  // ===========================================================================
  describe('1. Category CRUD & Reordering', () => {
    it('should create a new category with menu.manage permission', async () => {
      const response = await request(app)
        .post('/api/v1/menu/categories')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          name: 'Burgers & Sandwiches',
          description: 'Gourmet handcrafted burgers with premium beef and brioche buns',
          sortOrder: 1,
          isActive: true,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.category).toMatchObject({
        name: 'Burgers & Sandwiches',
        description: 'Gourmet handcrafted burgers with premium beef and brioche buns',
        sortOrder: 1,
        isActive: true,
        restaurantId,
      });

      createdCategoryId = response.body.data.category.id;

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: createdCategoryId,
          action: 'MENU_CATEGORY_CREATED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should create a second category for reordering tests', async () => {
      const response = await request(app)
        .post('/api/v1/menu/categories')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          name: 'Beverages & Mocktails',
          description: 'Refreshing chilled drinks and freshly brewed coffees',
          sortOrder: 2,
          isActive: true,
        });

      expect(response.status).toBe(201);
      secondCategoryId = response.body.data.category.id;
    });

    it('should list categories sorted by sortOrder', async () => {
      const response = await request(app)
        .get('/api/v1/menu/categories')
        .set('Authorization', `Bearer ${waiterAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.categories.length).toBeGreaterThanOrEqual(2);
      expect(response.body.data.categories[0].sortOrder).toBeLessThanOrEqual(
        response.body.data.categories[1].sortOrder,
      );
    });

    it('should get a single category by ID', async () => {
      const response = await request(app)
        .get(`/api/v1/menu/categories/${createdCategoryId}`)
        .set('Authorization', `Bearer ${waiterAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.category.id).toBe(createdCategoryId);
      expect(response.body.data.category.name).toBe('Burgers & Sandwiches');
    });

    it('should update category name and description', async () => {
      const response = await request(app)
        .patch(`/api/v1/menu/categories/${createdCategoryId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          name: 'Gourmet Burgers',
          description: 'Updated premium description',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.category.name).toBe('Gourmet Burgers');
      expect(response.body.data.category.description).toBe('Updated premium description');

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: createdCategoryId,
          action: 'MENU_CATEGORY_UPDATED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should toggle category active status', async () => {
      const response = await request(app)
        .patch(`/api/v1/menu/categories/${createdCategoryId}/status`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          isActive: false,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.category.isActive).toBe(false);

      // Reactivate
      const reactivate = await request(app)
        .patch(`/api/v1/menu/categories/${createdCategoryId}/status`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          isActive: true,
        });

      expect(reactivate.status).toBe(200);
      expect(reactivate.body.data.category.isActive).toBe(true);
    });

    it('should atomically reorder categories', async () => {
      const response = await request(app)
        .patch('/api/v1/menu/categories/reorder')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          items: [
            { id: createdCategoryId, sortOrder: 10 },
            { id: secondCategoryId, sortOrder: 5 },
          ],
        });

      expect(response.status).toBe(200);
      const cat1 = response.body.data.categories.find(
        (c: { id: string }) => c.id === createdCategoryId,
      );
      const cat2 = response.body.data.categories.find(
        (c: { id: string }) => c.id === secondCategoryId,
      );
      expect(cat1.sortOrder).toBe(10);
      expect(cat2.sortOrder).toBe(5);
    });

    it('should reject category creation from user without menu.manage (Waiter) with 403', async () => {
      const response = await request(app)
        .post('/api/v1/menu/categories')
        .set('Authorization', `Bearer ${waiterAccessToken}`)
        .send({
          name: 'Unauthorized Category',
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  // ===========================================================================
  // 2. Menu Items
  // ===========================================================================
  describe('2. Menu Items CRUD & Availability', () => {
    it('should create a menu item with basePrice and decimal precision', async () => {
      const response = await request(app)
        .post('/api/v1/menu/items')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          categoryId: createdCategoryId,
          itemCode: 'BGR-001',
          name: 'Classic Smash Burger',
          urduName: 'کلاسک اسمیش برگر',
          description: 'Double smashed beef patties with cheddar and house sauce',
          basePrice: 14.99,
          taxRate: 8.88,
          sortOrder: 1,
          isActive: true,
          isAvailable: true,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.item).toMatchObject({
        itemCode: 'BGR-001',
        name: 'Classic Smash Burger',
        urduName: 'کلاسک اسمیش برگر',
        categoryId: createdCategoryId,
        isActive: true,
        isAvailable: true,
      });
      expect(Number(response.body.data.item.basePrice)).toBe(14.99);

      createdItemId = response.body.data.item.id;

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: createdItemId,
          action: 'MENU_ITEM_CREATED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should reject duplicate itemCode in same restaurant with 409 Conflict', async () => {
      const response = await request(app)
        .post('/api/v1/menu/items')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          categoryId: createdCategoryId,
          itemCode: 'BGR-001', // duplicate
          name: 'Another Burger',
          basePrice: 12.0,
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
      expect(response.body.error.message).toContain('already exists');
    });

    it('should reject item creation with non-existent category with 400 Bad Request', async () => {
      const dummyCatId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .post('/api/v1/menu/items')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          categoryId: dummyCatId,
          itemCode: 'BGR-999',
          name: 'Bad Cat Burger',
          basePrice: 10.0,
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('BAD_REQUEST');
    });

    it('should list menu items with search and category filters', async () => {
      const response = await request(app)
        .get(`/api/v1/menu/items?categoryId=${createdCategoryId}&search=Smash`)
        .set('Authorization', `Bearer ${waiterAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.items.length).toBe(1);
      expect(response.body.data.items[0].itemCode).toBe('BGR-001');
    });

    it('should get a single menu item by ID', async () => {
      const response = await request(app)
        .get(`/api/v1/menu/items/${createdItemId}`)
        .set('Authorization', `Bearer ${waiterAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.item.id).toBe(createdItemId);
      expect(response.body.data.item.name).toBe('Classic Smash Burger');
      expect(response.body.data.item).toHaveProperty('variants');
      expect(response.body.data.item).toHaveProperty('modifierGroups');
    });

    it('should update item details and base price when holding menu.price_update', async () => {
      const response = await request(app)
        .patch(`/api/v1/menu/items/${createdItemId}`)
        .set('Authorization', `Bearer ${managerAccessToken}`)
        .send({
          name: 'Double Classic Smash Burger',
          basePrice: 16.5,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.item.name).toBe('Double Classic Smash Burger');
      expect(Number(response.body.data.item.basePrice)).toBe(16.5);

      // Verify price change audit log
      const priceAudit = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: createdItemId,
          action: 'MENU_ITEM_PRICE_CHANGED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(priceAudit).not.toBeNull();
    });

    it('should toggle 86 / out of stock availability', async () => {
      const response = await request(app)
        .patch(`/api/v1/menu/items/${createdItemId}/availability`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          isAvailable: false,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.item.isAvailable).toBe(false);

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: createdItemId,
          action: 'MENU_ITEM_AVAILABILITY_CHANGED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog).not.toBeNull();

      // Restore availability
      await request(app)
        .patch(`/api/v1/menu/items/${createdItemId}/availability`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          isAvailable: true,
        });
    });
  });

  // ===========================================================================
  // 3. Portion / Price Variants
  // ===========================================================================
  describe('3. Portion / Price Variants', () => {
    it('should create variants for a menu item', async () => {
      const response = await request(app)
        .post(`/api/v1/menu/items/${createdItemId}/variants`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          name: 'Double Patty',
          price: 18.0,
          sortOrder: 1,
          isActive: true,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.variant.name).toBe('Double Patty');
      expect(Number(response.body.data.variant.price)).toBe(18.0);
      expect(response.body.data.variant.menuItemId).toBe(createdItemId);

      createdVariantId = response.body.data.variant.id;

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: createdVariantId,
          action: 'MENU_VARIANT_CREATED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should update variant price and name', async () => {
      const response = await request(app)
        .patch(`/api/v1/menu/variants/${createdVariantId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          name: 'Triple Patty Monster',
          price: 22.5,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.variant.name).toBe('Triple Patty Monster');
      expect(Number(response.body.data.variant.price)).toBe(22.5);
    });

    it('should delete a variant', async () => {
      const response = await request(app)
        .delete(`/api/v1/menu/variants/${createdVariantId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.deleted).toBe(true);

      // Verify it is gone
      const check = await prisma.menuItemVariant.findUnique({
        where: { id: createdVariantId },
      });
      expect(check).toBeNull();
    });
  });

  // ===========================================================================
  // 4. Modifier Groups & Modifiers
  // ===========================================================================
  describe('4. Modifier Groups & Modifiers', () => {
    it('should create a modifier group', async () => {
      const response = await request(app)
        .post('/api/v1/menu/modifier-groups')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          name: 'Extra Toppings',
          selectionType: 'MULTIPLE',
          minSelections: 0,
          maxSelections: 5,
          sortOrder: 1,
          isActive: true,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.modifierGroup.name).toBe('Extra Toppings');
      expect(response.body.data.modifierGroup.selectionType).toBe('MULTIPLE');
      expect(response.body.data.modifierGroup.maxSelections).toBe(5);

      createdModifierGroupId = response.body.data.modifierGroup.id;

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: createdModifierGroupId,
          action: 'MODIFIER_GROUP_CREATED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should reject invalid modifier group where minSelections > maxSelections', async () => {
      const response = await request(app)
        .post('/api/v1/menu/modifier-groups')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          name: 'Invalid Group',
          minSelections: 3,
          maxSelections: 1, // invalid
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should add modifier options to group', async () => {
      const response = await request(app)
        .post(`/api/v1/menu/modifier-groups/${createdModifierGroupId}/modifiers`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          name: 'Truffle Aioli',
          priceAdjustment: 2.5,
          sortOrder: 1,
          isActive: true,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.modifier.name).toBe('Truffle Aioli');
      expect(Number(response.body.data.modifier.priceAdjustment)).toBe(2.5);

      createdModifierId = response.body.data.modifier.id;

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: createdModifierId,
          action: 'MODIFIER_CREATED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should update modifier option details', async () => {
      const response = await request(app)
        .patch(`/api/v1/menu/modifiers/${createdModifierId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          name: 'Premium Truffle Aioli',
          priceAdjustment: 3.0,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.modifier.name).toBe('Premium Truffle Aioli');
      expect(Number(response.body.data.modifier.priceAdjustment)).toBe(3.0);
    });

    it('should list modifier groups with nested modifiers', async () => {
      const response = await request(app)
        .get('/api/v1/menu/modifier-groups')
        .set('Authorization', `Bearer ${waiterAccessToken}`);

      expect(response.status).toBe(200);
      expect(
        response.body.data.modifierGroups.some(
          (g: { id: string }) => g.id === createdModifierGroupId,
        ),
      ).toBe(true);
    });
  });

  // ===========================================================================
  // 5. Item ↔ Modifier Group Linking
  // ===========================================================================
  describe('5. Item ↔ Modifier Group Linking', () => {
    it('should link a modifier group to a menu item', async () => {
      const response = await request(app)
        .post(`/api/v1/menu/items/${createdItemId}/modifier-groups`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          modifierGroupId: createdModifierGroupId,
          sortOrder: 1,
          isRequired: false,
          minSelections: 0,
          maxSelections: 3,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.link.menuItemId).toBe(createdItemId);
      expect(response.body.data.link.modifierGroupId).toBe(createdModifierGroupId);

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          action: 'ITEM_MODIFIER_GROUP_LINKED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should unlink modifier group from menu item', async () => {
      const response = await request(app)
        .delete(`/api/v1/menu/items/${createdItemId}/modifier-groups/${createdModifierGroupId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.unlinked).toBe(true);

      // Re-link for POS retrieval test
      await request(app)
        .post(`/api/v1/menu/items/${createdItemId}/modifier-groups`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          modifierGroupId: createdModifierGroupId,
          sortOrder: 1,
        });
    });
  });

  // ===========================================================================
  // 6. POS Menu Retrieval
  // ===========================================================================
  describe('6. POS Menu Endpoint (GET /api/v1/menu/pos)', () => {
    it('should return nested active menu structure ready for POS consumption', async () => {
      const response = await request(app)
        .get('/api/v1/menu/pos')
        .set('Authorization', `Bearer ${waiterAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.restaurantId).toBe(restaurantId);
      expect(Array.isArray(response.body.data.categories)).toBe(true);

      // Locate test category
      const targetCategory = response.body.data.categories.find(
        (c: { id: string }) => c.id === createdCategoryId,
      );
      expect(targetCategory).toBeDefined();
      expect(targetCategory.items.length).toBeGreaterThanOrEqual(1);

      const targetItem = targetCategory.items.find((i: { id: string }) => i.id === createdItemId);
      expect(targetItem).toBeDefined();
      expect(targetItem.itemCode).toBe('BGR-001');
      expect(targetItem.modifierGroups.length).toBeGreaterThanOrEqual(1);
      expect(targetItem.modifierGroups[0].id).toBe(createdModifierGroupId);
      expect(targetItem.modifierGroups[0].modifiers.length).toBeGreaterThanOrEqual(1);
    });

    it('should exclude unavailable (86ed) items from POS menu payload', async () => {
      // 1. Mark item as unavailable
      await request(app)
        .patch(`/api/v1/menu/items/${createdItemId}/availability`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ isAvailable: false });

      // 2. Fetch POS menu
      const response = await request(app)
        .get('/api/v1/menu/pos')
        .set('Authorization', `Bearer ${waiterAccessToken}`);

      const targetCategory = response.body.data.categories.find(
        (c: { id: string }) => c.id === createdCategoryId,
      );

      const targetItem = targetCategory?.items.find((i: { id: string }) => i.id === createdItemId);
      expect(targetItem).toBeUndefined();

      // 3. Restore availability
      await request(app)
        .patch(`/api/v1/menu/items/${createdItemId}/availability`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({ isAvailable: true });
    });
  });
});
