/* eslint-disable no-console */
import {
  PrismaClient,
  TableStatus,
  TableOrderStatus,
  TakeawayOrderStatus,
  TakeawayPaymentStatus,
  DeliveryOrderStatus,
  DeliveryPaymentStatus,
  OrderType,
  OrderStatus,
  OrderPaymentStatus,
  OrderItemStatus,
  ItemKitchenStatus,
  PaymentMethod,
  PaymentStatus,
  ShiftStatus,
  CashTransactionType,
  StockMovementType,
  PromotionType,
  PromotionTargetType,
  LoyaltyTransactionType,
  LoyaltyRoundingMode,
  ReservationStatus,
  ExpenseStatus,
  ModifierSelectionType,
} from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const BCRYPT_SALT_ROUNDS = 10;

function hashCredential(val: string): string {
  return bcrypt.hashSync(val, BCRYPT_SALT_ROUNDS);
}

// -----------------------------------------------------------------------------
// 1. Default Permissions Catalog
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

  // Inventory & Purchasing
  { key: 'inventory.view', description: 'View stock levels and inventory items' },
  { key: 'inventory.manage', description: 'Manage inventory items and locations' },
  { key: 'inventory.adjust', description: 'Adjust stock counts and physical inventory' },
  { key: 'inventory.receive', description: 'Receive supplier purchases and stock deliveries' },
  { key: 'inventory.transfer', description: 'Transfer stock between locations' },
  { key: 'inventory.waste', description: 'Record spoiled, expired, or wasted inventory' },
  { key: 'purchasing.view', description: 'View purchase orders, supplier profiles, receiving history, and purchase reports' },
  { key: 'purchasing.manage', description: 'Create and modify purchase orders and supplier catalog terms' },
  { key: 'purchasing.receive', description: 'Receive goods, log deliveries, and process supplier returns' },
  { key: 'suppliers.manage', description: 'Create, edit, and deactivate supplier profiles' },

  // Expenses & Expense Management
  { key: 'expenses.view', description: 'View operating expenses, categories, and expense analytics' },
  { key: 'expenses.create', description: 'Record new operational expenses and petty cash disbursements' },
  { key: 'expenses.manage', description: 'Create, edit, and organize expense categories and edit expense records' },
  { key: 'expenses.void', description: 'Void or reverse expense records with manager authorization' },

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

  // Kitchen Display & Operations
  { key: 'kitchen.view', description: 'View kitchen active orders, prep queue, and station tickets' },
  { key: 'kitchen.update', description: 'Update kitchen order and item prep status, bump tickets, and recall orders' },
  { key: 'kitchen.manage', description: 'Create, update, and organize kitchen stations and category routing' },

  // Receipts & Printing
  { key: 'receipts.view', description: 'View and generate customer receipts, bill estimates, and KOT slips' },
  { key: 'receipts.reprint', description: 'Authorize reprinting duplicate receipts and bills' },
  { key: 'receipts.manage', description: 'Configure receipt layouts, header/footer text, and printer settings' },

  // Discounts & Promotions
  { key: 'promotions.view', description: 'View promotional campaigns, discount rules, and usage history' },
  { key: 'promotions.manage', description: 'Create, update, and manage promotional campaigns and discount rules' },
  { key: 'promotions.apply', description: 'Apply promotional discount codes and promo overrides to orders' },

  // Loyalty & Customer Rewards
  { key: 'loyalty.view', description: 'View loyalty accounts, balances, history, tier rules, and reports' },
  { key: 'loyalty.manage', description: 'Configure loyalty program parameters and tier levels' },
  { key: 'loyalty.adjust', description: 'Perform manual manager-authorized points adjustments' },
  { key: 'loyalty.redeem', description: 'Redeem loyalty points during checkout' },

  // Reservations & Table Bookings
  { key: 'reservations.view', description: 'View table bookings, schedules, availability, and customer reservation history' },
  { key: 'reservations.manage', description: 'Create, update, assign/reassign tables, and manage reservations' },
  { key: 'reservations.status', description: 'Transition reservation statuses (confirm, seat, complete, cancel, no-show)' },

  // Settings
  { key: 'settings.view', description: 'View restaurant configurations and settings' },
  { key: 'settings.manage', description: 'Modify restaurant configurations and POS settings' },

  // Users & Staff
  { key: 'users.view', description: 'View restaurant staff and user accounts' },
  { key: 'users.manage', description: 'Manage restaurant staff and credentials' },

  // Audit
  { key: 'audit.view', description: 'View audit trails and system activity logs' },
];

// -----------------------------------------------------------------------------
// 2. Role Definitions
// -----------------------------------------------------------------------------
const ROLE_PERMISSIONS_MAP: Record<string, { description: string; permissions: string[] }> = {
  OWNER: {
    description: 'Full restaurant ownership with all system capabilities',
    permissions: DEFAULT_PERMISSIONS.map((p) => p.key),
  },
  MANAGER: {
    description: 'Store manager with broad operational, financial, and inventory access',
    permissions: [
      'orders.view', 'orders.create', 'orders.update', 'orders.cancel', 'orders.discount', 'orders.void', 'orders.pay_on_pickup',
      'payments.view', 'payments.create', 'payments.refund',
      'shifts.view', 'shifts.open', 'shifts.close', 'shifts.cash_drop',
      'kitchen.view', 'kitchen.update', 'kitchen.manage',
      'receipts.view', 'receipts.reprint', 'receipts.manage',
      'menu.view', 'menu.manage', 'menu.price_update',
      'inventory.view', 'inventory.manage', 'inventory.adjust', 'inventory.receive', 'inventory.transfer', 'inventory.waste',
      'purchasing.view', 'purchasing.manage', 'purchasing.receive', 'suppliers.manage',
      'expenses.view', 'expenses.create', 'expenses.manage', 'expenses.void',
      'promotions.view', 'promotions.manage', 'promotions.apply',
      'loyalty.view', 'loyalty.manage', 'loyalty.adjust', 'loyalty.redeem',
      'reservations.view', 'reservations.manage', 'reservations.status',
      'reports.view', 'reports.export',
      'tables.view', 'tables.manage',
      'delivery.view', 'delivery.create', 'delivery.update', 'delivery.dispatch', 'delivery.rider_settlement', 'delivery.cancel', 'delivery.manage_zones',
      'customer.view', 'customer.manage',
      'users.view', 'settings.view', 'audit.view',
    ],
  },
  CASHIER: {
    description: 'Front cashier handling customer orders, payments, and shifts',
    permissions: [
      'orders.view', 'orders.create', 'orders.update', 'orders.cancel', 'orders.discount',
      'payments.view', 'payments.create',
      'shifts.view', 'shifts.open', 'shifts.close', 'shifts.cash_drop',
      'expenses.view', 'expenses.create',
      'kitchen.view', 'receipts.view', 'receipts.reprint', 'menu.view', 'inventory.view',
      'promotions.view', 'promotions.apply',
      'loyalty.view', 'loyalty.redeem',
      'reservations.view', 'reservations.manage', 'reservations.status',
      'tables.view', 'tables.manage',
      'delivery.view', 'delivery.create', 'delivery.update', 'delivery.dispatch', 'delivery.rider_settlement', 'delivery.cancel',
      'customer.view', 'customer.manage',
    ],
  },
  WAITER: {
    description: 'Floor staff taking table orders and viewing menu items',
    permissions: ['orders.view', 'orders.create', 'orders.update', 'kitchen.view', 'receipts.view', 'menu.view', 'tables.view'],
  },
  KITCHEN: {
    description: 'Kitchen display / prep staff tracking and updating food orders',
    permissions: ['orders.view', 'orders.update', 'kitchen.view', 'kitchen.update', 'receipts.view', 'menu.view', 'inventory.view'],
  },
  DELIVERY: {
    description: 'Delivery dispatch and drivers updating delivery status and collecting cash',
    permissions: ['orders.view', 'orders.update', 'delivery.view', 'delivery.update', 'payments.create'],
  },
};

async function main() {
  console.log('🚀 Starting comprehensive Faraz POS database seed with rich data...');

  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // ---------------------------------------------------------------------------
  // 1. Seed Permissions Catalog
  // ---------------------------------------------------------------------------
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

  // ---------------------------------------------------------------------------
  // 2. Seed Default Restaurant
  // ---------------------------------------------------------------------------
  console.log('🏪 Seeding default restaurant profile...');
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
      receiptHeader: 'Welcome to Faraz Flagship Bistro!\nWhere Flavor Meets Elegance',
      receiptFooter: 'Thank you for dining with us! Please come again.\nFollow us @farazbistro',
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
      receiptHeader: 'Welcome to Faraz Flagship Bistro!\nWhere Flavor Meets Elegance',
      receiptFooter: 'Thank you for dining with us! Please come again.\nFollow us @farazbistro',
      isActive: true,
    },
  });
  console.log(`✅ Restaurant: "${restaurant.name}" (ID: ${restaurant.id})`);

  // ---------------------------------------------------------------------------
  // 3. Seed System Roles and Role Permissions
  // ---------------------------------------------------------------------------
  console.log('🛡️  Seeding system roles and permissions...');
  const roleMap = new Map<string, string>();

  for (const [roleName, config] of Object.entries(ROLE_PERMISSIONS_MAP)) {
    const role = await prisma.role.upsert({
      where: {
        restaurantId_name: {
          restaurantId: restaurant.id,
          name: roleName,
        },
      },
      update: { description: config.description, isSystem: true },
      create: {
        restaurantId: restaurant.id,
        name: roleName,
        description: config.description,
        isSystem: true,
      },
    });

    roleMap.set(role.name, role.id);

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
  console.log(`✅ Seeded ${roleMap.size} roles and mapped permissions`);

  // ---------------------------------------------------------------------------
  // 4. Seed Staff Users (Owner, Manager, Cashier, Waiters, Chefs, Riders)
  // ---------------------------------------------------------------------------
  console.log('👤 Seeding full staff user roster...');
  const staffList = [
    { username: 'owner_admin', name: 'Faraz Owner', role: 'OWNER', pin: '1234', password: 'FarazAdmin2026!', phone: '+15550192834' },
    { username: 'manager_john', name: 'John Manager', role: 'MANAGER', pin: '2233', password: 'ManagerPass2026!', phone: '+15550192835' },
    { username: 'cashier_sarah', name: 'Sarah Cashier', role: 'CASHIER', pin: '4321', password: 'CashierPass2026!', phone: '+15550192836' },
    { username: 'waiter_alex', name: 'Alex Rivera', role: 'WAITER', pin: '1122', phone: '+15550192837' },
    { username: 'waiter_maya', name: 'Maya Patel', role: 'WAITER', pin: '3344', phone: '+15550192838' },
    { username: 'chef_gordon', name: 'Gordon Ramsay Chef', role: 'KITCHEN', pin: '7788', phone: '+15550192839' },
    { username: 'chef_marco', name: 'Marco Kitchen Prep', role: 'KITCHEN', pin: '9900', phone: '+15550192840' },
    { username: 'rider_ali', name: 'Ali Rider', role: 'DELIVERY', pin: '5566', phone: '+923001234567' },
    { username: 'rider_tariq', name: 'Tariq Rider Express', role: 'DELIVERY', pin: '6677', phone: '+923009876543' },
  ];

  const userMap = new Map<string, any>();
  for (const staff of staffList) {
    const user = await prisma.user.upsert({
      where: {
        restaurantId_username: {
          restaurantId: restaurant.id,
          username: staff.username,
        },
      },
      update: {
        name: staff.name,
        phone: staff.phone,
        pinHash: hashCredential(staff.pin),
        passwordHash: staff.password ? hashCredential(staff.password) : undefined,
        isActive: true,
      },
      create: {
        restaurantId: restaurant.id,
        name: staff.name,
        username: staff.username,
        phone: staff.phone,
        pinHash: hashCredential(staff.pin),
        passwordHash: staff.password ? hashCredential(staff.password) : hashCredential('Pass1234!'),
        isActive: true,
      },
    });

    userMap.set(staff.username, user);

    const roleId = roleMap.get(staff.role);
    if (roleId) {
      await prisma.userRole.upsert({
        where: {
          userId_roleId: {
            userId: user.id,
            roleId: roleId,
          },
        },
        update: {},
        create: {
          userId: user.id,
          roleId: roleId,
        },
      });
    }
  }
  console.log(`✅ Seeded ${userMap.size} staff members across all roles`);

  const ownerUser = userMap.get('owner_admin');
  const managerUser = userMap.get('manager_john');
  const cashierUser = userMap.get('cashier_sarah');
  const riderAli = userMap.get('rider_ali');

  // ---------------------------------------------------------------------------
  // 5. Seed Seating Zones and Dining Tables
  // ---------------------------------------------------------------------------
  console.log('🪑 Seeding dining zones & tables...');
  const zonesData = [
    { name: 'Ground Floor', description: 'Main dining hall and central seating', order: 1, tables: [
      { name: 'T-01', capacity: 2, status: TableStatus.AVAILABLE },
      { name: 'T-02', capacity: 4, status: TableStatus.OCCUPIED },
      { name: 'T-03', capacity: 4, status: TableStatus.RESERVED },
      { name: 'T-04', capacity: 6, status: TableStatus.AVAILABLE },
      { name: 'T-05', capacity: 2, status: TableStatus.BILL_PRINTED },
      { name: 'T-06', capacity: 4, status: TableStatus.CLEANING },
    ]},
    { name: 'Family Hall', description: 'Private & family dining section', order: 2, tables: [
      { name: 'F-01', capacity: 6, status: TableStatus.OCCUPIED },
      { name: 'F-02', capacity: 8, status: TableStatus.AVAILABLE },
      { name: 'F-03', capacity: 6, status: TableStatus.AVAILABLE },
      { name: 'F-04', capacity: 10, status: TableStatus.AVAILABLE },
    ]},
    { name: 'Outdoor Patio', description: 'Open air terrace seating with garden view', order: 3, tables: [
      { name: 'P-01', capacity: 4, status: TableStatus.AVAILABLE },
      { name: 'P-02', capacity: 4, status: TableStatus.AVAILABLE },
      { name: 'P-03', capacity: 2, status: TableStatus.AVAILABLE },
      { name: 'P-04', capacity: 6, status: TableStatus.AVAILABLE },
    ]},
    { name: 'VIP Executive Lounge', description: 'Exclusive premium boardroom style seating', order: 4, tables: [
      { name: 'VIP-01', capacity: 8, status: TableStatus.AVAILABLE },
      { name: 'VIP-02', capacity: 12, status: TableStatus.AVAILABLE },
    ]},
  ];

  const tableMap = new Map<string, any>();
  for (const z of zonesData) {
    const zone = await prisma.zone.upsert({
      where: {
        restaurantId_name: { restaurantId: restaurant.id, name: z.name },
      },
      update: { description: z.description, sortOrder: z.order, isActive: true },
      create: { restaurantId: restaurant.id, name: z.name, description: z.description, sortOrder: z.order, isActive: true },
    });

    for (let i = 0; i < z.tables.length; i++) {
      const t = z.tables[i];
      const table = await prisma.restaurantTable.upsert({
        where: {
          restaurantId_name: { restaurantId: restaurant.id, name: t.name },
        },
        update: { zoneId: zone.id, capacity: t.capacity, sortOrder: i + 1, status: t.status, isActive: true },
        create: { restaurantId: restaurant.id, zoneId: zone.id, name: t.name, capacity: t.capacity, sortOrder: i + 1, status: t.status, isActive: true },
      });
      tableMap.set(t.name, table);
    }
  }
  console.log(`✅ Seeded ${zonesData.length} zones and ${tableMap.size} dining tables`);

  // ---------------------------------------------------------------------------
  // 6. Seed Kitchen Stations
  // ---------------------------------------------------------------------------
  console.log('🍳 Seeding Kitchen Stations (KDS)...');
  const stationsData = [
    { name: 'Grill & BBQ Station', code: 'GRILL', displayOrder: 1 },
    { name: 'Main Hot Kitchen', code: 'HOT_KITCHEN', displayOrder: 2 },
    { name: 'Pizza & Oven Station', code: 'PIZZA_OVEN', displayOrder: 3 },
    { name: 'Beverage & Juice Bar', code: 'BAR', displayOrder: 4 },
    { name: 'Dessert & Bakery Counter', code: 'DESSERT', displayOrder: 5 },
  ];

  const stationMap = new Map<string, any>();
  for (const s of stationsData) {
    const station = await prisma.kitchenStation.upsert({
      where: {
        restaurantId_name: { restaurantId: restaurant.id, name: s.name },
      },
      update: { code: s.code, displayOrder: s.displayOrder, isActive: true },
      create: { restaurantId: restaurant.id, name: s.name, code: s.code, displayOrder: s.displayOrder, isActive: true },
    });
    stationMap.set(s.code, station);
  }
  console.log(`✅ Seeded ${stationMap.size} kitchen prep stations`);

  // ---------------------------------------------------------------------------
  // 7. Seed Menu Categories & Kitchen Station Routing
  // ---------------------------------------------------------------------------
  console.log('🍔 Seeding Menu Categories & Station Routing...');
  const categoriesData = [
    { name: 'Starters & Appetizers', description: 'Crispy finger foods, wings, and soups', sortOrder: 1, stationCode: 'HOT_KITCHEN' },
    { name: 'Burgers & Sandwiches', description: 'Gourmet smashed beef burgers, crispy chicken, and artisan sandwiches', sortOrder: 2, stationCode: 'GRILL' },
    { name: 'Steaks & Grills', description: 'Prime beef cuts, sizzling platters, and charbroiled skewers', sortOrder: 3, stationCode: 'GRILL' },
    { name: 'Pizzas & Pastas', description: 'Hand-tossed stone baked pizzas and rich Italian pastas', sortOrder: 4, stationCode: 'PIZZA_OVEN' },
    { name: 'Pakistani & Desi Specials', description: 'Traditional aromatic curries, karahis, and clay oven naans', sortOrder: 5, stationCode: 'HOT_KITCHEN' },
    { name: 'Beverages & Mocktails', description: 'Refreshing mojitos, shakes, smoothies, and artisan coffees', sortOrder: 6, stationCode: 'BAR' },
    { name: 'Desserts & Sweets', description: 'Molten lava cakes, brownies, cheesecakes, and ice cream', sortOrder: 7, stationCode: 'DESSERT' },
  ];

  const categoryMap = new Map<string, any>();
  for (const c of categoriesData) {
    let cat = await prisma.category.findFirst({
      where: { restaurantId: restaurant.id, name: c.name },
    });
    if (cat) {
      cat = await prisma.category.update({
        where: { id: cat.id },
        data: { description: c.description, sortOrder: c.sortOrder, isActive: true },
      });
    } else {
      cat = await prisma.category.create({
        data: { restaurantId: restaurant.id, name: c.name, description: c.description, sortOrder: c.sortOrder, isActive: true },
      });
    }
    categoryMap.set(c.name, cat);

    const station = stationMap.get(c.stationCode);
    if (station) {
      await prisma.categoryKitchenStation.upsert({
        where: {
          stationId_categoryId: {
            stationId: station.id,
            categoryId: cat.id,
          },
        },
        update: {},
        create: {
          stationId: station.id,
          categoryId: cat.id,
        },
      });
    }
  }
  console.log(`✅ Seeded ${categoryMap.size} menu categories with station routing`);

  // ---------------------------------------------------------------------------
  // 8. Seed Modifier Groups & Modifiers
  // ---------------------------------------------------------------------------
  console.log('🧀 Seeding Modifier Groups & Modifiers...');
  const modifierGroupsData = [
    {
      name: 'Spice Level',
      selectionType: ModifierSelectionType.SINGLE,
      minSelections: 1,
      maxSelections: 1,
      sortOrder: 1,
      modifiers: [
        { name: 'Mild', priceAdjustment: 0 },
        { name: 'Medium Spicy', priceAdjustment: 0 },
        { name: 'Extra Spicy 🔥', priceAdjustment: 0.5 },
      ],
    },
    {
      name: 'Extra Cheese & Toppings',
      selectionType: ModifierSelectionType.MULTIPLE,
      minSelections: 0,
      maxSelections: 3,
      sortOrder: 2,
      modifiers: [
        { name: 'Extra Aged Cheddar', priceAdjustment: 1.5 },
        { name: 'Melted Mozzarella', priceAdjustment: 1.75 },
        { name: 'Crispy Beef Bacon Strip', priceAdjustment: 2.0 },
        { name: 'Sautéed Mushrooms', priceAdjustment: 1.25 },
        { name: 'Jalapeño Relish', priceAdjustment: 0.75 },
      ],
    },
    {
      name: 'Choice of Sides',
      selectionType: ModifierSelectionType.SINGLE,
      minSelections: 0,
      maxSelections: 1,
      sortOrder: 3,
      modifiers: [
        { name: 'Crispy French Fries', priceAdjustment: 2.5 },
        { name: 'Seasoned Potato Wedges', priceAdjustment: 3.0 },
        { name: 'Creamy Coleslaw', priceAdjustment: 1.75 },
        { name: 'Garlic Mashed Potatoes', priceAdjustment: 2.5 },
      ],
    },
    {
      name: 'Steak Doneness',
      selectionType: ModifierSelectionType.SINGLE,
      minSelections: 1,
      maxSelections: 1,
      sortOrder: 4,
      modifiers: [
        { name: 'Rare', priceAdjustment: 0 },
        { name: 'Medium Rare', priceAdjustment: 0 },
        { name: 'Medium Well', priceAdjustment: 0 },
        { name: 'Well Done', priceAdjustment: 0 },
      ],
    },
  ];

  const modGroupMap = new Map<string, any>();
  const modItemMap = new Map<string, any>();

  for (const mg of modifierGroupsData) {
    let modGroup = await prisma.modifierGroup.findFirst({
      where: { restaurantId: restaurant.id, name: mg.name },
    });

    if (modGroup) {
      modGroup = await prisma.modifierGroup.update({
        where: { id: modGroup.id },
        data: {
          selectionType: mg.selectionType,
          minSelections: mg.minSelections,
          maxSelections: mg.maxSelections,
          sortOrder: mg.sortOrder,
          isActive: true,
        },
      });
    } else {
      modGroup = await prisma.modifierGroup.create({
        data: {
          restaurantId: restaurant.id,
          name: mg.name,
          selectionType: mg.selectionType,
          minSelections: mg.minSelections,
          maxSelections: mg.maxSelections,
          sortOrder: mg.sortOrder,
          isActive: true,
        },
      });
    }

    modGroupMap.set(mg.name, modGroup);

    for (let i = 0; i < mg.modifiers.length; i++) {
      const m = mg.modifiers[i];
      let mod = await prisma.modifier.findFirst({
        where: { modifierGroupId: modGroup.id, name: m.name },
      });
      if (mod) {
        mod = await prisma.modifier.update({
          where: { id: mod.id },
          data: {
            priceAdjustment: m.priceAdjustment,
            sortOrder: i + 1,
            isActive: true,
          },
        });
      } else {
        mod = await prisma.modifier.create({
          data: {
            modifierGroupId: modGroup.id,
            name: m.name,
            priceAdjustment: m.priceAdjustment,
            sortOrder: i + 1,
            isActive: true,
          },
        });
      }
      modItemMap.set(`${mg.name}:${m.name}`, mod);
    }
  }
  console.log(`✅ Seeded ${modGroupMap.size} modifier groups and options`);

  // ---------------------------------------------------------------------------
  // 9. Seed Menu Items & Variants & Modifier Links
  // ---------------------------------------------------------------------------
  console.log('📋 Seeding complete culinary menu items...');
  const menuItemsData = [
    // Starters
    {
      itemCode: 'APP-001',
      category: 'Starters & Appetizers',
      name: 'Crispy Buffalo Wings (8 Pcs)',
      urduName: 'کرسپی بفلو ونگز',
      description: 'Golden fried chicken wings tossed in tangy artisan buffalo glaze served with ranch dip',
      basePrice: 8.99,
      sortOrder: 1,
      variants: [
        { name: 'Regular (8 Pcs)', price: 8.99 },
        { name: 'Jumbo Platter (16 Pcs)', price: 15.99 },
      ],
      modGroups: ['Spice Level'],
    },
    {
      itemCode: 'APP-002',
      category: 'Starters & Appetizers',
      name: 'Loaded Cheesy Nachos',
      urduName: 'چیزی ناچوز',
      description: 'Corn tortilla chips smothered in melted queso, jalapeños, salsa, and sour cream',
      basePrice: 7.50,
      sortOrder: 2,
      modGroups: ['Extra Cheese & Toppings'],
    },
    {
      itemCode: 'APP-003',
      category: 'Starters & Appetizers',
      name: 'Garlic Parmesan Breadsticks',
      urduName: 'گارلک بریڈ اسٹکس',
      description: 'Freshly baked dough sticks brushed with garlic herb butter and aged parmesan',
      basePrice: 5.99,
      sortOrder: 3,
    },
    // Burgers
    {
      itemCode: 'BGR-001',
      category: 'Burgers & Sandwiches',
      name: 'The Faraz Signature Smashed Beef Burger',
      urduName: 'فراز اسپیشل اسمیشڈ بیف برگر',
      description: 'Double Angus beef patties, caramelized onions, melted cheddar, pickles & house secret sauce',
      basePrice: 12.99,
      sortOrder: 1,
      variants: [
        { name: 'Single Patty', price: 9.99 },
        { name: 'Double Patty Smashed', price: 12.99 },
        { name: 'Triple Monster Stack', price: 15.99 },
      ],
      modGroups: ['Spice Level', 'Extra Cheese & Toppings', 'Choice of Sides'],
    },
    {
      itemCode: 'BGR-002',
      category: 'Burgers & Sandwiches',
      name: 'Crispy Nashville Hot Zinger Burger',
      urduName: 'نیش ول ہاٹ زنگر برگر',
      description: 'Buttermilk fried chicken breast fillet dipped in Nashville chili oil with creamy slaw',
      basePrice: 10.99,
      sortOrder: 2,
      modGroups: ['Spice Level', 'Extra Cheese & Toppings', 'Choice of Sides'],
    },
    {
      itemCode: 'BGR-003',
      category: 'Burgers & Sandwiches',
      name: 'Swiss Mushroom Melt Burger',
      urduName: 'سوئس مشروم برگر',
      description: 'Charbroiled beef patty loaded with sautéed button mushrooms and melted Swiss cheese',
      basePrice: 13.50,
      sortOrder: 3,
      modGroups: ['Extra Cheese & Toppings', 'Choice of Sides'],
    },
    // Steaks
    {
      itemCode: 'STK-001',
      category: 'Steaks & Grills',
      name: 'Prime Ribeye Steak (300g)',
      urduName: 'پرائم رب آئی اسٹیک',
      description: 'Marbled USDA prime ribeye grilled over open charcoal flames, served with peppercorn gravy',
      basePrice: 24.99,
      sortOrder: 1,
      modGroups: ['Steak Doneness', 'Choice of Sides'],
    },
    {
      itemCode: 'STK-002',
      category: 'Steaks & Grills',
      name: 'Grilled Herb Chicken Skillet',
      urduName: 'گرلڈ ہرب چکن اسکلیٹ',
      description: 'Marinated tender chicken fillets served on a sizzling hot skillet with roasted baby veggies',
      basePrice: 16.50,
      sortOrder: 2,
      modGroups: ['Choice of Sides'],
    },
    // Pizzas & Pastas
    {
      itemCode: 'PIZ-001',
      category: 'Pizzas & Pastas',
      name: 'Pepperoni Supreme Stone-Baked Pizza',
      urduName: 'پیپرونی سپریم پیزا',
      description: 'San Marzano tomato base, whole milk mozzarella, and crispy beef pepperoni slices',
      basePrice: 14.99,
      sortOrder: 1,
      variants: [
        { name: 'Personal 8-inch', price: 9.99 },
        { name: 'Medium 12-inch', price: 14.99 },
        { name: 'Family Large 16-inch', price: 19.99 },
      ],
      modGroups: ['Extra Cheese & Toppings'],
    },
    {
      itemCode: 'PIZ-002',
      category: 'Pizzas & Pastas',
      name: 'Margherita Fresca Pizza',
      urduName: 'مارگریٹا پیزا',
      description: 'Classic Neapolitan style pizza with fresh buffalo mozzarella, basil leaves & extra virgin olive oil',
      basePrice: 12.99,
      sortOrder: 2,
      variants: [
        { name: 'Personal 8-inch', price: 8.99 },
        { name: 'Medium 12-inch', price: 12.99 },
        { name: 'Family Large 16-inch', price: 16.99 },
      ],
    },
    {
      itemCode: 'PAS-001',
      category: 'Pizzas & Pastas',
      name: 'Fettuccine Alfredo with Grilled Chicken',
      urduName: 'فیٹوچینی الفریڈو پاستا',
      description: 'Al dente fettuccine ribbons tossed in velvety garlic parmesan cream sauce with herb chicken',
      basePrice: 13.99,
      sortOrder: 3,
    },
    // Pakistani & Desi Specials
    {
      itemCode: 'DES-001',
      category: 'Pakistani & Desi Specials',
      name: 'Desi Makhni Butter Chicken Karahi',
      urduName: 'دیسی مکھنی بٹر چکن کڑاہی',
      description: 'Boneless chicken cubes simmered in a velvety tomato, cream, and desi ghee gravy with ginger julienne',
      basePrice: 17.99,
      sortOrder: 1,
      variants: [
        { name: 'Half Karahi (Serves 2)', price: 17.99 },
        { name: 'Full Karahi (Serves 4)', price: 29.99 },
      ],
      modGroups: ['Spice Level'],
    },
    {
      itemCode: 'DES-002',
      category: 'Pakistani & Desi Specials',
      name: 'Royal Mutton Dum Biryani',
      urduName: 'شاہی مٹن دم بریانی',
      description: 'Slow-cooked succulent mutton layered with long grain basmati rice, saffron, and aromatic spices',
      basePrice: 15.99,
      sortOrder: 2,
      variants: [
        { name: 'Single Portion', price: 15.99 },
        { name: 'Family Dawat Platter', price: 28.99 },
      ],
    },
    {
      itemCode: 'DES-003',
      category: 'Pakistani & Desi Specials',
      name: 'Butter Naan / Garlic Naan',
      urduName: 'بٹر نان / گارلک نان',
      description: 'Tandoor baked fluffy flatbread brushed with organic butter or minced garlic cilantro',
      basePrice: 2.50,
      sortOrder: 3,
      variants: [
        { name: 'Plain Tandoori Roti', price: 1.50 },
        { name: 'Butter Naan', price: 2.50 },
        { name: 'Garlic Herb Naan', price: 3.00 },
        { name: 'Cheese Stuffed Naan', price: 4.50 },
      ],
    },
    // Beverages
    {
      itemCode: 'BEV-001',
      category: 'Beverages & Mocktails',
      name: 'Fresh Mint Margarita Cooler',
      urduName: 'فریش منٹ مارگریٹا',
      description: 'Crushed ice blended with fresh garden mint leaves, lime juice, rock salt, and sprite',
      basePrice: 4.50,
      sortOrder: 1,
    },
    {
      itemCode: 'BEV-002',
      category: 'Beverages & Mocktails',
      name: 'Iced Caramel Macchiato',
      urduName: 'آئسڈ کیریمل مکیاٹو',
      description: 'Double shot espresso poured over cold milk, Madagascar vanilla, and drizzled with caramel',
      basePrice: 5.25,
      sortOrder: 2,
    },
    {
      itemCode: 'BEV-003',
      category: 'Beverages & Mocktails',
      name: 'Soft Drink 330ml Can',
      urduName: 'کولڈ ڈرنک کین',
      description: 'Chilled soda can (Coca-Cola, Diet Coke, Sprite, Fanta, Ginger Ale)',
      basePrice: 2.00,
      sortOrder: 3,
      variants: [
        { name: 'Coca-Cola Can 330ml', price: 2.00 },
        { name: 'Diet Coke Can 330ml', price: 2.00 },
        { name: 'Sprite Lemon-Lime 330ml', price: 2.00 },
        { name: 'Sparkling Mineral Water 500ml', price: 2.50 },
      ],
    },
    // Desserts
    {
      itemCode: 'DST-001',
      category: 'Desserts & Sweets',
      name: 'Gourmet Belgian Molten Lava Cake',
      urduName: 'بیلجیئن مولٹن لاوا کیک',
      description: 'Warm dark chocolate cake with a gooey flowing center, served with French vanilla bean gelato',
      basePrice: 7.99,
      sortOrder: 1,
    },
    {
      itemCode: 'DST-002',
      category: 'Desserts & Sweets',
      name: 'New York Style Berry Cheesecake',
      urduName: 'نیویارک چیزکیک',
      description: 'Rich and creamy baked cheesecake topped with homemade wild strawberry compote',
      basePrice: 6.99,
      sortOrder: 2,
    },
  ];

  const menuItemMap = new Map<string, any>();
  const variantMap = new Map<string, any>();

  for (const item of menuItemsData) {
    const cat = categoryMap.get(item.category);
    if (!cat) continue;

    const menuItem = await prisma.menuItem.upsert({
      where: {
        restaurantId_itemCode: {
          restaurantId: restaurant.id,
          itemCode: item.itemCode,
        },
      },
      update: {
        categoryId: cat.id,
        name: item.name,
        urduName: item.urduName,
        description: item.description,
        basePrice: item.basePrice,
        sortOrder: item.sortOrder,
        isActive: true,
        isAvailable: true,
      },
      create: {
        restaurantId: restaurant.id,
        categoryId: cat.id,
        itemCode: item.itemCode,
        name: item.name,
        urduName: item.urduName,
        description: item.description,
        basePrice: item.basePrice,
        sortOrder: item.sortOrder,
        isActive: true,
        isAvailable: true,
      },
    });

    menuItemMap.set(item.itemCode, menuItem);

    // Variants
    if (item.variants && item.variants.length > 0) {
      for (let i = 0; i < item.variants.length; i++) {
        const v = item.variants[i];
        let variant = await prisma.menuItemVariant.findFirst({
          where: { menuItemId: menuItem.id, name: v.name },
        });
        if (variant) {
          variant = await prisma.menuItemVariant.update({
            where: { id: variant.id },
            data: { price: v.price, sortOrder: i + 1, isActive: true },
          });
        } else {
          variant = await prisma.menuItemVariant.create({
            data: {
              menuItemId: menuItem.id,
              name: v.name,
              price: v.price,
              sortOrder: i + 1,
              isActive: true,
            },
          });
        }
        variantMap.set(`${item.itemCode}:${v.name}`, variant);
      }
    }

    // Link Modifier Groups
    if (item.modGroups && item.modGroups.length > 0) {
      for (let i = 0; i < item.modGroups.length; i++) {
        const mgName = item.modGroups[i];
        const mg = modGroupMap.get(mgName);
        if (mg) {
          await prisma.menuItemModifierGroup.upsert({
            where: {
              menuItemId_modifierGroupId: {
                menuItemId: menuItem.id,
                modifierGroupId: mg.id,
              },
            },
            update: { sortOrder: i + 1 },
            create: {
              menuItemId: menuItem.id,
              modifierGroupId: mg.id,
              sortOrder: i + 1,
              isRequired: mg.minSelections > 0,
            },
          });
        }
      }
    }
  }
  console.log(`✅ Seeded ${menuItemMap.size} menu items and ${variantMap.size} portion variants`);

  // ---------------------------------------------------------------------------
  // 10. Seed Stock Locations
  // ---------------------------------------------------------------------------
  console.log('🏢 Seeding Inventory Stock Locations...');
  const locationsData = [
    { name: 'Main Cold Storage & Walk-in', code: 'COLD_STORE', isDefault: true },
    { name: 'Kitchen Dry Pantry', code: 'DRY_PANTRY', isDefault: false },
    { name: 'Bar & Beverage Cellar', code: 'BAR_STORE', isDefault: false },
    { name: 'Packaging & Disposables Store', code: 'PACKAGING_STORE', isDefault: false },
  ];

  const locationMap = new Map<string, any>();
  for (const loc of locationsData) {
    const record = await prisma.stockLocation.upsert({
      where: {
        restaurantId_name: { restaurantId: restaurant.id, name: loc.name },
      },
      update: { code: loc.code, isDefault: loc.isDefault, isActive: true },
      create: { restaurantId: restaurant.id, name: loc.name, code: loc.code, isDefault: loc.isDefault, isActive: true },
    });
    locationMap.set(loc.code, record);
  }
  console.log(`✅ Seeded ${locationMap.size} inventory locations`);

  const coldLocation = locationMap.get('COLD_STORE');
  const dryPantryLocation = locationMap.get('DRY_PANTRY');
  const packagingLocation = locationMap.get('PACKAGING_STORE');

  // ---------------------------------------------------------------------------
  // 11. Seed Suppliers
  // ---------------------------------------------------------------------------
  console.log('🏭 Seeding Supplier Directory...');
  const suppliersData = [
    { name: 'Apex Prime Meat & Poultry Co.', contactPerson: 'Karim Ullah', phone: '+1 (555) 301-4499', email: 'orders@apexprime.com', address: '44 Meatpacking Way, Bronx, NY' },
    { name: 'Green Valley Fresh Produce LLC', contactPerson: 'Elena Rostova', phone: '+1 (555) 778-9922', email: 'delivery@greenvalley.com', address: '12 Farmers Market Loop, Queens, NY' },
    { name: 'Dairy Crest Artisanal Provisions', contactPerson: 'Liam O’Connor', phone: '+1 (555) 441-2288', email: 'sales@dairycrest.com', address: '88 Dairy Farm Road, Brooklyn, NY' },
    { name: 'Oceanic Global Spices & Dry Staples', contactPerson: 'Haris Mansoor', phone: '+1 (555) 902-1133', email: 'info@oceanicstaples.com', address: '200 Import Blvd, Newark, NJ' },
    { name: 'EcoPack Packaging & Disposables Hub', contactPerson: 'Jessica Tan', phone: '+1 (555) 667-8811', email: 'supplies@ecopackhub.com', address: '30 Industrial Parkway, Jersey City, NJ' },
  ];

  const supplierMap = new Map<string, any>();
  for (const s of suppliersData) {
    const record = await prisma.supplier.upsert({
      where: {
        restaurantId_name: { restaurantId: restaurant.id, name: s.name },
      },
      update: { contactPerson: s.contactPerson, phone: s.phone, email: s.email, address: s.address, isActive: true },
      create: { restaurantId: restaurant.id, name: s.name, contactPerson: s.contactPerson, phone: s.phone, email: s.email, address: s.address, isActive: true },
    });
    supplierMap.set(s.name, record);
  }
  console.log(`✅ Seeded ${supplierMap.size} suppliers`);

  // ---------------------------------------------------------------------------
  // 12. Seed Inventory Items
  // ---------------------------------------------------------------------------
  console.log('📦 Seeding Inventory Items & Stock Quantities...');
  const inventoryItemsData = [
    { code: 'RAW-BEEF-01', name: 'Fresh Angus Beef Tenderloin Cut', unit: 'KG', cost: 16.50, stock: 45.0, minStock: 15.0, targetStock: 80.0, supplier: 'Apex Prime Meat & Poultry Co.', loc: coldLocation.id },
    { code: 'RAW-CHICK-01', name: 'Fresh Boneless Chicken Breast', unit: 'KG', cost: 6.80, stock: 75.0, minStock: 25.0, targetStock: 120.0, supplier: 'Apex Prime Meat & Poultry Co.', loc: coldLocation.id },
    { code: 'RAW-CHEESE-01', name: 'Whole Milk Mozzarella Block', unit: 'KG', cost: 8.50, stock: 32.0, minStock: 10.0, targetStock: 50.0, supplier: 'Dairy Crest Artisanal Provisions', loc: coldLocation.id },
    { code: 'RAW-CHEESE-02', name: 'Aged Cheddar Cheese Slices', unit: 'PACK', cost: 5.20, stock: 28.0, minStock: 8.0, targetStock: 40.0, supplier: 'Dairy Crest Artisanal Provisions', loc: coldLocation.id },
    { code: 'RAW-BUNS-01', name: 'Brioche Burger Buns 4-inch (Pack of 6)', unit: 'PACK', cost: 3.00, stock: 60.0, minStock: 20.0, targetStock: 100.0, supplier: 'Oceanic Global Spices & Dry Staples', loc: dryPantryLocation.id },
    { code: 'RAW-FLOUR-01', name: 'Italian Tipo 00 Pizza Flour', unit: 'KG', cost: 1.65, stock: 150.0, minStock: 40.0, targetStock: 200.0, supplier: 'Oceanic Global Spices & Dry Staples', loc: dryPantryLocation.id },
    { code: 'RAW-POTATO-01', name: 'Russet Potatoes for Fries', unit: 'KG', cost: 1.10, stock: 95.0, minStock: 30.0, targetStock: 150.0, supplier: 'Green Valley Fresh Produce LLC', loc: dryPantryLocation.id },
    { code: 'RAW-TOMATO-01', name: 'Ripe Vine Tomatoes', unit: 'KG', cost: 1.80, stock: 42.0, minStock: 15.0, targetStock: 60.0, supplier: 'Green Valley Fresh Produce LLC', loc: coldLocation.id },
    { code: 'RAW-RICE-01', name: 'Super Kernel Basmati Rice Premium', unit: 'KG', cost: 2.40, stock: 110.0, minStock: 35.0, targetStock: 180.0, supplier: 'Oceanic Global Spices & Dry Staples', loc: dryPantryLocation.id },
    { code: 'RAW-OIL-01', name: 'Pure Vegetable Cooking Oil (16L Tin)', unit: 'TIN', cost: 28.50, stock: 12.0, minStock: 4.0, targetStock: 20.0, supplier: 'Oceanic Global Spices & Dry Staples', loc: dryPantryLocation.id },
    { code: 'RAW-COFFEE-01', name: 'Espresso Roasted Coffee Beans', unit: 'KG', cost: 14.50, stock: 18.0, minStock: 5.0, targetStock: 30.0, supplier: 'Oceanic Global Spices & Dry Staples', loc: dryPantryLocation.id },
    { code: 'PKG-BOX-01', name: 'Faraz Kraft Clamshell Burger Box', unit: 'PACK', cost: 8.50, stock: 35.0, minStock: 10.0, targetStock: 60.0, supplier: 'EcoPack Packaging & Disposables Hub', loc: packagingLocation.id },
    { code: 'PKG-BAG-01', name: 'Heavy Duty Takeaway Handle Bags (100/pk)', unit: 'PACK', cost: 11.50, stock: 24.0, minStock: 8.0, targetStock: 40.0, supplier: 'EcoPack Packaging & Disposables Hub', loc: packagingLocation.id },
  ];

  const invItemMap = new Map<string, any>();
  for (const item of inventoryItemsData) {
    const sup = supplierMap.get(item.supplier);
    const inv = await prisma.inventoryItem.upsert({
      where: {
        restaurantId_itemCode: {
          restaurantId: restaurant.id,
          itemCode: item.code,
        },
      },
      update: {
        name: item.name,
        unit: item.unit,
        costPerUnit: item.cost,
        currentStock: item.stock,
        minStockLevel: item.minStock,
        targetStockLevel: item.targetStock,
        supplierId: sup ? sup.id : undefined,
        locationId: item.loc,
        isActive: true,
      },
      create: {
        restaurantId: restaurant.id,
        itemCode: item.code,
        name: item.name,
        unit: item.unit,
        costPerUnit: item.cost,
        currentStock: item.stock,
        minStockLevel: item.minStock,
        targetStockLevel: item.targetStock,
        supplierId: sup ? sup.id : undefined,
        locationId: item.loc,
        isActive: true,
      },
    });
    invItemMap.set(item.code, inv);
  }
  console.log(`✅ Seeded ${invItemMap.size} inventory items across suppliers & stock locations`);

  // ---------------------------------------------------------------------------
  // 13. Seed Recipes (MenuItemIngredient linkages)
  // ---------------------------------------------------------------------------
  console.log('🥘 Seeding Recipe formulations & BOMs...');
  const burgerItem = menuItemMap.get('BGR-001');
  const tenderloin = invItemMap.get('RAW-BEEF-01');
  const burgerBun = invItemMap.get('RAW-BUNS-01');
  const cheddar = invItemMap.get('RAW-CHEESE-02');
  const potatoes = invItemMap.get('RAW-POTATO-01');

  if (burgerItem && tenderloin && burgerBun && cheddar && potatoes) {
    const existingIng = await prisma.menuItemIngredient.findFirst({
      where: { menuItemId: burgerItem.id },
    });
    if (!existingIng) {
      await prisma.menuItemIngredient.createMany({
        data: [
          { restaurantId: restaurant.id, menuItemId: burgerItem.id, inventoryItemId: tenderloin.id, quantity: 0.20, wastePercentage: 2 },
          { restaurantId: restaurant.id, menuItemId: burgerItem.id, inventoryItemId: burgerBun.id, quantity: 0.166, wastePercentage: 0 },
          { restaurantId: restaurant.id, menuItemId: burgerItem.id, inventoryItemId: cheddar.id, quantity: 0.05, wastePercentage: 0 },
          { restaurantId: restaurant.id, menuItemId: burgerItem.id, inventoryItemId: potatoes.id, quantity: 0.20, wastePercentage: 5 },
        ],
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 14. Seed Purchase Orders & Receiving Logs & Stock Movements
  // ---------------------------------------------------------------------------
  console.log('📑 Seeding Purchase Orders & Receiving Logs...');
  const apexSupplier = supplierMap.get('Apex Prime Meat & Poultry Co.');
  if (apexSupplier && tenderloin) {
    const po1 = await prisma.purchaseOrder.upsert({
      where: {
        restaurantId_orderNumber: { restaurantId: restaurant.id, orderNumber: 'PO-2026-001' },
      },
      update: { status: 'RECEIVED' },
      create: {
        restaurantId: restaurant.id,
        supplierId: apexSupplier.id,
        locationId: coldLocation.id,
        orderNumber: 'PO-2026-001',
        invoiceNumber: 'INV-APEX-98211',
        status: 'RECEIVED',
        subtotal: 495.00,
        taxAmount: 0.00,
        totalCost: 495.00,
        totalAmount: 495.00,
        receivedAt: new Date(Date.now() - 86400000),
        notes: 'Delivered in temperature controlled vehicle at 2°C. Quality approved.',
        createdById: managerUser.id,
      },
    });

    const poItem1 = await prisma.purchaseOrderItem.findFirst({
      where: { purchaseOrderId: po1.id },
    });
    if (!poItem1) {
      await prisma.purchaseOrderItem.create({
        data: {
          purchaseOrderId: po1.id,
          inventoryItemId: tenderloin.id,
          quantity: 30.0,
          quantityReceived: 30.0,
          unitCost: 16.50,
          subtotal: 495.00,
          totalCost: 495.00,
        },
      });

      // Stock Movement Log
      await prisma.stockMovement.create({
        data: {
          restaurantId: restaurant.id,
          inventoryItemId: tenderloin.id,
          toLocationId: coldLocation.id,
          type: StockMovementType.PURCHASE_RECEIPT,
          quantityChange: 30.0,
          balanceAfter: tenderloin.currentStock,
          unitCost: 16.50,
          totalCost: 495.00,
          referenceType: 'PURCHASE_ORDER',
          referenceId: po1.id,
          reason: 'Supplier Delivery Receipt PO-2026-001',
          createdById: managerUser.id,
        },
      });
    }

    // Purchase Order 2: Draft / Ordered
    await prisma.purchaseOrder.upsert({
      where: {
        restaurantId_orderNumber: { restaurantId: restaurant.id, orderNumber: 'PO-2026-002' },
      },
      update: { status: 'ORDERED' },
      create: {
        restaurantId: restaurant.id,
        supplierId: apexSupplier.id,
        locationId: coldLocation.id,
        orderNumber: 'PO-2026-002',
        status: 'ORDERED',
        subtotal: 340.00,
        totalCost: 340.00,
        totalAmount: 340.00,
        orderedAt: new Date(),
        expectedDeliveryDate: new Date(Date.now() + 86400000),
        notes: 'Scheduled for tomorrow morning delivery.',
        createdById: managerUser.id,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // 15. Seed Customers & Addresses
  // ---------------------------------------------------------------------------
  console.log('👥 Seeding Customers & Delivery Addresses...');
  const customersData = [
    {
      name: 'Ahmed Khan',
      phone: '+923005551122',
      notes: 'VIP Regular Customer. Prefers well-done steak and extra spicy curries.',
      address: '12-C Gulberg III, Main Boulevard, Lahore',
      landmark: 'Near Siddiq Trade Center',
    },
    {
      name: 'Fatima Zahra',
      phone: '+923214442233',
      notes: 'Frequent family diner. Loves the thin crust pizzas.',
      address: 'House 45, Sector Y, Phase 3, DHA, Lahore',
      landmark: 'Opposite Sector Y Commercial Park',
    },
    {
      name: 'Usman Tariq',
      phone: '+923337778899',
      notes: 'Corporate client ordering weekday lunches.',
      address: 'Suite 402, Al-Hafeez Executive Tower, Ferozepur Road',
      landmark: '4th Floor Executive Wing',
    },
    {
      name: 'Sarah Jenkins',
      phone: '+15559876543',
      notes: 'Loves fresh salads and iced caramel macchiatos.',
      address: '742 Evergreen Terrace, Apt 5B, New York, NY 10025',
      landmark: 'Corner of 74th & Amsterdam',
    },
    {
      name: 'Michael Chang',
      phone: '+15552345678',
      notes: 'Regular takeaway customer.',
      address: '120 Riverside Drive, Suite 8A, New York, NY 10024',
      landmark: 'Near Riverside Park Entrance',
    },
    {
      name: 'Bilal Hassan',
      phone: '+923019998877',
      notes: 'Orders large Biryani platters on weekends.',
      address: '88-G, Johar Town, Phase 1, Lahore',
      landmark: 'Near Shaukat Khanum Hospital',
    },
  ];

  const customerMap = new Map<string, any>();
  for (const c of customersData) {
    const customer = await prisma.customer.upsert({
      where: {
        restaurantId_phone: {
          restaurantId: restaurant.id,
          phone: c.phone,
        },
      },
      update: { name: c.name, notes: c.notes, isActive: true },
      create: {
        restaurantId: restaurant.id,
        name: c.name,
        phone: c.phone,
        notes: c.notes,
        isActive: true,
      },
    });
    customerMap.set(c.phone, customer);

    const addr = await prisma.customerAddress.findFirst({
      where: { customerId: customer.id },
    });
    if (!addr) {
      await prisma.customerAddress.create({
        data: {
          customerId: customer.id,
          address: c.address,
          landmark: c.landmark,
          isDefault: true,
        },
      });
    }
  }
  console.log(`✅ Seeded ${customerMap.size} customer profiles with verified delivery addresses`);

  // ---------------------------------------------------------------------------
  // 16. Seed Loyalty Program & Tiers & Accounts
  // ---------------------------------------------------------------------------
  console.log('💎 Seeding Loyalty Program & Rewards Tiers...');
  await prisma.loyaltyProgram.upsert({
    where: { restaurantId: restaurant.id },
    update: {
      isEnabled: true,
      programName: 'Faraz Rewards Club',
      pointsPerCurrencyUnit: 1.0,
      redemptionRate: 0.02, // 50 points = $1.00
      minPointsToRedeem: 50,
      roundingMode: LoyaltyRoundingMode.FLOOR,
    },
    create: {
      restaurantId: restaurant.id,
      isEnabled: true,
      programName: 'Faraz Rewards Club',
      pointsPerCurrencyUnit: 1.0,
      redemptionRate: 0.02,
      minPointsToRedeem: 50,
      roundingMode: LoyaltyRoundingMode.FLOOR,
    },
  });

  const tiersData = [
    { name: 'Bronze Member', minPoints: 0, multiplier: 1.0, discount: 0, color: '#CD7F32', order: 1 },
    { name: 'Silver Gourmet', minPoints: 250, multiplier: 1.2, discount: 5.0, color: '#C0C0C0', order: 2 },
    { name: 'Gold Epicurean', minPoints: 750, multiplier: 1.5, discount: 10.0, color: '#FFD700', order: 3 },
    { name: 'Platinum Elite', minPoints: 2000, multiplier: 2.0, discount: 15.0, color: '#E5E4E2', order: 4 },
  ];

  const tierMap = new Map<string, any>();
  for (const t of tiersData) {
    const tier = await prisma.loyaltyTier.upsert({
      where: {
        restaurantId_name: { restaurantId: restaurant.id, name: t.name },
      },
      update: { minPoints: t.minPoints, multiplier: t.multiplier, discountPercentage: t.discount, color: t.color, sortOrder: t.order },
      create: { restaurantId: restaurant.id, name: t.name, minPoints: t.minPoints, multiplier: t.multiplier, discountPercentage: t.discount, color: t.color, sortOrder: t.order },
    });
    tierMap.set(t.name, tier);
  }

  // Create loyalty accounts with balances
  const goldTier = tierMap.get('Gold Epicurean');
  const silverTier = tierMap.get('Silver Gourmet');

  const ahmedCustomer = customerMap.get('+923005551122');
  if (ahmedCustomer && goldTier) {
    const account = await prisma.loyaltyAccount.upsert({
      where: { customerId: ahmedCustomer.id },
      update: { pointsBalance: 850, lifetimePoints: 1200, tierId: goldTier.id },
      create: {
        restaurantId: restaurant.id,
        customerId: ahmedCustomer.id,
        tierId: goldTier.id,
        pointsBalance: 850,
        lifetimePoints: 1200,
        totalRedeemedPoints: 350,
      },
    });

    const tx = await prisma.loyaltyTransaction.findFirst({
      where: { accountId: account.id },
    });
    if (!tx) {
      await prisma.loyaltyTransaction.create({
        data: {
          restaurantId: restaurant.id,
          accountId: account.id,
          customerId: ahmedCustomer.id,
          type: LoyaltyTransactionType.EARN,
          points: 150,
          pointsBalanceAfter: 850,
          monetaryValue: 3.00,
          reason: 'Points earned on dining order ORD-2026-001',
          createdById: cashierUser.id,
        },
      });
    }
  }

  const fatimaCustomer = customerMap.get('+923214442233');
  if (fatimaCustomer && silverTier) {
    await prisma.loyaltyAccount.upsert({
      where: { customerId: fatimaCustomer.id },
      update: { pointsBalance: 320, lifetimePoints: 450, tierId: silverTier.id },
      create: {
        restaurantId: restaurant.id,
        customerId: fatimaCustomer.id,
        tierId: silverTier.id,
        pointsBalance: 320,
        lifetimePoints: 450,
        totalRedeemedPoints: 130,
      },
    });
  }
  console.log(`✅ Seeded loyalty program, 4 tier levels, and member loyalty ledgers`);

  // ---------------------------------------------------------------------------
  // 17. Seed Marketing Promotions & Campaign Vouchers
  // ---------------------------------------------------------------------------
  console.log('🏷️  Seeding Marketing Promotions & Discount Campaigns...');
  await prisma.promotion.upsert({
    where: {
      restaurantId_code: { restaurantId: restaurant.id, code: 'WELCOME10' },
    },
    update: { discountValue: 10, isActive: true },
    create: {
      restaurantId: restaurant.id,
      name: 'New Guest Welcome 10% Off',
      code: 'WELCOME10',
      description: '10% discount on entire bill for dine-in or takeaway',
      type: PromotionType.PERCENTAGE,
      targetType: PromotionTargetType.ORDER,
      discountValue: 10.0,
      minOrderAmount: 20.0,
      isActive: true,
      isAutoApply: false,
    },
  });

  await prisma.promotion.upsert({
    where: {
      restaurantId_code: { restaurantId: restaurant.id, code: 'BURGERFEST20' },
    },
    update: { discountValue: 20, isActive: true },
    create: {
      restaurantId: restaurant.id,
      name: 'Weekend Burger Mania 20% Off',
      code: 'BURGERFEST20',
      description: '20% off all gourmet burgers and sandwiches',
      type: PromotionType.PERCENTAGE,
      targetType: PromotionTargetType.CATEGORY,
      discountValue: 20.0,
      isActive: true,
    },
  });
  console.log(`✅ Seeded active marketing promo campaigns`);

  // ---------------------------------------------------------------------------
  // 18. Seed Cashier Shifts & Cash Transactions
  // ---------------------------------------------------------------------------
  console.log('💰 Seeding Cashier Shifts & Drawer Records...');
  // Closed shift for yesterday
  const closedShift = await prisma.cashierShift.upsert({
    where: { id: 'shift-yesterday-001' },
    update: {},
    create: {
      id: 'shift-yesterday-001',
      restaurantId: restaurant.id,
      cashierId: cashierUser.id,
      registerName: 'Register 1 - Front Counter',
      businessDate: yesterdayStr,
      status: ShiftStatus.CLOSED,
      openedAt: new Date(Date.now() - 86400000),
      closedAt: new Date(Date.now() - 50400000),
      openingCash: 200.00,
      cashSales: 1250.00,
      cashRefunds: 0.00,
      cashDrops: 1000.00,
      expectedClosingCash: 450.00,
      actualClosingCash: 450.00,
      variance: 0.00,
      closedById: managerUser.id,
      notes: 'Evening shift balanced perfectly with zero variance.',
    },
  });

  // Open shift for today
  const activeShift = await prisma.cashierShift.upsert({
    where: { id: 'shift-today-001' },
    update: { status: ShiftStatus.OPEN },
    create: {
      id: 'shift-today-001',
      restaurantId: restaurant.id,
      cashierId: cashierUser.id,
      registerName: 'Register 1 - Front Counter',
      businessDate: todayStr,
      status: ShiftStatus.OPEN,
      openedAt: new Date(),
      openingCash: 200.00,
      cashSales: 380.00,
      cashRefunds: 0.00,
      cashDrops: 0.00,
      notes: 'Morning shift currently active.',
    },
  });

  // Cash float transaction
  const existingTx = await prisma.cashTransaction.findFirst({
    where: { shiftId: activeShift.id },
  });
  if (!existingTx) {
    await prisma.cashTransaction.create({
      data: {
        restaurantId: restaurant.id,
        shiftId: activeShift.id,
        type: CashTransactionType.OPENING_FLOAT,
        amount: 200.00,
        reason: 'Initial opening cash drawer float',
        createdById: cashierUser.id,
      },
    });
  }
  console.log(`✅ Seeded yesterday's closed shift and today's active drawer shift`);

  // ---------------------------------------------------------------------------
  // 19. Seed Operational Expenses
  // ---------------------------------------------------------------------------
  console.log('💸 Seeding Operational Expenses & Petty Cash Logs...');
  const kitchenCat = await prisma.expenseCategory.findFirst({
    where: { restaurantId: restaurant.id, name: 'Kitchen & Raw Materials' },
  });
  const staffMealsCat = await prisma.expenseCategory.findFirst({
    where: { restaurantId: restaurant.id, name: 'Staff Meals & Welfare' },
  });
  const pettyCashCat = await prisma.expenseCategory.findFirst({
    where: { restaurantId: restaurant.id, name: 'Petty Cash & Maintenance' },
  });

  if (kitchenCat) {
    await prisma.expense.upsert({
      where: {
        restaurantId_expenseNumber: { restaurantId: restaurant.id, expenseNumber: 'EXP-2026-001' },
      },
      update: {},
      create: {
        restaurantId: restaurant.id,
        categoryId: kitchenCat.id,
        shiftId: activeShift.id,
        expenseNumber: 'EXP-2026-001',
        amount: 24.50,
        paymentMethod: PaymentMethod.CASH,
        status: ExpenseStatus.RECORDED,
        businessDate: todayStr,
        description: 'Emergency lemons and fresh coriander purchase from local market',
        notes: 'Receipt attached from Local Fresh Bazaar',
        createdById: cashierUser.id,
      },
    });
  }

  if (staffMealsCat) {
    await prisma.expense.upsert({
      where: {
        restaurantId_expenseNumber: { restaurantId: restaurant.id, expenseNumber: 'EXP-2026-002' },
      },
      update: {},
      create: {
        restaurantId: restaurant.id,
        categoryId: staffMealsCat.id,
        shiftId: activeShift.id,
        expenseNumber: 'EXP-2026-002',
        amount: 35.00,
        paymentMethod: PaymentMethod.CASH,
        status: ExpenseStatus.RECORDED,
        businessDate: todayStr,
        description: 'Staff afternoon tea, bakery snacks & refreshments',
        createdById: cashierUser.id,
      },
    });
  }

  if (pettyCashCat) {
    await prisma.expense.upsert({
      where: {
        restaurantId_expenseNumber: { restaurantId: restaurant.id, expenseNumber: 'EXP-2026-003' },
      },
      update: {},
      create: {
        restaurantId: restaurant.id,
        categoryId: pettyCashCat.id,
        expenseNumber: 'EXP-2026-003',
        amount: 65.00,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        status: ExpenseStatus.RECORDED,
        businessDate: yesterdayStr,
        description: 'Commercial dishwasher water filter replacement plumbing service',
        createdById: managerUser.id,
      },
    });
  }
  console.log(`✅ Seeded operational expense records and petty cash entries`);

  // ---------------------------------------------------------------------------
  // 20. Seed Reservations & Table Bookings
  // ---------------------------------------------------------------------------
  console.log('📅 Seeding Reservations & Table Bookings...');
  const tableT03 = tableMap.get('T-03');
  const tableF02 = tableMap.get('F-02');

  const resDate = new Date();
  const resStartTime = new Date(resDate.setHours(19, 30, 0, 0));
  const resEndTime = new Date(resDate.getTime() + 90 * 60000);

  await prisma.reservation.upsert({
    where: {
      restaurantId_reservationCode: { restaurantId: restaurant.id, reservationCode: 'RES-2026-001' },
    },
    update: { status: ReservationStatus.CONFIRMED },
    create: {
      restaurantId: restaurant.id,
      reservationCode: 'RES-2026-001',
      customerId: ahmedCustomer ? ahmedCustomer.id : undefined,
      customerName: 'Ahmed Khan',
      customerPhone: '+923005551122',
      customerEmail: 'ahmed.khan@example.com',
      guestCount: 4,
      tableId: tableT03 ? tableT03.id : undefined,
      reservationDate: new Date(),
      startTime: resStartTime,
      endTime: resEndTime,
      durationMinutes: 90,
      status: ReservationStatus.CONFIRMED,
      specialRequests: 'Window side seating requested. Celebrating wedding anniversary.',
      createdById: cashierUser.id,
    },
  });

  const resDate2 = new Date();
  const resStartTime2 = new Date(resDate2.setHours(20, 0, 0, 0));
  const resEndTime2 = new Date(resDate2.getTime() + 90 * 60000);

  await prisma.reservation.upsert({
    where: {
      restaurantId_reservationCode: { restaurantId: restaurant.id, reservationCode: 'RES-2026-002' },
    },
    update: { status: ReservationStatus.CONFIRMED },
    create: {
      restaurantId: restaurant.id,
      reservationCode: 'RES-2026-002',
      customerId: fatimaCustomer ? fatimaCustomer.id : undefined,
      customerName: 'Fatima Zahra',
      customerPhone: '+923214442233',
      guestCount: 6,
      tableId: tableF02 ? tableF02.id : undefined,
      reservationDate: new Date(),
      startTime: resStartTime2,
      endTime: resEndTime2,
      durationMinutes: 90,
      status: ReservationStatus.CONFIRMED,
      specialRequests: 'Require 1 baby high-chair.',
      createdById: cashierUser.id,
    },
  });
  console.log(`✅ Seeded dinner table reservations with customer linkages`);

  // ---------------------------------------------------------------------------
  // 21. Seed Dine-In Active Table Orders, Takeaway & Delivery Orders
  // ---------------------------------------------------------------------------
  console.log('🍽️  Seeding Active & Historical Orders across Dine-In, Takeaway, and Delivery...');

  const tableT02 = tableMap.get('T-02');
  const pizzaItem = menuItemMap.get('PIZ-001');
  const pastaItem = menuItemMap.get('PAS-001');
  const wingsItem = menuItemMap.get('APP-001');
  const biryaniItem = menuItemMap.get('DES-002');
  const bevItem = menuItemMap.get('BEV-001');
  const lavaCake = menuItemMap.get('DST-001');

  // --- A. Active Dine-In Table Order on Table T-02 ---
  if (tableT02 && burgerItem && pizzaItem && bevItem) {
    const tableOrder1 = await prisma.tableOrder.upsert({
      where: {
        restaurantId_orderCode: { restaurantId: restaurant.id, orderCode: 'TBL-T02-001' },
      },
      update: { status: TableOrderStatus.ACTIVE },
      create: {
        restaurantId: restaurant.id,
        tableId: tableT02.id,
        orderCode: 'TBL-T02-001',
        guestCount: 3,
        status: TableOrderStatus.ACTIVE,
        totalAmount: 34.48,
        openedByUserId: userMap.get('waiter_alex').id,
        openedAt: new Date(Date.now() - 25 * 60000), // 25 mins ago
      },
    });

    const dineInOrder1 = await prisma.order.upsert({
      where: {
        restaurantId_orderCode: { restaurantId: restaurant.id, orderCode: 'ORD-DINE-101' },
      },
      update: { status: OrderStatus.PREPARING },
      create: {
        restaurantId: restaurant.id,
        orderCode: 'ORD-DINE-101',
        businessDate: todayStr,
        orderType: OrderType.DINE_IN,
        status: OrderStatus.PREPARING,
        paymentStatus: OrderPaymentStatus.UNPAID,
        tableId: tableT02.id,
        tableOrderId: tableOrder1.id,
        guestCount: 3,
        subtotal: 32.48,
        taxRate: 8.875,
        taxAmount: 2.88,
        grandTotal: 35.36,
        createdById: userMap.get('waiter_alex').id,
        notes: 'Table 2 - Guests request hot sauce on the side',
      },
    });

    const existingItems1 = await prisma.orderItem.findFirst({
      where: { orderId: dineInOrder1.id },
    });
    if (!existingItems1) {
      await prisma.orderItem.createMany({
        data: [
          {
            orderId: dineInOrder1.id,
            menuItemId: burgerItem.id,
            itemName: burgerItem.name,
            quantity: 2,
            unitPrice: 12.99,
            itemGrossTotal: 25.98,
            itemNetTotal: 25.98,
            status: OrderItemStatus.ACTIVE,
            kitchenStatus: ItemKitchenStatus.PREPARING,
          },
          {
            orderId: dineInOrder1.id,
            menuItemId: bevItem.id,
            itemName: bevItem.name,
            quantity: 2,
            unitPrice: 4.50,
            itemGrossTotal: 9.00,
            itemNetTotal: 9.00,
            status: OrderItemStatus.ACTIVE,
            kitchenStatus: ItemKitchenStatus.READY,
          },
        ],
      });
    }
  }

  // --- B. Active Takeaway Order ---
  if (wingsItem && pastaItem && lavaCake) {
    const takeawayOrder1 = await prisma.takeawayOrder.upsert({
      where: {
        restaurantId_orderCode: { restaurantId: restaurant.id, orderCode: 'TKW-2026-101' },
      },
      update: { status: TakeawayOrderStatus.READY },
      create: {
        restaurantId: restaurant.id,
        tokenNumber: 101,
        orderCode: 'TKW-2026-101',
        businessDate: todayStr,
        customerName: 'Zainab Bibi',
        customerPhone: '+923126665544',
        status: TakeawayOrderStatus.READY,
        paymentStatus: TakeawayPaymentStatus.PAID,
        paymentMethod: 'CARD',
        subtotal: 30.97,
        taxRate: 8.875,
        taxAmount: 2.75,
        totalAmount: 33.72,
        specialInstructions: 'Pack with extra cutlery and paper napkins.',
        createdById: cashierUser.id,
      },
    });

    const existingTkItems = await prisma.takeawayOrderItem.findFirst({
      where: { takeawayOrderId: takeawayOrder1.id },
    });
    if (!existingTkItems) {
      await prisma.takeawayOrderItem.createMany({
        data: [
          { takeawayOrderId: takeawayOrder1.id, menuItemId: wingsItem.id, name: wingsItem.name, quantity: 1, unitPrice: 8.99, subtotal: 8.99 },
          { takeawayOrderId: takeawayOrder1.id, menuItemId: pastaItem.id, name: pastaItem.name, quantity: 1, unitPrice: 13.99, subtotal: 13.99 },
          { takeawayOrderId: takeawayOrder1.id, menuItemId: lavaCake.id, name: lavaCake.name, quantity: 1, unitPrice: 7.99, subtotal: 7.99 },
        ],
      });
    }

    // Also unified order entry
    const unifiedTkOrder = await prisma.order.upsert({
      where: {
        restaurantId_orderCode: { restaurantId: restaurant.id, orderCode: 'ORD-TKW-101' },
      },
      update: { status: OrderStatus.READY },
      create: {
        restaurantId: restaurant.id,
        orderCode: 'ORD-TKW-101',
        businessDate: todayStr,
        orderType: OrderType.TAKEAWAY,
        status: OrderStatus.READY,
        paymentStatus: OrderPaymentStatus.PAID,
        paymentMethod: 'CARD',
        tokenNumber: 101,
        customerName: 'Zainab Bibi',
        customerPhone: '+923126665544',
        subtotal: 30.97,
        taxRate: 8.875,
        taxAmount: 2.75,
        grandTotal: 33.72,
        paidAmount: 33.72,
        createdById: cashierUser.id,
      },
    });

    const existingUnifiedPayment = await prisma.payment.findFirst({
      where: { orderId: unifiedTkOrder.id },
    });
    if (!existingUnifiedPayment) {
      await prisma.payment.create({
        data: {
          restaurantId: restaurant.id,
          orderId: unifiedTkOrder.id,
          shiftId: activeShift.id,
          paymentMethod: PaymentMethod.CARD,
          amount: 33.72,
          amountTendered: 33.72,
          cardBrand: 'VISA',
          cardLast4: '4242',
          status: PaymentStatus.COMPLETED,
          createdById: cashierUser.id,
        },
      });
    }
  }

  // --- C. Active Delivery Order with Assigned Rider ---
  const standardZone = await prisma.deliveryZone.findFirst({
    where: { restaurantId: restaurant.id, name: { contains: 'Standard' } },
  });

  if (biryaniItem && burgerItem && riderAli && standardZone) {
    const deliveryOrder1 = await prisma.deliveryOrder.upsert({
      where: {
        restaurantId_orderCode: { restaurantId: restaurant.id, orderCode: 'DEL-2026-201' },
      },
      update: { status: DeliveryOrderStatus.DISPATCHED },
      create: {
        restaurantId: restaurant.id,
        orderCode: 'DEL-2026-201',
        businessDate: todayStr,
        customerId: ahmedCustomer ? ahmedCustomer.id : undefined,
        customerName: 'Ahmed Khan',
        customerPhone: '+923005551122',
        deliveryAddress: '12-C Gulberg III, Main Boulevard, Lahore',
        landmark: 'Near Siddiq Trade Center',
        deliveryZoneId: standardZone.id,
        deliveryZoneName: standardZone.name,
        deliveryCharge: 3.50,
        packagingCharge: 1.50,
        subtotal: 28.98,
        taxRate: 8.875,
        taxAmount: 2.57,
        totalAmount: 36.55,
        paymentStatus: DeliveryPaymentStatus.PENDING,
        paymentMethod: 'CASH',
        status: DeliveryOrderStatus.DISPATCHED,
        riderId: riderAli.id,
        assignedAt: new Date(Date.now() - 15 * 60000),
        dispatchedAt: new Date(Date.now() - 8 * 60000),
        specialInstructions: 'Ring bell twice upon arrival. Collect cash on delivery.',
        createdById: cashierUser.id,
      },
    });

    const existingDelItems = await prisma.deliveryOrderItem.findFirst({
      where: { deliveryOrderId: deliveryOrder1.id },
    });
    if (!existingDelItems) {
      await prisma.deliveryOrderItem.createMany({
        data: [
          { deliveryOrderId: deliveryOrder1.id, menuItemId: biryaniItem.id, name: biryaniItem.name, quantity: 1, unitPrice: 15.99, subtotal: 15.99 },
          { deliveryOrderId: deliveryOrder1.id, menuItemId: burgerItem.id, name: burgerItem.name, quantity: 1, unitPrice: 12.99, subtotal: 12.99 },
        ],
      });
    }

    // Unified order for delivery
    await prisma.order.upsert({
      where: {
        restaurantId_orderCode: { restaurantId: restaurant.id, orderCode: 'ORD-DEL-201' },
      },
      update: { status: OrderStatus.CONFIRMED },
      create: {
        restaurantId: restaurant.id,
        orderCode: 'ORD-DEL-201',
        businessDate: todayStr,
        orderType: OrderType.DELIVERY,
        status: OrderStatus.CONFIRMED,
        paymentStatus: OrderPaymentStatus.UNPAID,
        paymentMethod: 'CASH',
        customerId: ahmedCustomer ? ahmedCustomer.id : undefined,
        customerName: 'Ahmed Khan',
        customerPhone: '+923005551122',
        deliveryAddress: '12-C Gulberg III, Main Boulevard, Lahore',
        deliveryZoneId: standardZone.id,
        riderId: riderAli.id,
        subtotal: 28.98,
        deliveryCharge: 3.50,
        packagingCharge: 1.50,
        taxRate: 8.875,
        taxAmount: 2.57,
        grandTotal: 36.55,
        createdById: cashierUser.id,
      },
    });
  }

  // --- D. Completed Past Orders (Yesterday) ---
  const completedOrderCode = 'ORD-HIST-901';
  const completedOrder = await prisma.order.upsert({
    where: {
      restaurantId_orderCode: { restaurantId: restaurant.id, orderCode: completedOrderCode },
    },
    update: { status: OrderStatus.COMPLETED },
    create: {
      restaurantId: restaurant.id,
      orderCode: completedOrderCode,
      businessDate: yesterdayStr,
      orderType: OrderType.DINE_IN,
      status: OrderStatus.COMPLETED,
      paymentStatus: OrderPaymentStatus.PAID,
      paymentMethod: 'CASH',
      subtotal: 58.46,
      taxRate: 8.875,
      taxAmount: 5.19,
      grandTotal: 63.65,
      paidAmount: 70.00,
      changeAmount: 6.35,
      closedAt: new Date(Date.now() - 52000000),
      createdById: cashierUser.id,
    },
  });

  const existingCompletedPayment = await prisma.payment.findFirst({
    where: { orderId: completedOrder.id },
  });
  if (!existingCompletedPayment) {
    await prisma.payment.create({
      data: {
        restaurantId: restaurant.id,
        orderId: completedOrder.id,
        shiftId: closedShift.id,
        paymentMethod: PaymentMethod.CASH,
        amount: 63.65,
        amountTendered: 70.00,
        changeAmount: 6.35,
        status: PaymentStatus.COMPLETED,
        createdById: cashierUser.id,
      },
    });
  }
  console.log(`✅ Seeded active & historical orders across Dine-In, Takeaway, and Delivery`);

  // ---------------------------------------------------------------------------
  // 22. System Audit Log
  // ---------------------------------------------------------------------------
  await prisma.auditLog.create({
    data: {
      restaurantId: restaurant.id,
      userId: ownerUser.id,
      action: 'SYSTEM_COMPREHENSIVE_SEED',
      entityType: 'RESTAURANT',
      entityId: restaurant.id,
      metadata: {
        event: 'Comprehensive seed loaded: Users, Roles, Tables, Kitchen Stations, Categories, Menu Items, Variants, Modifiers, Inventory, Suppliers, Purchase Orders, Customers, Loyalty, Promotions, Shifts, Expenses, Reservations, and Orders.',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
      },
      ipAddress: '127.0.0.1',
    },
  });

  console.log('\n======================================================');
  console.log('🎉 Faraz POS Comprehensive Database Seed COMPLETED!');
  console.log('======================================================');
  console.log(`🏢 Restaurant: "${restaurant.name}"`);
  console.log(`👤 Owner:       @owner_admin   (PIN: 1234, Pass: FarazAdmin2026!)`);
  console.log(`👤 Manager:     @manager_john  (PIN: 2233, Pass: ManagerPass2026!)`);
  console.log(`👤 Cashier:     @cashier_sarah (PIN: 4321, Pass: CashierPass2026!)`);
  console.log(`👤 Waiters:     @waiter_alex   (PIN: 1122), @waiter_maya (PIN: 3344)`);
  console.log(`👤 Kitchen:     @chef_gordon   (PIN: 7788), @chef_marco  (PIN: 9900)`);
  console.log(`👤 Riders:      @rider_ali     (PIN: 5566), @rider_tariq (PIN: 6677)`);
  console.log('======================================================\n');
}

main()
  .catch((e) => {
    console.error('❌ Error during database seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
