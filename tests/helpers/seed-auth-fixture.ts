import bcrypt from 'bcrypt';
import { prisma } from '../../src/config/database.js';
import {
  DEFAULT_PERMISSIONS,
  ROLE_PERMISSIONS_MAP,
} from '../../src/common/rbac/permissions.catalog.js';

/**
 * Non-destructive auth fixture for disposable test DBs.
 * Upserts the demo restaurant + staff the auth suite expects, without TRUNCATE.
 * Never targets faraz_pos_db / farmax_pos_db (caller must set DATABASE_URL first).
 */
export async function ensureAuthTestFixture(): Promise<{
  restaurantId: string;
  ownerUserId: string;
  managerUserId: string;
  cashierUserId: string;
}> {
  for (const perm of DEFAULT_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      create: { key: perm.key, description: perm.description },
      update: { description: perm.description },
    });
  }

  const restaurant = await prisma.restaurant.upsert({
    where: { slug: 'flagship-shinwari' },
    update: {
      name: 'Flagship Shinwari & Desi Dera',
      isActive: true,
      currency: 'PKR',
      taxRate: 16.0,
      taxInclusive: false,
      timezone: 'Asia/Karachi',
    },
    create: {
      name: 'Flagship Shinwari & Desi Dera',
      slug: 'flagship-shinwari',
      currency: 'PKR',
      timezone: 'Asia/Karachi',
      taxRate: 16.0,
      taxInclusive: false,
      isActive: true,
    },
  });

  const permissionRows = await prisma.permission.findMany();
  const permissionIdByKey = new Map(permissionRows.map((p) => [p.key, p.id]));

  const roleIds = new Map<string, string>();
  for (const [roleName, config] of Object.entries(ROLE_PERMISSIONS_MAP)) {
    const role = await prisma.role.upsert({
      where: {
        restaurantId_name: { restaurantId: restaurant.id, name: roleName },
      },
      update: { description: config.description, isSystem: true },
      create: {
        restaurantId: restaurant.id,
        name: roleName,
        description: config.description,
        isSystem: true,
      },
    });
    roleIds.set(roleName, role.id);

    for (const permKey of config.permissions) {
      const permissionId = permissionIdByKey.get(permKey);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId },
        },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }

  const staff = [
    {
      username: 'owner_admin',
      name: 'Flagship Owner',
      role: 'OWNER',
      pin: '1234',
      password: 'FlagshipAdmin2026!',
    },
    {
      username: 'manager_john',
      name: 'Hamza Manager',
      role: 'MANAGER',
      pin: '2233',
      password: 'ManagerPass2026!',
    },
    {
      username: 'cashier_sarah',
      name: 'Sarah Cashier',
      role: 'CASHIER',
      pin: '4321',
      password: 'CashierPass2026!',
    },
  ] as const;

  const userIds: Record<string, string> = {};
  for (const s of staff) {
    const pinHash = await bcrypt.hash(s.pin, 10);
    const passwordHash = await bcrypt.hash(s.password, 10);
    const roleId = roleIds.get(s.role);
    if (!roleId) throw new Error(`Missing role ${s.role}`);

    const user = await prisma.user.upsert({
      where: {
        restaurantId_username: {
          restaurantId: restaurant.id,
          username: s.username,
        },
      },
      update: {
        name: s.name,
        pinHash,
        passwordHash,
        isActive: true,
      },
      create: {
        restaurantId: restaurant.id,
        name: s.name,
        username: s.username,
        pinHash,
        passwordHash,
        isActive: true,
      },
    });
    userIds[s.username] = user.id;

    await prisma.userRole.upsert({
      where: {
        userId_roleId: { userId: user.id, roleId },
      },
      update: {},
      create: { userId: user.id, roleId },
    });
  }

  return {
    restaurantId: restaurant.id,
    ownerUserId: userIds.owner_admin!,
    managerUserId: userIds.manager_john!,
    cashierUserId: userIds.cashier_sarah!,
  };
}

/** Refuse primary / production POS database names for test suites. */
export function assertDisposableTestDatabase(databaseUrl: string): void {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL required for tests');
  }
  if (/\/faraz_pos_db\b/i.test(databaseUrl) || /\/farmax_pos_db\b/i.test(databaseUrl)) {
    throw new Error(
      'Refusing primary POS database for tests. Use a disposable DB (e.g. farmax_pos_backend_test).',
    );
  }
}
