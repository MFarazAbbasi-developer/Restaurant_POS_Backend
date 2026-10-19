import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { ManagerAuthService } from '../../src/modules/auth/manager-auth.service.js';
import { requirePermission } from '../../src/common/middlewares/permission.middleware.js';
import { authenticate } from '../../src/common/middlewares/auth.middleware.js';
import { ApiResponse } from '../../src/common/http/response.js';
import { errorHandler } from '../../src/common/middlewares/error.middleware.js';
import express, { type Application } from 'express';

describe('Faraz POS - Authentication Module Tests', () => {
  let restaurantId: string;
  let ownerUserId: string;
  let managerUserId: string;
  let cashierUserId: string;
  let inactiveUserId: string;
  let inactiveRestaurantId: string;

  let ownerAccessToken: string;
  let ownerRefreshToken: string;
  let cashierAccessToken: string;

  // Dedicated test app for testing RBAC middleware directly on specific test routes
  let rbacApp: Application;

  beforeAll(async () => {
    // 1. Fetch the seeded default restaurant
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: 'faraz-flagship' },
    });
    if (!restaurant) {
      throw new Error(
        'Database not seeded! Please run npm run prisma:seed:demo (destructive demo seed)',
      );
    }
    restaurantId = restaurant.id;

    // 2. Fetch seeded users
    const owner = await prisma.user.findUnique({
      where: {
        restaurantId_username: {
          restaurantId,
          username: 'owner_admin',
        },
      },
    });
    const manager = await prisma.user.findUnique({
      where: {
        restaurantId_username: {
          restaurantId,
          username: 'manager_john',
        },
      },
    });
    const cashier = await prisma.user.findUnique({
      where: {
        restaurantId_username: {
          restaurantId,
          username: 'cashier_sarah',
        },
      },
    });

    if (!owner || !manager || !cashier) {
      throw new Error('Default users not found. Run seed first.');
    }

    ownerUserId = owner.id;
    managerUserId = manager.id;
    cashierUserId = cashier.id;

    // 3. Create an inactive user for testing inactive account rejection
    const inactiveUser = await prisma.user.upsert({
      where: {
        restaurantId_username: {
          restaurantId,
          username: 'inactive_staff',
        },
      },
      update: {
        isActive: false,
      },
      create: {
        restaurantId,
        name: 'Inactive Staff',
        username: 'inactive_staff',
        pinHash: await AuthService.hashPin('9999'),
        isActive: false,
      },
    });
    inactiveUserId = inactiveUser.id;

    // 4. Create an inactive restaurant for testing inactive restaurant rejection
    const inactiveRestaurant = await prisma.restaurant.upsert({
      where: { slug: 'inactive-branch' },
      update: { isActive: false },
      create: {
        name: 'Inactive Branch',
        slug: 'inactive-branch',
        isActive: false,
      },
    });
    inactiveRestaurantId = inactiveRestaurant.id;

    await prisma.user.upsert({
      where: {
        restaurantId_username: {
          restaurantId: inactiveRestaurant.id,
          username: 'user_in_inactive_resto',
        },
      },
      update: {},
      create: {
        restaurantId: inactiveRestaurant.id,
        name: 'Resto Inactive User',
        username: 'user_in_inactive_resto',
        pinHash: await AuthService.hashPin('1234'),
        isActive: true,
      },
    });

    // 5. Setup RBAC test app
    rbacApp = express();
    rbacApp.use(express.json());
    rbacApp.get(
      '/test/orders-create',
      authenticate,
      requirePermission('orders.create'),
      (_req, res) => ApiResponse.success(res, { message: 'Order created' }),
    );
    rbacApp.get(
      '/test/reports-export',
      authenticate,
      requirePermission('reports.export'),
      (_req, res) => ApiResponse.success(res, { message: 'Reports exported' }),
    );
    rbacApp.use(errorHandler);
  });

  afterAll(async () => {
    // Cleanup inactive test data
    if (inactiveUserId) {
      await prisma.user.deleteMany({ where: { id: inactiveUserId } });
    }
    if (inactiveRestaurantId) {
      await prisma.restaurant.deleteMany({ where: { id: inactiveRestaurantId } });
    }
  });

  describe('1. POST /api/v1/auth/login', () => {
    it('should successfully log in with valid username and PIN', async () => {
      const response = await request(app).post('/api/v1/auth/login').send({
        username: 'owner_admin',
        pin: '1234',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Login successful');
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data.expiresIn).toBe(900);
      expect(response.body.data.user).toMatchObject({
        id: ownerUserId,
        username: 'owner_admin',
        restaurantId,
      });
      expect(response.body.data.user.roles).toContain('OWNER');
      expect(response.body.data.user.permissions).toContain('orders.view');

      // Verify sensitive credentials are NOT returned
      expect(response.body.data.user).not.toHaveProperty('pinHash');
      expect(response.body.data.user).not.toHaveProperty('passwordHash');

      ownerAccessToken = response.body.data.accessToken;
      ownerRefreshToken = response.body.data.refreshToken;

      // Verify lastLoginAt updated
      const updatedUser = await prisma.user.findUnique({
        where: { id: ownerUserId },
      });
      expect(updatedUser?.lastLoginAt).not.toBeNull();

      // Verify AuditLog was recorded
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          userId: ownerUserId,
          action: 'LOGIN_SUCCESS',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog?.action).toBe('LOGIN_SUCCESS');
    });

    it('should log in cashier and return cashier roles/permissions', async () => {
      const response = await request(app).post('/api/v1/auth/login').send({
        username: 'cashier_sarah',
        pin: '4321',
      });

      expect(response.status).toBe(200);
      expect(response.body.data.user.id).toBe(cashierUserId);
      expect(response.body.data.user.roles).toContain('CASHIER');
      expect(response.body.data.user.permissions).toContain('orders.create');
      expect(response.body.data.user.permissions).not.toContain('reports.export');

      cashierAccessToken = response.body.data.accessToken;
    });

    it('should support password login for administrative users', async () => {
      const response = await request(app).post('/api/v1/auth/login').send({
        username: 'owner_admin',
        password: 'FarazAdmin2026!',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
    });

    it('should reject non-existent username with generic 401 error', async () => {
      const response = await request(app).post('/api/v1/auth/login').send({
        username: 'non_existent_user_9999',
        pin: '1234',
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toBe('Invalid credentials');
    });

    it('should reject incorrect PIN with generic 401 error and log failed audit', async () => {
      const response = await request(app).post('/api/v1/auth/login').send({
        username: 'owner_admin',
        pin: '0000', // incorrect PIN
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toBe('Invalid credentials');

      // Verify LOGIN_FAILED audit log
      const failedAudit = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          userId: ownerUserId,
          action: 'LOGIN_FAILED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(failedAudit).not.toBeNull();
    });

    it('should reject inactive user with generic 401 error', async () => {
      const response = await request(app).post('/api/v1/auth/login').send({
        username: 'inactive_staff',
        pin: '9999',
      });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Invalid credentials');
    });

    it('should reject user belonging to inactive restaurant with 401 error', async () => {
      const response = await request(app).post('/api/v1/auth/login').send({
        restaurantId: inactiveRestaurantId,
        username: 'user_in_inactive_resto',
        pin: '1234',
      });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Invalid credentials');
    });

    it('should return 400 validation error if both PIN and password are missing', async () => {
      const response = await request(app).post('/api/v1/auth/login').send({
        username: 'owner_admin',
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('2. POST /api/v1/auth/refresh (Rotation & Sessions)', () => {
    it('should rotate refresh token and issue new access token', async () => {
      const response = await request(app).post('/api/v1/auth/refresh').send({
        refreshToken: ownerRefreshToken,
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data.refreshToken).not.toBe(ownerRefreshToken);

      const oldRefreshToken = ownerRefreshToken;
      ownerRefreshToken = response.body.data.refreshToken;
      ownerAccessToken = response.body.data.accessToken;

      // Verify old session is now revoked in database
      const oldTokenHash = AuthService.hashRefreshToken(oldRefreshToken);
      const oldSession = await prisma.session.findUnique({
        where: { tokenHash: oldTokenHash },
      });
      expect(oldSession?.revokedAt).not.toBeNull();

      // Verify new session exists and is active
      const newTokenHash = AuthService.hashRefreshToken(ownerRefreshToken);
      const newSession = await prisma.session.findUnique({
        where: { tokenHash: newTokenHash },
      });
      expect(newSession?.revokedAt).toBeNull();
    });

    it('should reject reused / revoked refresh token', async () => {
      // Re-use an already rotated token
      const oldToken = 'dummy_revoked_token_' + Date.now();
      const oldHash = AuthService.hashRefreshToken(oldToken);
      await prisma.session.create({
        data: {
          userId: ownerUserId,
          tokenHash: oldHash,
          expiresAt: new Date(Date.now() + 1000 * 3600),
          revokedAt: new Date(), // revoked
        },
      });

      const response = await request(app).post('/api/v1/auth/refresh').send({
        refreshToken: oldToken,
      });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Refresh token has been revoked');
    });

    it('should reject expired refresh token', async () => {
      const expiredToken = 'expired_token_' + Date.now();
      const expiredHash = AuthService.hashRefreshToken(expiredToken);
      await prisma.session.create({
        data: {
          userId: ownerUserId,
          tokenHash: expiredHash,
          expiresAt: new Date(Date.now() - 1000 * 60), // expired 1 min ago
        },
      });

      const response = await request(app).post('/api/v1/auth/refresh').send({
        refreshToken: expiredToken,
      });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Refresh token has expired');
    });

    it('should reject invalid / unseeded refresh token', async () => {
      const response = await request(app).post('/api/v1/auth/refresh').send({
        refreshToken: 'completely_invalid_refresh_token_string',
      });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Invalid or expired refresh token');
    });
  });

  describe('3. GET /api/v1/auth/me', () => {
    it('should return current authenticated user profile and permissions', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${ownerAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toMatchObject({
        id: ownerUserId,
        username: 'owner_admin',
        name: 'Faraz Owner',
        isActive: true,
      });
      expect(response.body.data.user.restaurant).toMatchObject({
        id: restaurantId,
        slug: 'faraz-flagship',
        currency: 'PKR',
      });
      expect(response.body.data.user.roles).toHaveLength(1);
      expect(response.body.data.user.roles[0].name).toBe('OWNER');
      expect(response.body.data.user.permissions).toContain('orders.view');
      expect(response.body.data.user.permissions).toContain('reports.export');

      // Ensure no sensitive fields
      expect(response.body.data.user).not.toHaveProperty('pinHash');
      expect(response.body.data.user).not.toHaveProperty('passwordHash');
    });

    it('should reject request when Authorization header is missing', async () => {
      const response = await request(app).get('/api/v1/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject request with malformed or invalid JWT token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid.token.value');

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe('Invalid access token');
    });
  });

  describe('4. POST /api/v1/auth/logout & POST /api/v1/auth/logout-all', () => {
    it('should log out and revoke the active session', async () => {
      // Create a fresh session for logout testing
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'owner_admin', pin: '1234' });

      const tempAccessToken = loginRes.body.data.accessToken;
      const tempRefreshToken = loginRes.body.data.refreshToken;

      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${tempAccessToken}`)
        .send({ refreshToken: tempRefreshToken });

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.message).toBe('Logged out successfully');

      // Verify the session can no longer refresh
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: tempRefreshToken });

      expect(refreshRes.status).toBe(401);
      expect(refreshRes.body.error.message).toBe('Refresh token has been revoked');
    });

    it('should revoke all active sessions on logout-all', async () => {
      // Create 2 distinct sessions for manager
      const sess1 = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'manager_john', pin: '2233' });
      const sess2 = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'manager_john', pin: '2233' });

      const managerToken = sess1.body.data.accessToken;
      const ref1 = sess1.body.data.refreshToken;
      const ref2 = sess2.body.data.refreshToken;

      const logoutAllRes = await request(app)
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(logoutAllRes.status).toBe(200);
      expect(logoutAllRes.body.data.revokedCount).toBeGreaterThanOrEqual(2);

      // Verify neither token can refresh
      const tryRefresh1 = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: ref1 });
      const tryRefresh2 = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: ref2 });

      expect(tryRefresh1.status).toBe(401);
      expect(tryRefresh2.status).toBe(401);
    });
  });

  describe('5. RBAC Permission Middleware (requirePermission)', () => {
    it('should ALLOW user with required permission (Cashier -> orders.create)', async () => {
      const response = await request(rbacApp)
        .get('/test/orders-create')
        .set('Authorization', `Bearer ${cashierAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Order created');
    });

    it('should REJECT user missing required permission with 403 Forbidden (Cashier -> reports.export)', async () => {
      const response = await request(rbacApp)
        .get('/test/reports-export')
        .set('Authorization', `Bearer ${cashierAccessToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(response.body.error.message).toContain('reports.export');
    });

    it('should ALLOW OWNER role to bypass / access any protected route', async () => {
      const response = await request(rbacApp)
        .get('/test/reports-export')
        .set('Authorization', `Bearer ${ownerAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Reports exported');
    });
  });

  describe('6. Manager PIN Verification Foundation (ManagerAuthService)', () => {
    it('should verify valid Manager PIN for sensitive permission (orders.discount)', async () => {
      const result = await ManagerAuthService.verifyManagerPin({
        restaurantId,
        pin: '2233', // manager_john PIN
        requiredPermission: 'orders.discount',
      });

      expect(result).toBeDefined();
      expect(result.id).toBe(managerUserId);
      expect(result.username).toBe('manager_john');
      expect(result.roles).toContain('MANAGER');
    });

    it('should reject Cashier PIN when verifying manager permission (e.g. reports.export)', async () => {
      await expect(
        ManagerAuthService.verifyManagerPin({
          restaurantId,
          pin: '4321', // cashier_sarah PIN
          requiredPermission: 'reports.export',
        }),
      ).rejects.toThrowError('Manager authorization failed');
    });

    it('should reject wrong PIN for manager verification', async () => {
      await expect(
        ManagerAuthService.verifyManagerPin({
          restaurantId,
          pin: '9999', // wrong PIN
          requiredPermission: 'orders.discount',
        }),
      ).rejects.toThrowError('Manager authorization failed');
    });
  });
});
