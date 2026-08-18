import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

function hashValue(val: string): string {
  return crypto.createHash('sha256').update(val).digest('hex');
}

describe('Database Foundation & Multi-Tenant RBAC Integration Tests', () => {
  const testRunId = crypto.randomUUID().slice(0, 8);
  let restaurantAId: string;
  let restaurantBId: string;
  let testUserId: string;
  let testRoleId: string;
  let testPermissionId: string;

  beforeAll(async () => {
    await prisma.$connect();

    // Ensure a test permission exists
    const perm = await prisma.permission.upsert({
      where: { key: 'orders.view' },
      update: {},
      create: {
        key: 'orders.view',
        description: 'View order list and details',
      },
    });
    testPermissionId = perm.id;
  });

  afterAll(async () => {
    // Cleanup created test restaurants and cascades
    if (restaurantAId) {
      await prisma.restaurant.deleteMany({
        where: { id: { in: [restaurantAId, restaurantBId].filter(Boolean) } },
      });
    }
    await prisma.$disconnect();
  });

  describe('1. Restaurant (Tenant) Model & Constraints', () => {
    it('should create a restaurant with default values and custom fields', async () => {
      const restaurant = await prisma.restaurant.create({
        data: {
          name: `Test Bistro ${testRunId}`,
          slug: `test-bistro-${testRunId}`,
          phone: '+1-555-0100',
          address: '123 Main St, Springfield',
          currency: 'USD',
          timezone: 'America/New_York',
        },
      });

      restaurantAId = restaurant.id;

      expect(restaurant.id).toBeDefined();
      expect(restaurant.name).toBe(`Test Bistro ${testRunId}`);
      expect(restaurant.slug).toBe(`test-bistro-${testRunId}`);
      expect(restaurant.currency).toBe('USD');
      expect(restaurant.timezone).toBe('America/New_York');
      expect(restaurant.isActive).toBe(true);
      expect(restaurant.createdAt).toBeInstanceOf(Date);
      expect(restaurant.updatedAt).toBeInstanceOf(Date);
    });

    it('should enforce unique constraint on restaurant slug', async () => {
      await expect(
        prisma.restaurant.create({
          data: {
            name: `Duplicate Slug Bistro`,
            slug: `test-bistro-${testRunId}`, // duplicate slug
          },
        }),
      ).rejects.toThrowError(Prisma.PrismaClientKnownRequestError);
    });
  });

  describe('2. User Model & Multi-Tenant Scoping', () => {
    it('should create a user belonging to a restaurant', async () => {
      const user = await prisma.user.create({
        data: {
          restaurantId: restaurantAId,
          name: 'Alice Staff',
          username: `alice_${testRunId}`,
          pinHash: hashValue('1122'),
          passwordHash: hashValue('AliceSecretPassword!'),
          isActive: true,
        },
      });

      testUserId = user.id;

      expect(user.id).toBeDefined();
      expect(user.restaurantId).toBe(restaurantAId);
      expect(user.name).toBe('Alice Staff');
      expect(user.username).toBe(`alice_${testRunId}`);
      expect(user.pinHash).toBe(hashValue('1122'));
      expect(user.passwordHash).toBe(hashValue('AliceSecretPassword!'));
      expect(user.isActive).toBe(true);
      expect(user.lastLoginAt).toBeNull();
    });

    it('should enforce username uniqueness within the SAME restaurant', async () => {
      await expect(
        prisma.user.create({
          data: {
            restaurantId: restaurantAId,
            name: 'Alice Clone',
            username: `alice_${testRunId}`, // duplicate username in same restaurant
            pinHash: hashValue('9999'),
          },
        }),
      ).rejects.toThrowError(Prisma.PrismaClientKnownRequestError);
    });

    it('should ALLOW the SAME username in a DIFFERENT restaurant', async () => {
      // Create Restaurant B
      const restaurantB = await prisma.restaurant.create({
        data: {
          name: `Branch B ${testRunId}`,
          slug: `branch-b-${testRunId}`,
        },
      });
      restaurantBId = restaurantB.id;

      // Create user with same username in Restaurant B
      const userInB = await prisma.user.create({
        data: {
          restaurantId: restaurantB.id,
          name: 'Alice in Branch B',
          username: `alice_${testRunId}`, // identical username, different restaurant
          pinHash: hashValue('3344'),
        },
      });

      expect(userInB.id).toBeDefined();
      expect(userInB.restaurantId).toBe(restaurantB.id);
      expect(userInB.username).toBe(`alice_${testRunId}`);
    });
  });

  describe('3. Role & Permission Models (RBAC)', () => {
    it('should create a role belonging to a restaurant and link permissions', async () => {
      const role = await prisma.role.create({
        data: {
          restaurantId: restaurantAId,
          name: `Custom Supervisor ${testRunId}`,
          description: 'Supervisor role for test restaurant',
          isSystem: false,
        },
      });

      testRoleId = role.id;

      expect(role.id).toBeDefined();
      expect(role.restaurantId).toBe(restaurantAId);
      expect(role.name).toBe(`Custom Supervisor ${testRunId}`);
      expect(role.isSystem).toBe(false);

      // Link permission to role
      const rolePermission = await prisma.rolePermission.create({
        data: {
          roleId: role.id,
          permissionId: testPermissionId,
        },
      });

      expect(rolePermission.id).toBeDefined();
      expect(rolePermission.roleId).toBe(role.id);
      expect(rolePermission.permissionId).toBe(testPermissionId);
    });

    it('should enforce unique constraint on role name within a restaurant', async () => {
      await expect(
        prisma.role.create({
          data: {
            restaurantId: restaurantAId,
            name: `Custom Supervisor ${testRunId}`, // duplicate role name in same restaurant
          },
        }),
      ).rejects.toThrowError(Prisma.PrismaClientKnownRequestError);
    });

    it('should enforce unique constraint on (roleId, permissionId) in RolePermission', async () => {
      await expect(
        prisma.rolePermission.create({
          data: {
            roleId: testRoleId,
            permissionId: testPermissionId, // duplicate pair
          },
        }),
      ).rejects.toThrowError(Prisma.PrismaClientKnownRequestError);
    });
  });

  describe('4. UserRole (User <-> Role Association)', () => {
    it('should assign a role to a user via UserRole join table', async () => {
      const userRole = await prisma.userRole.create({
        data: {
          userId: testUserId,
          roleId: testRoleId,
        },
      });

      expect(userRole.id).toBeDefined();
      expect(userRole.userId).toBe(testUserId);
      expect(userRole.roleId).toBe(testRoleId);

      // Query user with roles and permissions
      const userWithRoles = await prisma.user.findUnique({
        where: { id: testUserId },
        include: {
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: {
                    include: {
                      permission: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      expect(userWithRoles).not.toBeNull();
      expect(userWithRoles?.userRoles).toHaveLength(1);
      expect(userWithRoles?.userRoles[0].role.name).toBe(`Custom Supervisor ${testRunId}`);
      expect(userWithRoles?.userRoles[0].role.rolePermissions[0].permission.key).toBe(
        'orders.view',
      );
    });

    it('should enforce unique constraint on (userId, roleId) in UserRole', async () => {
      await expect(
        prisma.userRole.create({
          data: {
            userId: testUserId,
            roleId: testRoleId, // duplicate user-role assignment
          },
        }),
      ).rejects.toThrowError(Prisma.PrismaClientKnownRequestError);
    });
  });

  describe('5. Session Model', () => {
    let sessionTokenHash: string;

    it('should create a session associated with a user using hashed token', async () => {
      sessionTokenHash = hashValue(`token_${testRunId}_${Date.now()}`);
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days

      const session = await prisma.session.create({
        data: {
          userId: testUserId,
          tokenHash: sessionTokenHash,
          expiresAt,
        },
      });

      expect(session.id).toBeDefined();
      expect(session.userId).toBe(testUserId);
      expect(session.tokenHash).toBe(sessionTokenHash);
      expect(session.revokedAt).toBeNull();
      expect(session.expiresAt).toEqual(expiresAt);
      expect(session.lastUsedAt).toBeNull();
    });

    it('should enforce unique constraint on session tokenHash', async () => {
      await expect(
        prisma.session.create({
          data: {
            userId: testUserId,
            tokenHash: sessionTokenHash, // duplicate token hash
            expiresAt: new Date(Date.now() + 1000 * 60 * 60),
          },
        }),
      ).rejects.toThrowError(Prisma.PrismaClientKnownRequestError);
    });
  });

  describe('6. AuditLog Model & PostgreSQL JSONB Metadata', () => {
    it('should create audit log with structured JSONB metadata and user relation', async () => {
      const metadataPayload = {
        actionDetails: 'Table order #104 discounted 15%',
        discountCode: 'SUMMER15',
        amount: 45.5,
        itemsAffected: ['item_1', 'item_2'],
        authorizedBy: 'manager_override',
      };

      const auditLog = await prisma.auditLog.create({
        data: {
          restaurantId: restaurantAId,
          userId: testUserId,
          action: 'ORDER_DISCOUNT_APPLIED',
          entityType: 'ORDER',
          entityId: 'ord_987654',
          metadata: metadataPayload,
          ipAddress: '192.168.1.150',
        },
      });

      expect(auditLog.id).toBeDefined();
      expect(auditLog.restaurantId).toBe(restaurantAId);
      expect(auditLog.userId).toBe(testUserId);
      expect(auditLog.action).toBe('ORDER_DISCOUNT_APPLIED');
      expect(auditLog.entityType).toBe('ORDER');
      expect(auditLog.entityId).toBe('ord_987654');
      expect(auditLog.metadata).toEqual(metadataPayload);
      expect(auditLog.ipAddress).toBe('192.168.1.150');
      expect(auditLog.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('7. Referential Integrity & Cascade Deletions', () => {
    it('should cascade delete user roles and sessions when user is deleted, while setting auditLog userId to null', async () => {
      // Create a temporary user for deletion test
      const tempUser = await prisma.user.create({
        data: {
          restaurantId: restaurantAId,
          name: 'Temp User',
          username: `temp_${testRunId}`,
          pinHash: hashValue('0000'),
        },
      });

      // Attach a role
      await prisma.userRole.create({
        data: {
          userId: tempUser.id,
          roleId: testRoleId,
        },
      });

      // Attach a session
      const tempSessionHash = hashValue(`temp_token_${testRunId}`);
      await prisma.session.create({
        data: {
          userId: tempUser.id,
          tokenHash: tempSessionHash,
          expiresAt: new Date(Date.now() + 1000 * 3600),
        },
      });

      // Create an audit log by temp user
      const tempAudit = await prisma.auditLog.create({
        data: {
          restaurantId: restaurantAId,
          userId: tempUser.id,
          action: 'USER_LOGIN',
          entityType: 'AUTH',
          metadata: { device: 'POS Terminal #1' },
        },
      });

      // Delete the user
      await prisma.user.delete({
        where: { id: tempUser.id },
      });

      // Verify UserRoles were cascaded
      const orphanUserRoles = await prisma.userRole.findMany({
        where: { userId: tempUser.id },
      });
      expect(orphanUserRoles).toHaveLength(0);

      // Verify Sessions were cascaded
      const orphanSessions = await prisma.session.findMany({
        where: { userId: tempUser.id },
      });
      expect(orphanSessions).toHaveLength(0);

      // Verify AuditLog was preserved with userId set to NULL
      const preservedAudit = await prisma.auditLog.findUnique({
        where: { id: tempAudit.id },
      });
      expect(preservedAudit).not.toBeNull();
      expect(preservedAudit?.userId).toBeNull();
      expect(preservedAudit?.action).toBe('USER_LOGIN');
    });

    it('should cascade delete all restaurant entities when restaurant is deleted', async () => {
      // Delete restaurant B and verify cascade
      await prisma.restaurant.delete({
        where: { id: restaurantBId },
      });

      const usersInB = await prisma.user.findMany({
        where: { restaurantId: restaurantBId },
      });
      expect(usersInB).toHaveLength(0);
    });
  });
});
