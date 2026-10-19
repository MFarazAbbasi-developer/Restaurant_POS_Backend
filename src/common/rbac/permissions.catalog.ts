/**
 * Global RBAC permission catalog and default role → permission maps.
 * Shared by the production-safe system seed and the destructive demo seed.
 */

export const DEFAULT_PERMISSIONS: ReadonlyArray<{ key: string; description: string }> = [
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
  {
    key: 'purchasing.view',
    description:
      'View purchase orders, supplier profiles, receiving history, and purchase reports',
  },
  {
    key: 'purchasing.manage',
    description: 'Create and modify purchase orders and supplier catalog terms',
  },
  {
    key: 'purchasing.receive',
    description: 'Receive goods, log deliveries, and process supplier returns',
  },
  { key: 'suppliers.manage', description: 'Create, edit, and deactivate supplier profiles' },

  // Expenses & Expense Management
  {
    key: 'expenses.view',
    description: 'View operating expenses, categories, and expense analytics',
  },
  {
    key: 'expenses.create',
    description: 'Record new operational expenses and petty cash disbursements',
  },
  {
    key: 'expenses.manage',
    description: 'Create, edit, and organize expense categories and edit expense records',
  },
  {
    key: 'expenses.void',
    description: 'Void or reverse expense records with manager authorization',
  },

  // Reports
  { key: 'reports.view', description: 'View sales and business reports' },
  { key: 'reports.export', description: 'Export reports to CSV/PDF' },

  // Tables & Floors
  { key: 'tables.view', description: 'View dining floors, zones, and table status' },
  { key: 'tables.manage', description: 'Create, edit, and organize tables and seating zones' },

  // Delivery Management
  { key: 'delivery.view', description: 'View delivery orders, queue, and dispatch details' },
  {
    key: 'delivery.create',
    description: 'Create phone-in, manual WhatsApp, and delivery orders',
  },
  { key: 'delivery.update', description: 'Update delivery lifecycle status' },
  { key: 'delivery.dispatch', description: 'Assign riders and dispatch delivery orders' },
  {
    key: 'delivery.rider_settlement',
    description: 'Reconcile rider cash and close settlements',
  },
  { key: 'delivery.cancel', description: 'Cancel active delivery orders' },
  {
    key: 'delivery.manage_zones',
    description: 'Create and configure delivery zones and fees',
  },

  // Customers
  {
    key: 'customer.view',
    description: 'Search and view customer phone records and addresses',
  },
  {
    key: 'customer.manage',
    description: 'Create and edit customer records and saved addresses',
  },

  // Kitchen Display & Operations
  {
    key: 'kitchen.view',
    description: 'View kitchen active orders, prep queue, and station tickets',
  },
  {
    key: 'kitchen.update',
    description:
      'Update kitchen order and item prep status, bump tickets, and recall orders',
  },
  {
    key: 'kitchen.manage',
    description: 'Create, update, and organize kitchen stations and category routing',
  },

  // Receipts & Printing
  {
    key: 'receipts.view',
    description: 'View and generate customer receipts, bill estimates, and KOT slips',
  },
  {
    key: 'receipts.reprint',
    description: 'Authorize reprinting duplicate receipts and bills',
  },
  {
    key: 'receipts.manage',
    description: 'Configure receipt layouts, header/footer text, and printer settings',
  },

  // Discounts & Promotions
  {
    key: 'promotions.view',
    description: 'View promotional campaigns, discount rules, and usage history',
  },
  {
    key: 'promotions.manage',
    description: 'Create, update, and manage promotional campaigns and discount rules',
  },
  {
    key: 'promotions.apply',
    description: 'Apply promotional discount codes and promo overrides to orders',
  },

  // Loyalty & Customer Rewards
  {
    key: 'loyalty.view',
    description: 'View customer reward balances, program tiers, and ledger history',
  },
  {
    key: 'loyalty.manage',
    description: 'Configure reward conversion rules, expiration policies, and promotions',
  },
  {
    key: 'loyalty.adjust',
    description: 'Authorize manual balance adjustments and grant bonus loyalty points',
  },
  {
    key: 'loyalty.redeem',
    description: 'Apply loyalty points as redemption discounts at POS checkout',
  },

  // Table Reservations
  {
    key: 'reservations.view',
    description: 'View floor bookings calendar, timeline, and customer contact info',
  },
  {
    key: 'reservations.manage',
    description: 'Create, modify, reassign, and reschedule reservations',
  },
  {
    key: 'reservations.status',
    description: 'Confirm, seat, mark no-show, or cancel reservations',
  },

  // System Administration & Settings
  { key: 'users.view', description: 'View staff user list' },
  {
    key: 'users.manage',
    description: 'Create, edit, and deactivate staff user profiles and assign roles',
  },
  { key: 'settings.view', description: 'View store settings and tax configuration' },
  {
    key: 'settings.manage',
    description: 'Update store profile, business rules, and taxes',
  },
  { key: 'audit.view', description: 'View system audit logs and shift histories' },
];

export const ALL_PERMISSION_KEYS = DEFAULT_PERMISSIONS.map((p) => p.key);

export const ROLE_PERMISSIONS_MAP: Record<
  string,
  { description: string; permissions: string[] }
> = {
  OWNER: {
    description: 'Full administrative and financial access to the entire restaurant POS system',
    permissions: [...ALL_PERMISSION_KEYS],
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
      'kitchen.view',
      'kitchen.update',
      'kitchen.manage',
      'receipts.view',
      'receipts.reprint',
      'receipts.manage',
      'menu.view',
      'menu.manage',
      'menu.price_update',
      'inventory.view',
      'inventory.manage',
      'inventory.adjust',
      'inventory.receive',
      'inventory.transfer',
      'inventory.waste',
      'purchasing.view',
      'purchasing.manage',
      'purchasing.receive',
      'suppliers.manage',
      'expenses.view',
      'expenses.create',
      'expenses.manage',
      'expenses.void',
      'promotions.view',
      'promotions.manage',
      'promotions.apply',
      'loyalty.view',
      'loyalty.manage',
      'loyalty.adjust',
      'loyalty.redeem',
      'reservations.view',
      'reservations.manage',
      'reservations.status',
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
      'expenses.view',
      'expenses.create',
      'kitchen.view',
      'kitchen.update',
      'receipts.view',
      'receipts.reprint',
      'menu.view',
      'inventory.view',
      'promotions.view',
      'promotions.apply',
      'loyalty.view',
      'loyalty.redeem',
      'reservations.view',
      'reservations.manage',
      'reservations.status',
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
    permissions: [
      'orders.view',
      'orders.create',
      'orders.update',
      'kitchen.view',
      'receipts.view',
      'menu.view',
      'tables.view',
    ],
  },
  KITCHEN: {
    description: 'Kitchen display / prep staff tracking and updating food orders',
    permissions: [
      'orders.view',
      'orders.update',
      'kitchen.view',
      'kitchen.update',
      'receipts.view',
      'menu.view',
      'inventory.view',
    ],
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
