/* eslint-disable no-console */
/**
 * DESTRUCTIVE demo seed — development and testing only.
 *
 * Wipes all public tables (except `_prisma_migrations`) then loads the
 * Pakistani demo restaurant, staff, menu, inventory, and sample orders.
 *
 * SAFETY: Refuses to run unless ALLOW_DESTRUCTIVE_SEED=1.
 * Prefer: npm run prisma:seed:demo
 *
 * Never use against production or customer databases.
 */
import {
  PrismaClient,
  TableStatus,
  OrderType,
  OrderStatus,
  OrderPaymentStatus,
  OrderItemStatus,
  ItemKitchenStatus,
  ShiftStatus,
  PromotionType,
  PromotionTargetType,
  ExpenseStatus,
  ModifierSelectionType,
} from '@prisma/client';
import bcrypt from 'bcrypt';
import {
  DEFAULT_PERMISSIONS,
  ROLE_PERMISSIONS_MAP,
} from '../src/common/rbac/permissions.catalog.js';

const prisma = new PrismaClient();
const BCRYPT_SALT_ROUNDS = 10;

function hashCredential(val: string): string {
  return bcrypt.hashSync(val, BCRYPT_SALT_ROUNDS);
}

function assertDestructiveSeedAllowed(): void {
  if (process.env.ALLOW_DESTRUCTIVE_SEED !== '1') {
    console.error('❌ Destructive demo seed refused.');
    console.error(
      '   This script TRUNCATES all business tables and must not run without explicit opt-in.',
    );
    console.error('   Re-run with:  npm run prisma:seed:demo');
    console.error('   Or set:       ALLOW_DESTRUCTIVE_SEED=1');
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
// 0. Clean & Wipe All Tables
// -----------------------------------------------------------------------------
async function clearDatabase() {
  console.log('🧹 [1/10] Wiping entire database to start fresh...');
  const tablenames = await prisma.$queryRaw<
    Array<{ tablename: string }>
  >`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename != '_prisma_migrations';`;

  for (const { tablename } of tablenames) {
    if (tablename !== '_prisma_migrations') {
      try {
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tablename}" CASCADE;`);
      } catch (error) {
        console.log(`Failed to truncate ${tablename}:`, error);
      }
    }
  }
  console.log('✨ All old data deleted successfully.');
}

async function main() {
  assertDestructiveSeedAllowed();

  console.log(
    '🇵🇰 Starting DESTRUCTIVE Pakistani demo seed ("Faraz Shinwari & Desi Dera")...\n',
  );
  console.log('⚠️  ALLOW_DESTRUCTIVE_SEED=1 detected — database will be wiped.\n');

  // Step 1: Wipe all old data
  await clearDatabase();

  const todayStr = new Date().toISOString().split('T')[0];

  // ---------------------------------------------------------------------------
  // 1. Seed Permissions Catalog
  // ---------------------------------------------------------------------------
  console.log('📋 [2/10] Seeding system permissions catalog...');
  const permissionMap = new Map<string, string>();
  for (const perm of DEFAULT_PERMISSIONS) {
    const record = await prisma.permission.create({
      data: { key: perm.key, description: perm.description },
    });
    permissionMap.set(record.key, record.id);
  }
  console.log(`   ✅ Seeded ${permissionMap.size} permissions`);

  // ---------------------------------------------------------------------------
  // 2. Seed Single Pakistani Restaurant Profile
  // ---------------------------------------------------------------------------
  console.log('\n🏪 [3/10] Seeding single Pakistani Restaurant Profile...');
  const restaurant = await prisma.restaurant.create({
    data: {
      name: 'Faraz Shinwari & Desi Dera',
      slug: 'faraz-flagship',
      legalName: 'Faraz Hospitality Group (Pvt) Ltd',
      phone: '+92 42 3575 8899',
      address: 'Plot 14-C, MM Alam Road, Gulberg III, Lahore, Punjab, Pakistan',
      currency: 'PKR',
      timezone: 'Asia/Karachi',
      taxNumber: 'PK-NTN-7491023-8',
      taxRate: 16.0,
      taxInclusive: false,
      serviceChargeRate: 0,
      serviceChargeEnabled: false,
      dineInEnabled: true,
      takeawayEnabled: true,
      deliveryEnabled: true,
      receiptHeader: 'Bismillah-ir-Rahman-ir-Rahim\nWelcome to Faraz Shinwari & Desi Dera\nAuthentic Koyla BBQ, Shinwari Karahi & Desi Handi\nMM Alam Road, Gulberg III, Lahore',
      receiptFooter: 'Thank you for dining with us! Shukriya!\nFor Catering & Family Reservations: 0300-1234567\nFollow us on Instagram: @farazshinwaridera',
      isActive: true,
    },
  });
  console.log(`   ✅ Restaurant: "${restaurant.name}" (Currency: ${restaurant.currency}, Tax: ${restaurant.taxRate}%)`);

  // ---------------------------------------------------------------------------
  // 3. Seed System Roles & Role Permissions
  // ---------------------------------------------------------------------------
  console.log('\n🛡️  [4/10] Seeding system roles & permissions...');
  const roleMap = new Map<string, string>();

  for (const [roleName, config] of Object.entries(ROLE_PERMISSIONS_MAP)) {
    const role = await prisma.role.create({
      data: {
        restaurantId: restaurant.id,
        name: roleName,
        description: config.description,
        isSystem: true,
      },
    });
    roleMap.set(roleName, role.id);

    for (const permKey of config.permissions) {
      const permissionId = permissionMap.get(permKey);
      if (permissionId) {
        await prisma.rolePermission.create({
          data: {
            roleId: role.id,
            permissionId: permissionId,
          },
        });
      }
    }
  }
  console.log(`   ✅ Seeded ${roleMap.size} roles and permission links`);

  // ---------------------------------------------------------------------------
  // 4. Seed Pakistani Staff Users
  // ---------------------------------------------------------------------------
  console.log('\n👤 [5/10] Seeding staff user roster...');
  const staffList = [
    { username: 'owner_admin', name: 'Faraz Owner', role: 'OWNER', pin: '1234', password: 'FarazAdmin2026!', phone: '+923001234560' },
    { username: 'manager_john', name: 'Hamza Manager', role: 'MANAGER', pin: '2233', password: 'ManagerPass2026!', phone: '+923001234561' },
    { username: 'cashier_sarah', name: 'Sarah Cashier', role: 'CASHIER', pin: '4321', password: 'CashierPass2026!', phone: '+923001234562' },
    { username: 'waiter_alex', name: 'Bilal Waiter', role: 'WAITER', pin: '1122', phone: '+923001234563' },
    { username: 'waiter_maya', name: 'Ayesha Waiter', role: 'WAITER', pin: '3344', phone: '+923001234564' },
    { username: 'chef_gordon', name: 'Ustad Aslam (Head Chef)', role: 'KITCHEN', pin: '7788', phone: '+923001234565' },
    { username: 'chef_marco', name: 'Ustad Rasheed (Tandoor Master)', role: 'KITCHEN', pin: '9900', phone: '+923001234566' },
    { username: 'rider_ali', name: 'Ali Rider Express', role: 'DELIVERY', pin: '5566', phone: '+923001234567' },
    { username: 'rider_tariq', name: 'Tariq Speed Rider', role: 'DELIVERY', pin: '6677', phone: '+923009876543' },
  ];

  const userMap = new Map<string, any>();
  for (const staff of staffList) {
    const user = await prisma.user.create({
      data: {
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
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: roleId,
        },
      });
    }
  }
  console.log(`   ✅ Seeded ${userMap.size} staff members across all roles`);

  const cashierUser = userMap.get('cashier_sarah');
  const managerUser = userMap.get('manager_john');

  // ---------------------------------------------------------------------------
  // 5. Seed Dining Zones & Tables (Pakistani Dera & Majlis)
  // ---------------------------------------------------------------------------
  console.log('\n🪑 [6/10] Seeding Desi Dining Zones & Tables...');
  const zonesData = [
    {
      name: 'Desi Baithak & Takht',
      description: 'Traditional carpeted majlis & central family baithak seating',
      order: 1,
      tables: [
        { name: 'T-01', capacity: 4, status: TableStatus.AVAILABLE },
        { name: 'T-02', capacity: 6, status: TableStatus.OCCUPIED },
        { name: 'T-03', capacity: 4, status: TableStatus.RESERVED },
        { name: 'T-04', capacity: 8, status: TableStatus.AVAILABLE },
        { name: 'T-05', capacity: 4, status: TableStatus.BILL_PRINTED },
        { name: 'T-06', capacity: 6, status: TableStatus.CLEANING },
      ],
    },
    {
      name: 'Family AC Dining Hall',
      description: 'Comfortable air-conditioned family hall with private partitions',
      order: 2,
      tables: [
        { name: 'F-01', capacity: 6, status: TableStatus.OCCUPIED },
        { name: 'F-02', capacity: 8, status: TableStatus.AVAILABLE },
        { name: 'F-03', capacity: 10, status: TableStatus.AVAILABLE },
        { name: 'F-04', capacity: 12, status: TableStatus.AVAILABLE },
      ],
    },
    {
      name: 'Rooftop Koyla BBQ Terrace',
      description: 'Open air rooftop terrace with live charcoal aroma and garden view',
      order: 3,
      tables: [
        { name: 'BBQ-01', capacity: 4, status: TableStatus.AVAILABLE },
        { name: 'BBQ-02', capacity: 6, status: TableStatus.AVAILABLE },
        { name: 'BBQ-03', capacity: 4, status: TableStatus.AVAILABLE },
        { name: 'BBQ-04', capacity: 8, status: TableStatus.AVAILABLE },
      ],
    },
    {
      name: 'Royal VIP Dera Lounge',
      description: 'Executive private boardroom & VIP royal sofa setup',
      order: 4,
      tables: [
        { name: 'VIP-01', capacity: 12, status: TableStatus.AVAILABLE },
        { name: 'VIP-02', capacity: 16, status: TableStatus.AVAILABLE },
      ],
    },
  ];

  const tableMap = new Map<string, any>();
  for (const z of zonesData) {
    const zone = await prisma.zone.create({
      data: {
        restaurantId: restaurant.id,
        name: z.name,
        description: z.description,
        sortOrder: z.order,
        isActive: true,
      },
    });

    for (let i = 0; i < z.tables.length; i++) {
      const t = z.tables[i];
      const table = await prisma.restaurantTable.create({
        data: {
          restaurantId: restaurant.id,
          zoneId: zone.id,
          name: t.name,
          capacity: t.capacity,
          sortOrder: i + 1,
          status: t.status,
          isActive: true,
        },
      });
      tableMap.set(t.name, table);
    }
  }
  console.log(`   ✅ Seeded ${zonesData.length} zones and ${tableMap.size} dining tables`);

  // ---------------------------------------------------------------------------
  // 6. Seed Kitchen Stations
  // ---------------------------------------------------------------------------
  console.log('\n🍳 [7/10] Seeding Kitchen Stations (KDS)...');
  const stationsData = [
    { name: 'Koyla BBQ & Sajji Station', code: 'GRILL', displayOrder: 1 },
    { name: 'Shinwari & Karahi Hot Section', code: 'HOT_KITCHEN', displayOrder: 2 },
    { name: 'Tandoor & Fresh Naan Khana', code: 'TANDOOR', displayOrder: 3 },
    { name: 'Degi Biryani & Pulao Station', code: 'BIRYANI', displayOrder: 4 },
    { name: 'Chai, Lassi & Drinks Bar', code: 'BAR', displayOrder: 5 },
    { name: 'Desi Meetha & Dessert Counter', code: 'DESSERT', displayOrder: 6 },
  ];

  const stationMap = new Map<string, any>();
  for (const s of stationsData) {
    const station = await prisma.kitchenStation.create({
      data: {
        restaurantId: restaurant.id,
        name: s.name,
        code: s.code,
        displayOrder: s.displayOrder,
        isActive: true,
      },
    });
    stationMap.set(s.code, station);
  }
  console.log(`   ✅ Seeded ${stationMap.size} kitchen prep stations`);

  // ---------------------------------------------------------------------------
  // 7. Seed Menu Categories & Kitchen Routing
  // ---------------------------------------------------------------------------
  console.log('\n🍲 [8/10] Seeding Pakistani Menu Categories & Items...');
  const categoriesData = [
    { name: 'Koyla BBQ & Charcoal Grills', description: 'Freshly skewered tender chicken, mutton chops, beef bihari & seekh kababs', sortOrder: 1, stationCode: 'GRILL' },
    { name: 'Shinwari & Desi Karahi', description: 'Fresh live karahis prepared in animal fat, pure desi ghee or butter', sortOrder: 2, stationCode: 'HOT_KITCHEN' },
    { name: 'Handi & Royal Curries', description: 'Creamy boneless chicken makhni, mutton handi, and rich daal makhni', sortOrder: 3, stationCode: 'HOT_KITCHEN' },
    { name: 'Degi Biryani & Pulao', description: 'Aromatic long grain basmati rice infused with whole spices and saffron', sortOrder: 4, stationCode: 'BIRYANI' },
    { name: 'Tandoor & Fresh Naan', description: 'Piping hot clay oven sesame roghni naans, cheese naans & khamiri rotis', sortOrder: 5, stationCode: 'TANDOOR' },
    { name: 'Desi Starters & Chaat', description: 'Crispy gol gappay, dahi bhallay, hot chicken wings and piping hot soups', sortOrder: 6, stationCode: 'HOT_KITCHEN' },
    { name: 'Traditional Chai & Cold Drinks', description: 'Karak doodh patti, Kashmiri pink tea, mango lassi, mint margarita & soda', sortOrder: 7, stationCode: 'BAR' },
    { name: 'Desi Meetha (Desserts)', description: 'Warm gulab jamun with rabri, matka kheer, shahi tukray & kulfa falooda', sortOrder: 8, stationCode: 'DESSERT' },
  ];

  const categoryMap = new Map<string, any>();
  for (const c of categoriesData) {
    const cat = await prisma.category.create({
      data: {
        restaurantId: restaurant.id,
        name: c.name,
        description: c.description,
        sortOrder: c.sortOrder,
        isActive: true,
      },
    });
    categoryMap.set(c.name, cat);

    const station = stationMap.get(c.stationCode);
    if (station) {
      await prisma.categoryKitchenStation.create({
        data: {
          stationId: station.id,
          categoryId: cat.id,
        },
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 8. Seed Modifier Groups & Modifiers
  // ---------------------------------------------------------------------------
  const modifierGroupsData = [
    {
      name: 'Spice Level',
      selectionType: ModifierSelectionType.SINGLE,
      minSelections: 1,
      maxSelections: 1,
      sortOrder: 1,
      modifiers: [
        { name: 'Regular Mild', priceAdjustment: 0 },
        { name: 'Desi Teekha (Spicy)', priceAdjustment: 0 },
        { name: 'Koyla Mirch Extra Spicy 🔥', priceAdjustment: 50 },
      ],
    },
    {
      name: 'Cooking Style / Fat',
      selectionType: ModifierSelectionType.SINGLE,
      minSelections: 1,
      maxSelections: 1,
      sortOrder: 2,
      modifiers: [
        { name: 'Standard Cooking Oil', priceAdjustment: 0 },
        { name: 'Pure Desi Ghee Preparation', priceAdjustment: 250 },
        { name: 'Lush Butter Preparation (Makhan)', priceAdjustment: 200 },
      ],
    },
    {
      name: 'Side Chutney & Salads',
      selectionType: ModifierSelectionType.MULTIPLE,
      minSelections: 0,
      maxSelections: 4,
      sortOrder: 3,
      modifiers: [
        { name: 'Fresh Zeera Raita', priceAdjustment: 100 },
        { name: 'Mint Green Chutney', priceAdjustment: 60 },
        { name: 'Fresh Kachumber Salad', priceAdjustment: 120 },
        { name: 'Sweet & Tangy Imli Chutney', priceAdjustment: 80 },
      ],
    },
    {
      name: 'Chai Sweetness',
      selectionType: ModifierSelectionType.SINGLE,
      minSelections: 1,
      maxSelections: 1,
      sortOrder: 4,
      modifiers: [
        { name: 'Regular Sugar', priceAdjustment: 0 },
        { name: 'Desi Gur (Jaggery)', priceAdjustment: 30 },
        { name: 'Sugar Free', priceAdjustment: 0 },
      ],
    },
  ];

  const modGroupMap = new Map<string, any>();
  const modItemMap = new Map<string, any>();

  for (const mg of modifierGroupsData) {
    const modGroup = await prisma.modifierGroup.create({
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
    modGroupMap.set(mg.name, modGroup);

    for (let i = 0; i < mg.modifiers.length; i++) {
      const m = mg.modifiers[i];
      const mod = await prisma.modifier.create({
        data: {
          modifierGroupId: modGroup.id,
          name: m.name,
          priceAdjustment: m.priceAdjustment,
          sortOrder: i + 1,
          isActive: true,
        },
      });
      modItemMap.set(`${mg.name}:${m.name}`, mod);
    }
  }

  // ---------------------------------------------------------------------------
  // 9. Seed Authentic Pakistani Menu Items & Variants (Prices in PKR)
  // ---------------------------------------------------------------------------
  const menuItemsData = [
    // 1. Koyla BBQ & Charcoal Grills
    {
      category: 'Koyla BBQ & Charcoal Grills',
      name: 'Chicken Malai Boti',
      itemCode: 'BBQ-01',
      description: 'Boneless chicken cubes marinated in heavy fresh cream, green chilies, and roasted spices',
      basePrice: 950,
      modifierGroups: ['Spice Level', 'Side Chutney & Salads'],
      variants: [
        { name: 'Regular Skewer (8 Pcs)', price: 950 },
        { name: 'Full Platter (16 Pcs)', price: 1800 },
      ],
    },
    {
      category: 'Koyla BBQ & Charcoal Grills',
      name: 'Beef Bihari Boti',
      itemCode: 'BBQ-02',
      description: 'Melt-in-mouth thinly sliced beef marinated in raw papaya and secret Bihari masala',
      basePrice: 1150,
      modifierGroups: ['Spice Level', 'Side Chutney & Salads'],
    },
    {
      category: 'Koyla BBQ & Charcoal Grills',
      name: 'Mutton Chops BBQ (4 Pcs)',
      itemCode: 'BBQ-03',
      description: 'Succulent mutton chops grilled on live charcoal flames with pomegranate molasses',
      basePrice: 1850,
      modifierGroups: ['Spice Level', 'Side Chutney & Salads'],
    },
    {
      category: 'Koyla BBQ & Charcoal Grills',
      name: 'Chicken Reshmi Kabab (4 Pcs)',
      itemCode: 'BBQ-04',
      description: 'Silky smooth minced chicken seasoned with coriander, butter, and mild herbs',
      basePrice: 850,
      modifierGroups: ['Side Chutney & Salads'],
    },
    {
      category: 'Koyla BBQ & Charcoal Grills',
      name: 'Beef Seekh Kabab Special (4 Pcs)',
      itemCode: 'BBQ-05',
      description: 'Traditional charcoal grilled spiced beef skewers packed with juicy aroma',
      basePrice: 900,
      modifierGroups: ['Spice Level', 'Side Chutney & Salads'],
    },
    {
      category: 'Koyla BBQ & Charcoal Grills',
      name: 'Balochi Chicken Sajji with Rice',
      itemCode: 'BBQ-06',
      description: 'Slow-roasted crispy skin whole chicken served over seasoned fragrant aromatic rice',
      basePrice: 1800,
      variants: [
        { name: 'Full Sajji with Rice', price: 1800 },
        { name: 'Half Sajji with Rice', price: 1000 },
      ],
    },
    {
      category: 'Koyla BBQ & Charcoal Grills',
      name: 'Fish Tikka (Rahu / Surmai)',
      itemCode: 'BBQ-07',
      description: 'Fresh seasonal boneless fish marinated in ajwain, lemon juice, and red chili',
      basePrice: 1500,
      modifierGroups: ['Side Chutney & Salads'],
    },

    // 2. Shinwari & Desi Karahi
    {
      category: 'Shinwari & Desi Karahi',
      name: 'Peshawari Mutton Shinwari Karahi',
      itemCode: 'KRH-01',
      description: 'Signature Shinwari style fresh lamb/mutton cooked with fresh tomatoes, animal fat, salt, and green chilies only',
      basePrice: 3800,
      modifierGroups: ['Cooking Style / Fat', 'Side Chutney & Salads'],
      variants: [
        { name: 'Full (1.0 KG)', price: 3800 },
        { name: 'Half (0.5 KG)', price: 2100 },
      ],
    },
    {
      category: 'Shinwari & Desi Karahi',
      name: 'Chicken Desi Ghee Karahi',
      itemCode: 'KRH-02',
      description: 'Tender chicken braised in pure country desi ghee, black pepper, ginger julienne, and tomatoes',
      basePrice: 2200,
      modifierGroups: ['Spice Level', 'Cooking Style / Fat', 'Side Chutney & Salads'],
      variants: [
        { name: 'Full (1.0 KG)', price: 2200 },
        { name: 'Half (0.5 KG)', price: 1250 },
      ],
    },
    {
      category: 'Shinwari & Desi Karahi',
      name: 'Chicken White Karahi (Creamy)',
      itemCode: 'KRH-03',
      description: 'Rich white gravy karahi made with thick yogurt, dairy cream, crushed white pepper, and green chilies',
      basePrice: 2400,
      variants: [
        { name: 'Full (1.0 KG)', price: 2400 },
        { name: 'Half (0.5 KG)', price: 1350 },
      ],
    },
    {
      category: 'Shinwari & Desi Karahi',
      name: 'Brain Masala Fry (Maghaz)',
      itemCode: 'KRH-04',
      description: 'Tender goat brain sautéed with finely chopped onions, tomatoes, and ground spices in butter',
      basePrice: 1400,
      modifierGroups: ['Spice Level'],
    },

    // 3. Handi & Royal Curries
    {
      category: 'Handi & Royal Curries',
      name: 'Chicken Makhni Handi (Boneless)',
      itemCode: 'HND-01',
      description: 'Succulent boneless chicken simmered in a velvety tomato, butter, and fenugreek gravy in clay pot',
      basePrice: 1650,
      modifierGroups: ['Spice Level', 'Cooking Style / Fat'],
    },
    {
      category: 'Handi & Royal Curries',
      name: 'Mutton Mughlai White Handi',
      itemCode: 'HND-02',
      description: 'Tender mutton cubes slow-cooked with cashew paste, cream, and green cardamom',
      basePrice: 2400,
      modifierGroups: ['Cooking Style / Fat'],
    },
    {
      category: 'Handi & Royal Curries',
      name: 'Paneer Reshmi Handi',
      itemCode: 'HND-03',
      description: 'Fresh cottage cheese cubes cooked in a mild aromatic cashew butter gravy',
      basePrice: 1300,
    },
    {
      category: 'Handi & Royal Curries',
      name: 'Shahi Daal Makhni (Desi Makhan)',
      itemCode: 'HND-04',
      description: 'Black lentils slow cooked overnight over glowing charcoal, finished with pure churned butter and cream',
      basePrice: 750,
    },

    // 4. Degi Biryani & Pulao
    {
      category: 'Degi Biryani & Pulao',
      name: 'Special Mutton Dum Biryani (Matka)',
      itemCode: 'BRY-01',
      description: 'Layers of long-grain aged basmati rice and fall-off-the-bone spiced mutton sealed with dough and slow steamed',
      basePrice: 850,
      modifierGroups: ['Side Chutney & Salads'],
      variants: [
        { name: 'Single Serving', price: 850 },
        { name: 'Double Matka (2-3 Persons)', price: 1550 },
      ],
    },
    {
      category: 'Degi Biryani & Pulao',
      name: 'Chicken Sindhi Biryani',
      itemCode: 'BRY-02',
      description: 'Fragrant spicy chicken biryani with spiced potatoes, dried plums (aaloo bukhara), and saffron',
      basePrice: 550,
      modifierGroups: ['Side Chutney & Salads'],
      variants: [
        { name: 'Single Serving', price: 550 },
        { name: 'Special Double Serving', price: 950 },
      ],
    },
    {
      category: 'Degi Biryani & Pulao',
      name: 'Peshawari Kabuli Pulao (Mutton)',
      itemCode: 'BRY-03',
      description: 'Mildly sweet & savory rice topped with caramelized carrots, raisins, almonds, and large tender mutton shank',
      basePrice: 1250,
    },

    // 5. Tandoor & Fresh Naan
    {
      category: 'Tandoor & Fresh Naan',
      name: 'Special Roghni Naan',
      itemCode: 'NAN-01',
      description: 'Soft tandoori bread brushed with butter, milk wash, and sprinkled with golden sesame seeds (til)',
      basePrice: 120,
    },
    {
      category: 'Tandoor & Fresh Naan',
      name: 'Garlic Butter Naan',
      itemCode: 'NAN-02',
      description: 'Tandoori naan topped with roasted minced garlic, fresh coriander, and melted butter',
      basePrice: 140,
    },
    {
      category: 'Tandoor & Fresh Naan',
      name: 'Stuffed Cheese Naan',
      itemCode: 'NAN-03',
      description: 'Crispy naan stuffed with stretchy mozzarella, cheddar cheese, and fresh green herbs',
      basePrice: 380,
    },
    {
      category: 'Tandoor & Fresh Naan',
      name: 'Kalonji Naan (Black Seed)',
      itemCode: 'NAN-04',
      description: 'Fresh clay oven naan coated with nigella seeds (kalonji) and butter',
      basePrice: 110,
    },
    {
      category: 'Tandoor & Fresh Naan',
      name: 'Khamiri / Tandoori Roti',
      itemCode: 'NAN-05',
      description: 'Whole wheat traditional roti baked inside clay tandoor',
      basePrice: 40,
    },

    // 6. Desi Starters & Chaat
    {
      category: 'Desi Starters & Chaat',
      name: 'Special Dahi Bhallay',
      itemCode: 'STR-01',
      description: 'Soft lentil dumplings soaked in chilled whipped yogurt, chickpeas, potatoes, and sweet-sour tamarind chutney',
      basePrice: 420,
    },
    {
      category: 'Desi Starters & Chaat',
      name: 'Lahori Pani Puri / Gol Gappay (10 Pcs)',
      itemCode: 'STR-02',
      description: 'Crispy semolina hollow spheres filled with spicy chickpeas, chilled mint-tamarind water, and sweet chutney',
      basePrice: 380,
    },
    {
      category: 'Desi Starters & Chaat',
      name: 'Hot & Sour Chicken Corn Soup',
      itemCode: 'STR-03',
      description: 'Thick chicken broth loaded with shredded chicken breast, sweet corn, egg drops, and green chili vinegar',
      basePrice: 450,
    },
    {
      category: 'Desi Starters & Chaat',
      name: 'Crispy Fried Chicken Wings (8 Pcs)',
      itemCode: 'STR-04',
      description: 'Deep fried crispy battered wings tossed with spicy peri-peri seasoning',
      basePrice: 650,
    },

    // 7. Traditional Chai & Cold Drinks
    {
      category: 'Traditional Chai & Cold Drinks',
      name: 'Karak Doodh Patti Chai (Matka)',
      itemCode: 'DRK-01',
      description: 'Rich slow-boiled full-cream buffalo milk tea infused with green cardamom in clay matka',
      basePrice: 180,
      modifierGroups: ['Chai Sweetness'],
    },
    {
      category: 'Traditional Chai & Cold Drinks',
      name: 'Kashmiri Pink Chai (Gulabi Tea)',
      itemCode: 'DRK-02',
      description: 'Authentic royal pink tea brewed with special leaves, milk, crushed pistachios, and almonds',
      basePrice: 250,
      modifierGroups: ['Chai Sweetness'],
    },
    {
      category: 'Traditional Chai & Cold Drinks',
      name: 'Peshawari Qehwa (Cardamom & Mint)',
      itemCode: 'DRK-03',
      description: 'Traditional green tea served hot with lemon slice and pure honey on side',
      basePrice: 120,
    },
    {
      category: 'Traditional Chai & Cold Drinks',
      name: 'Special Mango Lassi (Tall Glass)',
      itemCode: 'DRK-04',
      description: 'Rich churned yogurt blended with ripe Chaunsa mango pulp and fresh cream',
      basePrice: 350,
    },
    {
      category: 'Traditional Chai & Cold Drinks',
      name: 'Sweet / Salted Lassi (Perra Lassi)',
      itemCode: 'DRK-05',
      description: 'Traditional Punjabi churned yogurt drink with a dollop of fresh thick malai',
      basePrice: 280,
    },
    {
      category: 'Traditional Chai & Cold Drinks',
      name: 'Fresh Mint Margarita',
      itemCode: 'DRK-06',
      description: 'Crushed ice, fresh mint leaves, lemon juice, black salt, and sparkling soda',
      basePrice: 320,
    },
    {
      category: 'Traditional Chai & Cold Drinks',
      name: 'Cold Drink Can (Pakola / Coke / Sprite 330ml)',
      itemCode: 'DRK-07',
      description: 'Chilled 330ml can of selected soft drink',
      basePrice: 140,
    },
    {
      category: 'Traditional Chai & Cold Drinks',
      name: 'Mineral Water (Large 1.5L)',
      itemCode: 'DRK-08',
      description: 'Purified drinking water 1.5 Liter bottle',
      basePrice: 150,
    },

    // 8. Desi Meetha (Desserts)
    {
      category: 'Desi Meetha (Desserts)',
      name: 'Gulab Jamun with Warm Rabri (2 Pcs)',
      itemCode: 'MST-01',
      description: 'Hot spongy khoya dumplings immersed in saffron cardamom syrup, served with thick chilled rabri',
      basePrice: 350,
    },
    {
      category: 'Desi Meetha (Desserts)',
      name: 'Matka Kheer Khas (Clay Pot)',
      itemCode: 'MST-02',
      description: 'Slow-cooked fragrant rice pudding garnished with silver warq, sliced almonds, and pistachios',
      basePrice: 320,
    },
    {
      category: 'Desi Meetha (Desserts)',
      name: 'Shahi Tukray (Royal Saffron)',
      itemCode: 'MST-03',
      description: 'Golden fried brioche soaked in condensed saffron milk and clotted cream',
      basePrice: 380,
    },
    {
      category: 'Desi Meetha (Desserts)',
      name: 'Kulfa Falooda with Rabri',
      itemCode: 'MST-04',
      description: 'Traditional pistachio kulfa slice over chilled vermicelli, basil seeds (tukhm-e-balanga), and Rooh Afza syrup',
      basePrice: 480,
    },
  ];

  const menuItemMap = new Map<string, any>();
  for (let itemIdx = 0; itemIdx < menuItemsData.length; itemIdx++) {
    const item = menuItemsData[itemIdx];
    const category = categoryMap.get(item.category);
    if (!category) continue;

    const createdItem = await prisma.menuItem.create({
      data: {
        restaurantId: restaurant.id,
        categoryId: category.id,
        itemCode: item.itemCode,
        name: item.name,
        description: item.description,
        basePrice: item.basePrice,
        sortOrder: itemIdx + 1,
        isActive: true,
        isAvailable: true,
      },
    });
    menuItemMap.set(item.name, createdItem);

    // Link modifier groups
    if (item.modifierGroups) {
      for (const groupName of item.modifierGroups) {
        const modGroup = modGroupMap.get(groupName);
        if (modGroup) {
          await prisma.menuItemModifierGroup.create({
            data: {
              menuItemId: createdItem.id,
              modifierGroupId: modGroup.id,
            },
          });
        }
      }
    }

    // Create portion / price variants
    if (item.variants) {
      for (let vIdx = 0; vIdx < item.variants.length; vIdx++) {
        const v = item.variants[vIdx];
        await prisma.menuItemVariant.create({
          data: {
            menuItemId: createdItem.id,
            name: v.name,
            price: v.price,
            sortOrder: vIdx + 1,
            isActive: true,
          },
        });
      }
    }
  }
  console.log(`   ✅ Seeded ${menuItemMap.size} authentic Pakistani dishes across 8 categories`);

  // ---------------------------------------------------------------------------
  // 10. Seed Stock Location, Suppliers & Raw Inventory Items
  // ---------------------------------------------------------------------------
  console.log('\n📦 [9/10] Seeding Raw Inventory Ingredients & Local Suppliers...');
  const mainLocation = await prisma.stockLocation.create({
    data: {
      restaurantId: restaurant.id,
      name: 'Main Kitchen Store & Cold Storage',
      code: 'MAIN-STORE',
      isDefault: true,
      isActive: true,
    },
  });

  const suppliersData = [
    { name: 'Lahore Meat & Poultry Mart (Tollinton)', contactPerson: 'Haji Aslam Meat Wale', phone: '+92 300 4455661', email: 'aslam.meat@tollinton.pk', address: 'Shop 12-B, Tollinton Market, Jail Road, Lahore' },
    { name: 'Punjab Dairy & Village Milk Farms', contactPerson: 'Chaudhry Riaz Dairy', phone: '+92 321 8899002', email: 'riaz.dairy@punjabfarms.pk', address: 'Raiwind Road Milk Farm, Lahore' },
    { name: 'Al-Rehman Rice Traders & Millers', contactPerson: 'Sheikh Tariq Rice', phone: '+92 333 1122334', email: 'sales@alrehmanrice.pk', address: 'Grain Market, Sheikhupura' },
    { name: 'Metro Cash & Carry Pakistan', contactPerson: 'Commercial Accounts B2B', phone: '+92 42 111 786 922', email: 'b2b.orders@metro.pk', address: 'Model Town Link Road Branch, Lahore' },
  ];

  const supplierMap = new Map<string, any>();
  for (const s of suppliersData) {
    const supp = await prisma.supplier.create({
      data: {
        restaurantId: restaurant.id,
        name: s.name,
        contactPerson: s.contactPerson,
        phone: s.phone,
        email: s.email,
        address: s.address,
        isActive: true,
      },
    });
    supplierMap.set(s.name, supp);
  }

  const rawIngredientsData = [
    { name: 'Super Kernel Basmati Rice (50KG Bag)', itemCode: 'RAW-RICE-50KG', unit: 'BAG', minStockLevel: 5, currentStock: 18, costPerUnit: 16500, supplier: 'Al-Rehman Rice Traders & Millers' },
    { name: 'Fresh Broiler Chicken (Whole/Cut)', itemCode: 'RAW-CHK-KG', unit: 'KG', minStockLevel: 25, currentStock: 85, costPerUnit: 620, supplier: 'Lahore Meat & Poultry Mart (Tollinton)' },
    { name: 'Mutton Shinwari & Karahi Cut', itemCode: 'RAW-MUT-KG', unit: 'KG', minStockLevel: 15, currentStock: 42, costPerUnit: 2200, supplier: 'Lahore Meat & Poultry Mart (Tollinton)' },
    { name: 'Prime Boneless Beef (Bihari/Seekh)', itemCode: 'RAW-BEEF-KG', unit: 'KG', minStockLevel: 10, currentStock: 30, costPerUnit: 1100, supplier: 'Lahore Meat & Poultry Mart (Tollinton)' },
    { name: 'Pure Country Desi Ghee (16KG Tin)', itemCode: 'RAW-GHEE-16KG', unit: 'TIN', minStockLevel: 3, currentStock: 8, costPerUnit: 32000, supplier: 'Punjab Dairy & Village Milk Farms' },
    { name: 'Fresh Buffalo Milk (Full Cream)', itemCode: 'RAW-MILK-LTR', unit: 'LTR', minStockLevel: 30, currentStock: 120, costPerUnit: 210, supplier: 'Punjab Dairy & Village Milk Farms' },
    { name: 'Fine White Flour / Maida (40KG Bag)', itemCode: 'RAW-FLOUR-40KG', unit: 'BAG', minStockLevel: 4, currentStock: 14, costPerUnit: 5200, supplier: 'Metro Cash & Carry Pakistan' },
    { name: 'Koyla / Hardwood BBQ Charcoal (25KG)', itemCode: 'RAW-KOYLA-25KG', unit: 'BAG', minStockLevel: 6, currentStock: 22, costPerUnit: 2600, supplier: 'Metro Cash & Carry Pakistan' },
    { name: 'Fresh Tomatoes & Ginger Garlic', itemCode: 'RAW-VEG-KG', unit: 'KG', minStockLevel: 20, currentStock: 65, costPerUnit: 180, supplier: 'Metro Cash & Carry Pakistan' },
    { name: 'Cooking Oil (Habib/Sufi 16L Tin)', itemCode: 'RAW-OIL-16L', unit: 'TIN', minStockLevel: 5, currentStock: 15, costPerUnit: 8400, supplier: 'Metro Cash & Carry Pakistan' },
  ];

  for (const item of rawIngredientsData) {
    const supp = supplierMap.get(item.supplier);
    await prisma.inventoryItem.create({
      data: {
        restaurantId: restaurant.id,
        supplierId: supp?.id,
        locationId: mainLocation.id,
        itemCode: item.itemCode,
        name: item.name,
        unit: item.unit,
        minStockLevel: item.minStockLevel,
        currentStock: item.currentStock,
        costPerUnit: item.costPerUnit,
        isActive: true,
      },
    });
  }
  console.log(`   ✅ Seeded ${suppliersData.length} suppliers and ${rawIngredientsData.length} raw inventory stock items`);

  // ---------------------------------------------------------------------------
  // 11. Seed Delivery Zones (Lahore Areas with PKR Fees)
  // ---------------------------------------------------------------------------
  console.log('\n🛵 [10/10] Seeding Delivery Zones, Customers, Promotions & Shift...');
  const deliveryZonesData = [
    { name: 'Gulberg (Zones I, II, III & Main Boulevard)', deliveryCharge: 100, estimatedMinutes: 35 },
    { name: 'DHA Lahore (Phases 1 to 6)', deliveryCharge: 250, estimatedMinutes: 50 },
    { name: 'Model Town, Garden Town & Faisal Town', deliveryCharge: 150, estimatedMinutes: 40 },
    { name: 'Lahore Cantt & Cavalry Ground', deliveryCharge: 200, estimatedMinutes: 45 },
    { name: 'Johar Town & Canal Road', deliveryCharge: 250, estimatedMinutes: 55 },
  ];

  for (const dz of deliveryZonesData) {
    await prisma.deliveryZone.create({
      data: {
        restaurantId: restaurant.id,
        name: dz.name,
        deliveryCharge: dz.deliveryCharge,
        estimatedMinutes: dz.estimatedMinutes,
        isActive: true,
      },
    });
  }

  // Seed Customers
  const customersData = [
    { name: 'Chaudhry Usman Tariq', phone: '+923008451234', address: 'House 42, Block H, Gulberg II, Lahore', notes: 'VIP Guest, prefers Desi Ghee preparation and less spicy' },
    { name: 'Dr. Fatima Noor', phone: '+923214567890', address: 'Bungalow 18, Sector B, Phase 5 DHA, Lahore', notes: 'Regular family dining patron' },
    { name: 'Malik Zeeshan Ahmed', phone: '+923334219876', address: 'Flat 304, Mall View Heights, Model Town, Lahore', notes: 'Frequent takeaway customer' },
    { name: 'Advocate Salman Qureshi', phone: '+923009988776', address: 'House 112, Saint Johns Park, Cantt, Lahore', notes: 'Prefers Rooftop Koyla BBQ seating' },
  ];

  for (const c of customersData) {
    await prisma.customer.create({
      data: {
        restaurantId: restaurant.id,
        name: c.name,
        phone: c.phone,
        notes: c.notes,
        addresses: {
          create: {
            address: c.address,
            isDefault: true,
          },
        },
      },
    });
  }

  // Seed Promotions (PKR discounts)
  await prisma.promotion.create({
    data: {
      restaurantId: restaurant.id,
      code: 'JASHAN15',
      name: 'Jashan-e-Baharan 15% Off',
      description: '15% instant discount on orders above Rs. 3,000',
      type: PromotionType.PERCENTAGE,
      discountValue: 15,
      minOrderAmount: 3000,
      maxDiscountAmount: 1000,
      targetType: PromotionTargetType.ORDER,
      startDate: new Date(Date.now() - 86400000 * 7),
      endDate: new Date(Date.now() + 86400000 * 30),
      isActive: true,
    },
  });

  await prisma.promotion.create({
    data: {
      restaurantId: restaurant.id,
      code: 'BBQFEAST',
      name: 'Weekend Royal BBQ Feast',
      description: 'Flat Rs. 500 off on BBQ platters above Rs. 4,000',
      type: PromotionType.FIXED_AMOUNT,
      discountValue: 500,
      minOrderAmount: 4000,
      targetType: PromotionTargetType.ORDER,
      startDate: new Date(Date.now() - 86400000 * 5),
      endDate: new Date(Date.now() + 86400000 * 20),
      isActive: true,
    },
  });

  // Seed Expense Categories & Initial Petty Cash Records
  const expenseCatData = [
    { name: 'Daily Sabzi & Mandi Vegetables', description: 'Fresh vegetables, ginger, garlic, tomatoes and mint from market' },
    { name: 'LPG Commercial Cylinders', description: 'Gas cylinder refills for kitchen stoves' },
    { name: 'BBQ Koyla & Charcoal Sacks', description: 'Hardwood koyla for live barbecue grills' },
    { name: 'Generator Diesel & Fuel', description: 'Load shedding backup generator maintenance and diesel fuel' },
    { name: 'Staff Welfare & Evening Tea', description: 'Daily tea, milk, and snacks for restaurant crew' },
  ];

  for (let ecIdx = 0; ecIdx < expenseCatData.length; ecIdx++) {
    const ec = expenseCatData[ecIdx];
    const cat = await prisma.expenseCategory.create({
      data: {
        restaurantId: restaurant.id,
        name: ec.name,
        description: ec.description,
        isActive: true,
      },
    });

    if (ec.name.includes('Sabzi')) {
      await prisma.expense.create({
        data: {
          restaurantId: restaurant.id,
          categoryId: cat.id,
          expenseNumber: 'EXP-2026-001',
          createdById: managerUser.id,
          businessDate: todayStr,
          amount: 4500,
          paymentMethod: 'CASH',
          description: 'Morning vegetable procurement from Badami Bagh Sabzi Mandi',
          status: ExpenseStatus.RECORDED,
        },
      });
    }
  }

  // Seed Default Register Shift
  await prisma.cashierShift.create({
    data: {
      restaurantId: restaurant.id,
      cashierId: cashierUser.id,
      registerName: 'Main Cashier Terminal (TER-01)',
      businessDate: todayStr,
      status: ShiftStatus.OPEN,
      openingCash: 15000.0,
      notes: 'Initial morning register shift with Rs. 15,000 float',
      openedAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
    },
  });

  // Seed Sample Table Orders for realistic initial UI state
  const occupiedTable = tableMap.get('T-02');
  const chickenKarahi = menuItemMap.get('Chicken Desi Ghee Karahi');
  const malaiBoti = menuItemMap.get('Chicken Malai Boti');
  const roghniNaan = menuItemMap.get('Special Roghni Naan');

  if (occupiedTable && chickenKarahi && malaiBoti && roghniNaan) {
    const sampleOrder = await prisma.order.create({
      data: {
        restaurantId: restaurant.id,
        tableId: occupiedTable.id,
        orderCode: 'ORD-LHR-001',
        businessDate: todayStr,
        orderType: OrderType.DINE_IN,
        status: OrderStatus.PREPARING,
        paymentStatus: OrderPaymentStatus.UNPAID,
        guestCount: 4,
        subtotal: 3510,
        taxAmount: 561.6,
        grandTotal: 4071.6,
        notes: 'Table 2 VIP family - Desi ghee karahi teekha',
        createdById: cashierUser.id,
        createdAt: new Date(Date.now() - 1000 * 60 * 20),
      },
    });

    await prisma.orderItem.create({
      data: {
        orderId: sampleOrder.id,
        menuItemId: chickenKarahi.id,
        itemName: chickenKarahi.name,
        quantity: 1,
        unitPrice: 2200,
        itemGrossTotal: 2200,
        itemNetTotal: 2200,
        status: OrderItemStatus.ACTIVE,
        kitchenStatus: ItemKitchenStatus.PREPARING,
        specialInstructions: 'Make it Desi Ghee with ginger slices',
      },
    });

    await prisma.orderItem.create({
      data: {
        orderId: sampleOrder.id,
        menuItemId: malaiBoti.id,
        itemName: malaiBoti.name,
        quantity: 1,
        unitPrice: 950,
        itemGrossTotal: 950,
        itemNetTotal: 950,
        status: OrderItemStatus.ACTIVE,
        kitchenStatus: ItemKitchenStatus.PREPARING,
      },
    });

    await prisma.orderItem.create({
      data: {
        orderId: sampleOrder.id,
        menuItemId: roghniNaan.id,
        itemName: roghniNaan.name,
        quantity: 3,
        unitPrice: 120,
        itemGrossTotal: 360,
        itemNetTotal: 360,
        status: OrderItemStatus.ACTIVE,
        kitchenStatus: ItemKitchenStatus.PREPARING,
      },
    });
  }

  console.log('\n=============================================================');
  console.log('🎉 PAKISTANI RESTAURANT SEED COMPLETE!');
  console.log('🏪 Restaurant: Faraz Shinwari & Desi Dera (Lahore, Pakistan)');
  console.log('💵 Currency: PKR (Pakistani Rupee Rs.) | Tax: 16% PRA');
  console.log('🍛 Menu: 35+ Authentic Shinwari, BBQ, Handi, Biryani, Naan & Chai items');
  console.log('👤 Logins (Quick PINs):');
  console.log('   - Owner:   owner_admin   (PIN: 1234)');
  console.log('   - Manager: manager_john  (PIN: 2233)');
  console.log('   - Cashier: cashier_sarah (PIN: 4321)');
  console.log('   - Waiter:  waiter_alex   (PIN: 1122)');
  console.log('   - Chef:    chef_gordon   (PIN: 7788)');
  console.log('   - Rider:   rider_ali     (PIN: 5566)');
  console.log('=============================================================\n');
}

main()
  .catch((e) => {
    console.error('❌ Database seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
