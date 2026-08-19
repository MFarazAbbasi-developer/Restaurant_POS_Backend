/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const BCRYPT_SALT_ROUNDS = 10;

function hashCredential(val: string): string {
  return bcrypt.hashSync(val, BCRYPT_SALT_ROUNDS);
}

// -----------------------------------------------------------------------------
// Default Permissions Catalog (26 Permissions)
// -----------------------------------------------------------------------------
const DEFAULT_PERMISSIONS = [
  // Orders
  { key: 'orders.view', description: 'View order list and details' },
  { key: 'orders.create', description: 'Create new customer orders' },
  { key: 'orders.update', description: 'Modify existing orders' },
  { key: 'orders.cancel', description: 'Cancel active orders' },
  { key: 'orders.discount', description: 'Apply discounts to orders' },
  { key: 'orders.void', description: 'Void order items or entire orders' },
  { key: 'orders.pay_on_pickup', description: 'Authorize takeaway orders with Pay on Pickup status' },

  // Payments
  { key: 'payments.view', description: 'View payment transactions and receipts' },
  { key: 'payments.create', description: 'Process customer payments' },
  { key: 'payments.refund', description: 'Process payment refunds' },

  // Shifts
  { key: 'shifts.view', description: 'View register shifts' },
  { key: 'shifts.open', description: 'Open a new register shift' },
  { key: 'shifts.close', description: 'Close an active register shift' },
  { key: 'shifts.cash_drop', description: 'Perform cash drops and petty cash out' },

  // Menu
  { key: 'menu.view', description: 'View menu items, categories, and modifiers' },
  { key: 'menu.manage', description: 'Create, edit, and organize menu items and categories' },
  { key: 'menu.price_update', description: 'Update menu item pricing' },

  // Inventory
  { key: 'inventory.view', description: 'View stock levels and inventory items' },
  { key: 'inventory.manage', description: 'Manage inventory items and suppliers' },
  { key: 'inventory.adjust', description: 'Adjust stock counts and waste logs' },

  // Reports
  { key: 'reports.view', description: 'View sales and business reports' },
  { key: 'reports.export', description: 'Export reports to CSV/PDF' },

  // Tables & Floors
  { key: 'tables.view', description: 'View dining floors, zones, and table status' },
  { key: 'tables.manage', description: 'Create, edit, and organize tables and seating zones' },

  // Delivery Management
  { key: 'delivery.view', description: 'View delivery orders, queue, and dispatch details' },
  { key: 'delivery.create', description: 'Create phone-in, manual WhatsApp, and delivery orders' },
  { key: 'delivery.update', description: 'Update delivery lifecycle status' },
  { key: 'delivery.dispatch', description: 'Assign riders and dispatch delivery orders' },
  { key: 'delivery.rider_settlement', description: 'Reconcile rider cash and close settlements' },
  { key: 'delivery.cancel', description: 'Cancel active delivery orders' },
  { key: 'delivery.manage_zones', description: 'Create and configure delivery zones and fees' },

  // Customers
  { key: 'customer.view', description: 'Search and view customer phone records and addresses' },
  { key: 'customer.manage', description: 'Create and edit customer records and saved addresses' },

  // Settings
  { key: 'settings.view', description: 'View restaurant configurations and settings' },
  { key: 'settings.manage', description: 'Modify restaurant configurations and POS settings' },

  // Audit
  { key: 'audit.view', description: 'View audit trails and system activity logs' },
];

// -----------------------------------------------------------------------------
// Role Definitions and Permission Matrix
// -----------------------------------------------------------------------------
const ROLE_PERMISSIONS_MAP: Record<string, { description: string; permissions: string[] }> = {
  OWNER: {
    description: 'Full restaurant ownership with all system capabilities',
    permissions: DEFAULT_PERMISSIONS.map((p) => p.key),
  },
  MANAGER: {
    description: 'Store manager with broad operational, financial, and inventory access',
    permissions: [
      'orders.view',
      'orders.create',
      'orders.update',
      'orders.cancel',
      'orders.discount',
      'orders.void',
      'orders.pay_on_pickup',
      'payments.view',
      'payments.create',
      'payments.refund',
      'shifts.view',
      'shifts.open',
      'shifts.close',
      'shifts.cash_drop',
      'menu.view',
      'menu.manage',
      'menu.price_update',
      'inventory.view',
      'inventory.manage',
      'inventory.adjust',
      'reports.view',
      'reports.export',
      'tables.view',
      'tables.manage',
      'delivery.view',
      'delivery.create',
      'delivery.update',
      'delivery.dispatch',
      'delivery.rider_settlement',
      'delivery.cancel',
      'delivery.manage_zones',
      'customer.view',
      'customer.manage',
      'users.view',
      'settings.view',
      'audit.view',
    ],
  },
  CASHIER: {
    description: 'Front cashier handling customer orders, payments, and shifts',
    permissions: [
      'orders.view',
      'orders.create',
      'orders.update',
      'orders.cancel',
      'orders.discount',
      'payments.view',
      'payments.create',
      'shifts.view',
      'shifts.open',
      'shifts.close',
      'shifts.cash_drop',
      'menu.view',
      'inventory.view',
      'tables.view',
      'tables.manage',
      'delivery.view',
      'delivery.create',
      'delivery.update',
      'delivery.dispatch',
      'delivery.rider_settlement',
      'delivery.cancel',
      'customer.view',
      'customer.manage',
    ],
  },
  WAITER: {
    description: 'Floor staff taking table orders and viewing menu items',
    permissions: ['orders.view', 'orders.create', 'orders.update', 'menu.view', 'tables.view'],
  },
  KITCHEN: {
    description: 'Kitchen display / prep staff tracking and updating food orders',
    permissions: ['orders.view', 'orders.update', 'menu.view', 'inventory.view'],
  },
  DELIVERY: {
    description: 'Delivery dispatch and drivers updating delivery status and collecting cash',
    permissions: [
      'orders.view',
      'orders.update',
      'delivery.view',
      'delivery.update',
      'payments.create',
    ],
  },
};

async function main() {
  console.log('🌱 Starting Faraz POS database seed with bcrypt...');

  // 1. Seed Permissions (Global Catalog)
  console.log('📋 Seeding global permissions catalog...');
  const permissionMap = new Map<string, string>();
  for (const perm of DEFAULT_PERMISSIONS) {
    const record = await prisma.permission.upsert({
      where: { key: perm.key },
      update: { description: perm.description },
      create: { key: perm.key, description: perm.description },
    });
    permissionMap.set(record.key, record.id);
  }
  console.log(`✅ Seeded ${permissionMap.size} permissions`);

  // 2. Seed Default Restaurant
  console.log('🏪 Seeding default demo restaurant...');
  const restaurant = await prisma.restaurant.upsert({
    where: { slug: 'faraz-flagship' },
    update: {
      name: 'Faraz Flagship Bistro',
      legalName: 'Faraz Hospitality Group LLC',
      phone: '+1 (555) 019-2834',
      address: '100 Gourmet Avenue, Suite 10, New York, NY 10001',
      currency: 'USD',
      timezone: 'America/New_York',
      taxNumber: 'US-NYC-TAX-88901',
      taxRate: 8.875,
      taxInclusive: false,
      serviceChargeRate: 0,
      serviceChargeEnabled: false,
      dineInEnabled: true,
      takeawayEnabled: true,
      deliveryEnabled: true,
      receiptHeader: 'Welcome to Faraz Flagship Bistro!',
      receiptFooter: 'Thank you for dining with us! Please come again.',
      isActive: true,
    },
    create: {
      name: 'Faraz Flagship Bistro',
      slug: 'faraz-flagship',
      legalName: 'Faraz Hospitality Group LLC',
      phone: '+1 (555) 019-2834',
      address: '100 Gourmet Avenue, Suite 10, New York, NY 10001',
      currency: 'USD',
      timezone: 'America/New_York',
      taxNumber: 'US-NYC-TAX-88901',
      taxRate: 8.875,
      taxInclusive: false,
      serviceChargeRate: 0,
      serviceChargeEnabled: false,
      dineInEnabled: true,
      takeawayEnabled: true,
      deliveryEnabled: true,
      receiptHeader: 'Welcome to Faraz Flagship Bistro!',
      receiptFooter: 'Thank you for dining with us! Please come again.',
      isActive: true,
    },
  });
  console.log(`✅ Restaurant: "${restaurant.name}" (ID: ${restaurant.id})`);

  // 3. Seed Default System Roles and Role Permissions
  console.log('🛡️  Seeding default system roles and permissions for restaurant...');
  const roleMap = new Map<string, string>();

  for (const [roleName, config] of Object.entries(ROLE_PERMISSIONS_MAP)) {
    const role = await prisma.role.upsert({
      where: {
        restaurantId_name: {
          restaurantId: restaurant.id,
          name: roleName,
        },
      },
      update: {
        description: config.description,
        isSystem: true,
      },
      create: {
        restaurantId: restaurant.id,
        name: roleName,
        description: config.description,
        isSystem: true,
      },
    });

    roleMap.set(role.name, role.id);

    // Link Role Permissions
    for (const permKey of config.permissions) {
      const permissionId = permissionMap.get(permKey);
      if (permissionId) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permissionId,
            },
          },
          update: {},
          create: {
            roleId: role.id,
            permissionId: permissionId,
          },
        });
      }
    }
  }
  console.log(`✅ Seeded ${roleMap.size} roles and role-permission mappings`);

  // 4. Seed Initial Staff Users
  console.log('👤 Seeding default administrative & staff users...');

  // Default Owner
  const ownerUser = await prisma.user.upsert({
    where: {
      restaurantId_username: {
        restaurantId: restaurant.id,
        username: 'owner_admin',
      },
    },
    update: {
      name: 'Faraz Owner',
      pinHash: hashCredential('1234'),
      passwordHash: hashCredential('FarazAdmin2026!'),
      isActive: true,
    },
    create: {
      restaurantId: restaurant.id,
      name: 'Faraz Owner',
      username: 'owner_admin',
      pinHash: hashCredential('1234'),
      passwordHash: hashCredential('FarazAdmin2026!'),
      isActive: true,
    },
  });

  const ownerRoleId = roleMap.get('OWNER');
  if (ownerRoleId) {
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: ownerUser.id,
          roleId: ownerRoleId,
        },
      },
      update: {},
      create: {
        userId: ownerUser.id,
        roleId: ownerRoleId,
      },
    });
  }

  // Default Manager
  const managerUser = await prisma.user.upsert({
    where: {
      restaurantId_username: {
        restaurantId: restaurant.id,
        username: 'manager_john',
      },
    },
    update: {
      name: 'John Manager',
      pinHash: hashCredential('2233'),
      passwordHash: hashCredential('ManagerPass2026!'),
      isActive: true,
    },
    create: {
      restaurantId: restaurant.id,
      name: 'John Manager',
      username: 'manager_john',
      pinHash: hashCredential('2233'),
      passwordHash: hashCredential('ManagerPass2026!'),
      isActive: true,
    },
  });

  const managerRoleId = roleMap.get('MANAGER');
  if (managerRoleId) {
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: managerUser.id,
          roleId: managerRoleId,
        },
      },
      update: {},
      create: {
        userId: managerUser.id,
        roleId: managerRoleId,
      },
    });
  }

  // Default Cashier
  const cashierUser = await prisma.user.upsert({
    where: {
      restaurantId_username: {
        restaurantId: restaurant.id,
        username: 'cashier_sarah',
      },
    },
    update: {
      name: 'Sarah Cashier',
      pinHash: hashCredential('4321'),
      isActive: true,
    },
    create: {
      restaurantId: restaurant.id,
      name: 'Sarah Cashier',
      username: 'cashier_sarah',
      pinHash: hashCredential('4321'),
      isActive: true,
    },
  });

  const cashierRoleId = roleMap.get('CASHIER');
  if (cashierRoleId) {
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: cashierUser.id,
          roleId: cashierRoleId,
        },
      },
      update: {},
      create: {
        userId: cashierUser.id,
        roleId: cashierRoleId,
      },
    });
  }

  // 5. Seed Default Seating Zones & Tables
  console.log('🪑 Seeding default seating zones & dining tables...');
  const mainFloor = await prisma.zone.upsert({
    where: {
      restaurantId_name: {
        restaurantId: restaurant.id,
        name: 'Ground Floor',
      },
    },
    update: {
      description: 'Main dining hall and central seating area',
      sortOrder: 1,
      isActive: true,
    },
    create: {
      restaurantId: restaurant.id,
      name: 'Ground Floor',
      description: 'Main dining hall and central seating area',
      sortOrder: 1,
      isActive: true,
    },
  });

  const familyHall = await prisma.zone.upsert({
    where: {
      restaurantId_name: {
        restaurantId: restaurant.id,
        name: 'Family Hall',
      },
    },
    update: {
      description: 'Private and family dining section',
      sortOrder: 2,
      isActive: true,
    },
    create: {
      restaurantId: restaurant.id,
      name: 'Family Hall',
      description: 'Private and family dining section',
      sortOrder: 2,
      isActive: true,
    },
  });

  const outdoorPatio = await prisma.zone.upsert({
    where: {
      restaurantId_name: {
        restaurantId: restaurant.id,
        name: 'Outdoor Patio',
      },
    },
    update: {
      description: 'Open air terrace seating with garden view',
      sortOrder: 3,
      isActive: true,
    },
    create: {
      restaurantId: restaurant.id,
      name: 'Outdoor Patio',
      description: 'Open air terrace seating with garden view',
      sortOrder: 3,
      isActive: true,
    },
  });

  // Seed Tables for Main Floor
  for (let i = 1; i <= 5; i++) {
    const tableName = `T-${i < 10 ? '0' + i : i}`;
    await prisma.restaurantTable.upsert({
      where: {
        restaurantId_name: {
          restaurantId: restaurant.id,
          name: tableName,
        },
      },
      update: {
        zoneId: mainFloor.id,
        capacity: i <= 2 ? 2 : 4,
        sortOrder: i,
        isActive: true,
      },
      create: {
        restaurantId: restaurant.id,
        zoneId: mainFloor.id,
        name: tableName,
        capacity: i <= 2 ? 2 : 4,
        sortOrder: i,
        isActive: true,
      },
    });
  }

  // Seed Tables for Family Hall
  for (let i = 1; i <= 3; i++) {
    const tableName = `F-${i < 10 ? '0' + i : i}`;
    await prisma.restaurantTable.upsert({
      where: {
        restaurantId_name: {
          restaurantId: restaurant.id,
          name: tableName,
        },
      },
      update: {
        zoneId: familyHall.id,
        capacity: 6,
        sortOrder: i,
        isActive: true,
      },
      create: {
        restaurantId: restaurant.id,
        zoneId: familyHall.id,
        name: tableName,
        capacity: 6,
        sortOrder: i,
        isActive: true,
      },
    });
  }

  // Seed Tables for Outdoor Patio
  for (let i = 1; i <= 3; i++) {
    const tableName = `P-${i < 10 ? '0' + i : i}`;
    await prisma.restaurantTable.upsert({
      where: {
        restaurantId_name: {
          restaurantId: restaurant.id,
          name: tableName,
        },
      },
      update: {
        zoneId: outdoorPatio.id,
        capacity: 4,
        sortOrder: i,
        isActive: true,
      },
      create: {
        restaurantId: restaurant.id,
        zoneId: outdoorPatio.id,
        name: tableName,
        capacity: 4,
        sortOrder: i,
        isActive: true,
      },
    });
  }
  console.log('✅ Seeded 3 zones and 11 dining tables');

  // 6. Seed Default Delivery Rider Staff User
  const riderUser = await prisma.user.upsert({
    where: {
      restaurantId_username: {
        restaurantId: restaurant.id,
        username: 'rider_ali',
      },
    },
    update: {
      name: 'Ali Rider',
      phone: '+923001234567',
      pinHash: hashCredential('5566'),
      isActive: true,
    },
    create: {
      restaurantId: restaurant.id,
      name: 'Ali Rider',
      username: 'rider_ali',
      phone: '+923001234567',
      pinHash: hashCredential('5566'),
      isActive: true,
    },
  });

  const deliveryRoleId = roleMap.get('DELIVERY');
  if (deliveryRoleId) {
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: riderUser.id,
          roleId: deliveryRoleId,
        },
      },
      update: {},
      create: {
        userId: riderUser.id,
        roleId: deliveryRoleId,
      },
    });
  }

  // 7. Seed Default Delivery Zones
  console.log('🛵 Seeding default delivery zones...');
  await prisma.deliveryZone.upsert({
    where: {
      restaurantId_name: {
        restaurantId: restaurant.id,
        name: 'Standard Delivery (Within 5km)',
      },
    },
    update: {
      deliveryCharge: 3.5,
      estimatedMinutes: 30,
      isActive: true,
    },
    create: {
      restaurantId: restaurant.id,
      name: 'Standard Delivery (Within 5km)',
      deliveryCharge: 3.5,
      estimatedMinutes: 30,
      isActive: true,
    },
  });

  await prisma.deliveryZone.upsert({
    where: {
      restaurantId_name: {
        restaurantId: restaurant.id,
        name: 'Extended Zone (5km - 10km)',
      },
    },
    update: {
      deliveryCharge: 6.0,
      estimatedMinutes: 45,
      isActive: true,
    },
    create: {
      restaurantId: restaurant.id,
      name: 'Extended Zone (5km - 10km)',
      deliveryCharge: 6.0,
      estimatedMinutes: 45,
      isActive: true,
    },
  });

  await prisma.deliveryZone.upsert({
    where: {
      restaurantId_name: {
        restaurantId: restaurant.id,
        name: 'Express Priority Delivery',
      },
    },
    update: {
      deliveryCharge: 8.0,
      estimatedMinutes: 20,
      isActive: true,
    },
    create: {
      restaurantId: restaurant.id,
      name: 'Express Priority Delivery',
      deliveryCharge: 8.0,
      estimatedMinutes: 20,
      isActive: true,
    },
  });
  console.log('✅ Seeded 3 delivery zones and default rider');

  // 8. Seed Initial Audit Log
  await prisma.auditLog.create({
    data: {
      restaurantId: restaurant.id,
      userId: ownerUser.id,
      action: 'SYSTEM_INITIALIZATION',
      entityType: 'RESTAURANT',
      entityId: restaurant.id,
      metadata: {
        event: 'Seed initialization completed with bcrypt credentials, table management, takeaway, and delivery',
        rolesSeeded: Object.keys(ROLE_PERMISSIONS_MAP),
        permissionCount: DEFAULT_PERMISSIONS.length,
        version: '1.0.0',
      },
      ipAddress: '127.0.0.1',
    },
  });

  console.log(`✅ Default Owner User: "${ownerUser.name}" (@${ownerUser.username}, PIN: 1234)`);
  console.log(`✅ Default Manager User: "${managerUser.name}" (@${managerUser.username}, PIN: 2233)`);
  console.log(`✅ Default Cashier User: "${cashierUser.name}" (@${cashierUser.username}, PIN: 4321)`);
  console.log(`✅ Default Delivery Rider User: "${riderUser.name}" (@${riderUser.username}, PIN: 5566)`);
  console.log('🎉 Faraz POS database seed finished successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during database seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
