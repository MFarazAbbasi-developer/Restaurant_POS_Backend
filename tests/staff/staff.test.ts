import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

describe('FARMAX POS - Staff Management Module Tests', () => {
  let restaurantId: string;
  let ownerAccessToken: string;
  let ownerUserId: string;
  let cashierAccessToken: string;
  let cashierUserId: string;

  let waiterRoleId: string;
  let cashierRoleId: string;
  let managerRoleId: string;

  let createdStaffId: string;

  beforeAll(async () => {
    // 1. Fetch default restaurant
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: 'faraz-flagship' },
    });
    if (!restaurant) {
      throw new Error('Database not seeded!');
    }
    restaurantId = restaurant.id;

    // 2. Fetch roles
    const roles = await prisma.role.findMany({
      where: { restaurantId },
    });
    const waiterRole = roles.find((r) => r.name === 'WAITER');
    const cashierRole = roles.find((r) => r.name === 'CASHIER');
    const managerRole = roles.find((r) => r.name === 'MANAGER');

    if (!waiterRole || !cashierRole || !managerRole) {
      throw new Error('Roles missing from seed');
    }

    waiterRoleId = waiterRole.id;
    cashierRoleId = cashierRole.id;
    managerRoleId = managerRole.id;

    // 3. Login as Owner
    const ownerLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'owner_admin',
      pin: '1234',
    });
    ownerAccessToken = ownerLogin.body.data.accessToken;
    ownerUserId = ownerLogin.body.data.user.id;

    // 4. Login as Cashier
    const cashierLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'cashier_sarah',
      pin: '4321',
    });
    cashierAccessToken = cashierLogin.body.data.accessToken;
    cashierUserId = cashierLogin.body.data.user.id;
  });

  afterAll(async () => {
    // Cleanup any staff created during tests
    if (createdStaffId) {
      await prisma.user.deleteMany({
        where: { id: createdStaffId },
      });
    }
  });

  describe('1. GET /api/v1/staff (Listing & Filtering)', () => {
    it('should list staff members with pagination for users with users.view', async () => {
      const response = await request(app)
        .get('/api/v1/staff')
        .set('Authorization', `Bearer ${ownerAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('items');
      expect(response.body.data).toHaveProperty('pagination');
      expect(response.body.data.items.length).toBeGreaterThanOrEqual(3);

      // Verify no sensitive hash fields are leaked
      for (const member of response.body.data.items) {
        expect(member).not.toHaveProperty('pinHash');
        expect(member).not.toHaveProperty('passwordHash');
        expect(member).toHaveProperty('roles');
        expect(Array.isArray(member.roles)).toBe(true);
      }
    });

    it('should filter staff by search query (username or name)', async () => {
      const response = await request(app)
        .get('/api/v1/staff?search=owner_admin')
        .set('Authorization', `Bearer ${ownerAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.items.length).toBe(1);
      expect(response.body.data.items[0].username).toBe('owner_admin');
    });

    it('should filter staff by roleId', async () => {
      const response = await request(app)
        .get(`/api/v1/staff?roleId=${cashierRoleId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`);

      expect(response.status).toBe(200);
      expect(
        response.body.data.items.some((u: { username: string }) => u.username === 'cashier_sarah'),
      ).toBe(true);
    });

    it('should filter staff by isActive status', async () => {
      const response = await request(app)
        .get('/api/v1/staff?isActive=true')
        .set('Authorization', `Bearer ${ownerAccessToken}`);

      expect(response.status).toBe(200);
      for (const u of response.body.data.items) {
        expect(u.isActive).toBe(true);
      }
    });

    it('should reject unauthenticated request with 401', async () => {
      const response = await request(app).get('/api/v1/staff');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('2. GET /api/v1/staff/roles', () => {
    it('should list all available roles for the restaurant', async () => {
      const response = await request(app)
        .get('/api/v1/staff/roles')
        .set('Authorization', `Bearer ${ownerAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.roles.length).toBeGreaterThanOrEqual(6);
      expect(response.body.data.roles.some((r: { name: string }) => r.name === 'OWNER')).toBe(true);
      expect(response.body.data.roles.some((r: { name: string }) => r.name === 'MANAGER')).toBe(
        true,
      );
      expect(response.body.data.roles.some((r: { name: string }) => r.name === 'CASHIER')).toBe(
        true,
      );
    });
  });

  describe('3. POST /api/v1/staff (Create Staff)', () => {
    it('should create new staff member with hashed PIN and assigned roles', async () => {
      const response = await request(app)
        .post('/api/v1/staff')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          name: 'David Waiter',
          username: 'waiter_david',
          phone: '+1 (555) 777-8888',
          pin: '5566',
          roleIds: [waiterRoleId],
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Staff member created successfully');
      expect(response.body.data.staff).toMatchObject({
        name: 'David Waiter',
        username: 'waiter_david',
        phone: '+1 (555) 777-8888',
        isActive: true,
        restaurantId,
      });
      expect(response.body.data.staff.roles).toHaveLength(1);
      expect(response.body.data.staff.roles[0].name).toBe('WAITER');

      // Ensure no sensitive hash leak
      expect(response.body.data.staff).not.toHaveProperty('pinHash');
      expect(response.body.data.staff).not.toHaveProperty('passwordHash');

      createdStaffId = response.body.data.staff.id;

      // Verify that created staff member can log in using their new PIN
      const loginTest = await request(app).post('/api/v1/auth/login').send({
        username: 'waiter_david',
        pin: '5566',
      });
      expect(loginTest.status).toBe(200);
      expect(loginTest.body.data.user.username).toBe('waiter_david');

      // Verify AuditLog creation
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: createdStaffId,
          action: 'STAFF_CREATED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog).not.toBeNull();
      const metadata = auditLog?.metadata as { username?: string } | null;
      expect(metadata?.username).toBe('waiter_david');
      // Verify raw PIN was NOT logged
      expect(JSON.stringify(auditLog?.metadata)).not.toContain('5566');
    });

    it('should reject duplicate username in same restaurant with 409 Conflict', async () => {
      const response = await request(app)
        .post('/api/v1/staff')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          name: 'Another David',
          username: 'waiter_david', // duplicate
          pin: '1122',
          roleIds: [waiterRoleId],
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CONFLICT');
      expect(response.body.error.message).toContain('Username already exists');
    });

    it('should reject staff creation with invalid PIN format (non-numeric or length < 4)', async () => {
      const response = await request(app)
        .post('/api/v1/staff')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          name: 'Invalid Staff',
          username: 'invalid_staff',
          pin: 'abc', // invalid PIN
          roleIds: [waiterRoleId],
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject unauthorized staff creation (e.g. Cashier) with 403 Forbidden', async () => {
      const response = await request(app)
        .post('/api/v1/staff')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          name: 'Unauthorized Staff',
          username: 'unauth_user',
          pin: '9999',
          roleIds: [waiterRoleId],
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('4. GET /api/v1/staff/:id', () => {
    it('should get single staff member by ID', async () => {
      const response = await request(app)
        .get(`/api/v1/staff/${createdStaffId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.staff.id).toBe(createdStaffId);
      expect(response.body.data.staff.username).toBe('waiter_david');
      expect(response.body.data.staff).not.toHaveProperty('pinHash');
    });

    it('should return 404 for non-existent staff ID', async () => {
      const dummyId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .get(`/api/v1/staff/${dummyId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('5. PATCH /api/v1/staff/:id (Update Profile)', () => {
    it('should update staff name and phone', async () => {
      const response = await request(app)
        .patch(`/api/v1/staff/${createdStaffId}`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          name: 'David Senior Waiter',
          phone: '+1 (555) 111-2222',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.staff.name).toBe('David Senior Waiter');
      expect(response.body.data.staff.phone).toBe('+1 (555) 111-2222');

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: createdStaffId,
          action: 'STAFF_UPDATED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog).not.toBeNull();
    });
  });

  describe('6. PATCH /api/v1/staff/:id/pin (Reset PIN)', () => {
    it('should reset staff PIN and enable login with new PIN', async () => {
      const response = await request(app)
        .patch(`/api/v1/staff/${createdStaffId}/pin`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          pin: '8899',
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Staff PIN updated successfully');

      // Verify login with new PIN works
      const newLogin = await request(app).post('/api/v1/auth/login').send({
        username: 'waiter_david',
        pin: '8899',
      });
      expect(newLogin.status).toBe(200);

      // Verify old PIN is rejected
      const oldLogin = await request(app).post('/api/v1/auth/login').send({
        username: 'waiter_david',
        pin: '5566',
      });
      expect(oldLogin.status).toBe(401);

      // Verify AuditLog does NOT contain raw PIN
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: createdStaffId,
          action: 'STAFF_PIN_CHANGED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog).not.toBeNull();
      expect(JSON.stringify(auditLog?.metadata)).not.toContain('8899');
    });
  });

  describe('7. PATCH /api/v1/staff/:id/roles (Role Assignment)', () => {
    it('should assign multiple roles to staff member', async () => {
      const response = await request(app)
        .patch(`/api/v1/staff/${createdStaffId}/roles`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          roleIds: [waiterRoleId, cashierRoleId],
        });

      expect(response.status).toBe(200);
      expect(response.body.data.staff.roles).toHaveLength(2);
      const roleNames = response.body.data.staff.roles.map((r: { name: string }) => r.name);
      expect(roleNames).toContain('WAITER');
      expect(roleNames).toContain('CASHIER');

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: createdStaffId,
          action: 'STAFF_ROLES_UPDATED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should prevent non-owner user from modifying their own roles', async () => {
      const response = await request(app)
        .patch(`/api/v1/staff/${cashierUserId}/roles`)
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          roleIds: [managerRoleId],
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });

    it('should protect primary OWNER account from losing OWNER role', async () => {
      const response = await request(app)
        .patch(`/api/v1/staff/${ownerUserId}/roles`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          roleIds: [waiterRoleId], // trying to remove OWNER role from owner
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(response.body.error.message).toContain('Cannot remove OWNER role');
    });
  });

  describe('8. PATCH /api/v1/staff/:id/status (Deactivation & Session Revocation)', () => {
    it('should protect primary OWNER from deactivation', async () => {
      const response = await request(app)
        .patch(`/api/v1/staff/${ownerUserId}/status`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          isActive: false,
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(response.body.error.message).toContain(
        'Cannot deactivate the primary restaurant owner',
      );
    });

    it('should deactivate staff and immediately revoke all active sessions', async () => {
      // 1. Log in as David to get active sessions
      const davidLogin = await request(app).post('/api/v1/auth/login').send({
        username: 'waiter_david',
        pin: '8899',
      });
      expect(davidLogin.status).toBe(200);
      const davidAccessToken = davidLogin.body.data.accessToken;
      const davidRefreshToken = davidLogin.body.data.refreshToken;

      // 2. Deactivate David
      const deactResponse = await request(app)
        .patch(`/api/v1/staff/${createdStaffId}/status`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          isActive: false,
        });

      expect(deactResponse.status).toBe(200);
      expect(deactResponse.body.data.staff.isActive).toBe(false);

      // 3. Verify David cannot use his access token on authenticated route
      const authMeResponse = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${davidAccessToken}`);
      expect(authMeResponse.status).toBe(401);

      // 4. Verify David cannot refresh token
      const refreshResponse = await request(app).post('/api/v1/auth/refresh').send({
        refreshToken: davidRefreshToken,
      });
      expect(refreshResponse.status).toBe(401);

      // 5. Verify David cannot log in while deactivated
      const loginTry = await request(app).post('/api/v1/auth/login').send({
        username: 'waiter_david',
        pin: '8899',
      });
      expect(loginTry.status).toBe(401);

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: createdStaffId,
          action: 'STAFF_DEACTIVATED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog).not.toBeNull();
    });

    it('should reactivate staff member successfully', async () => {
      const reactResponse = await request(app)
        .patch(`/api/v1/staff/${createdStaffId}/status`)
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          isActive: true,
        });

      expect(reactResponse.status).toBe(200);
      expect(reactResponse.body.data.staff.isActive).toBe(true);

      // Verify David can log in again
      const loginTry = await request(app).post('/api/v1/auth/login').send({
        username: 'waiter_david',
        pin: '8899',
      });
      expect(loginTry.status).toBe(200);

      // Verify AuditLog
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          entityId: createdStaffId,
          action: 'STAFF_ACTIVATED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(auditLog).not.toBeNull();
    });
  });
});
