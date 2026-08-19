import { securitySchemes } from './components/security.js';
import { standardResponses } from './components/responses.js';
import { componentSchemas } from './components/schemas.js';
import { healthPaths } from './paths/health.docs.js';
import { authPaths } from './paths/auth.docs.js';
import { restaurantPaths } from './paths/restaurant.docs.js';
import { staffPaths } from './paths/staff.docs.js';
import { menuPaths } from './paths/menu.docs.js';
import { tablesPaths } from './paths/tables.docs.js';
import { takeawayPaths } from './paths/takeaway.docs.js';
import { deliveryPaths } from './paths/delivery.docs.js';
import { ordersPaths } from './paths/orders.docs.js';
import { paymentsPaths } from './paths/payments.docs.js';
import { shiftsPaths } from './paths/shifts.docs.js';
import { kitchenPaths } from './paths/kitchen.docs.js';
import { receiptsPaths } from './paths/receipts.docs.js';
import { reportsPaths } from './paths/reports.docs.js';
import { inventoryPaths } from './paths/inventory.docs.js';
import { promotionsPaths } from './paths/promotions.docs.js';
import { loyaltyPaths } from './paths/loyalty.docs.js';
import { reservationsPaths } from './paths/reservations.docs.js';
import { purchasingPaths } from './paths/purchasing.docs.js';

export const openApiSpecification = {
  openapi: '3.0.3',
  info: {
    title: 'Faraz POS Backend API',
    version: '0.1.0',
    description: `
## Faraz Commercial Restaurant Point of Sale & Management System

Welcome to the Faraz POS REST API documentation.

### Core Architectural Principles
- **Multi-Tenant Isolation**: Every operational query and mutation is strictly scoped to the authenticated tenant \`restaurantId\`.
- **RBAC & Granular Permissions**: Standardized permission-based authorization with Manager PIN override for sensitive financial adjustments and voids.
- **Unified Order Foundation**: Core unified order engine backing **Dine-In**, **Takeaway**, and **Delivery**.
- **Exact Financial Precision**: All persisted and computed money fields utilize high-precision decimal calculations.
- **Audit Logging**: Automatic audit trail generation on critical operational actions.
- **Real-Time WebSocket Synchronization**: Real-time event broadcasting powered by Socket.IO.
`,
    contact: {
      name: 'Faraz POS Engineering Team',
      email: 'support@farazpos.com',
    },
  },
  servers: [
    {
      url: '/',
      description: 'Current Environment Server',
    },
  ],
  tags: [
    { name: 'Health', description: 'System health, liveness probes, and diagnostics' },
    {
      name: 'Authentication',
      description: 'Staff PIN authentication, JWT session management, and logout',
    },
    {
      name: 'Restaurant Configuration',
      description: 'Restaurant profile, business details, tax, and order type settings',
    },
    {
      name: 'Staff Management',
      description: 'Employee profiles, role assignments, status management, and PIN changes',
    },
    {
      name: 'Menu & Catalog Management',
      description: 'Menu categories, products, variants, modifier groups, and choices',
    },
    {
      name: 'Tables & Floor Management',
      description: 'Dining floors, seating zones, physical tables, layout, and occupancy state',
    },
    {
      name: 'Takeaway Management',
      description: 'Takeaway orders, daily token sequence, pickup queue, and customer handling',
    },
    {
      name: 'Customer & Delivery Management',
      description:
        'Customer profiles, delivery addresses, delivery zones, delivery lifecycle, and rider cash settlements',
    },
    {
      name: 'Core Orders & Billing',
      description:
        'Unified multi-channel order engine, daily order codes, item discounts, bill computations, voids, and cancellations',
    },
    {
      name: 'Payments & Cash Management',
      description:
        'Multi-tender payments, partial settlements, refunds, and cashier register shifts',
    },
    {
      name: 'Kitchen Operations & KDS',
      description:
        'Kitchen display orders, preparation queue, station routing, item bumping, and ticket recalls',
    },
    {
      name: 'Kitchen Operations & KDS - Stations',
      description: 'Kitchen preparation stations and category routing configurations',
    },
    {
      name: 'Receipt & Printing Management',
      description:
        'Customer receipts, KOT kitchen tickets, formatted thermal ASCII slips, and reprints',
    },
    {
      name: 'Reporting & Analytics',
      description:
        'Executive sales summaries, channel breakdowns, payment distributions, product rankings, and operational reports',
    },
    {
      name: 'Inventory & Stock Management',
      description:
        'Raw ingredients, suppliers, storage locations, purchase receiving, stock adjustments, wastage, transfers, recipes, and movement ledger',
    },
    {
      name: 'Discounts & Promotions',
      description:
        'Promotional discount campaigns, item/category rules, BXGY (BOGO), promo codes, scheduling, and pre-checkout preview',
    },
    {
      name: 'Loyalty & Customer Rewards',
      description:
        'Customer rewards club, points earning on paid orders, checkout redemption, tiers, manual adjustments, and audit ledger',
    },
    {
      name: 'Reservations & Table Bookings',
      description:
        'Table reservations, time-window availability evaluation, table assignments, and seated table occupancy management',
    },
    {
      name: 'Purchasing & Supplier Management',
      description:
        'Vendor/supplier profiles, purchase orders, partial/full receiving, price history, supplier returns, and purchasing analytics',
    },
  ],
  paths: {
    ...healthPaths,
    ...authPaths,
    ...restaurantPaths,
    ...staffPaths,
    ...menuPaths,
    ...tablesPaths,
    ...takeawayPaths,
    ...deliveryPaths,
    ...ordersPaths,
    ...paymentsPaths,
    ...shiftsPaths,
    ...kitchenPaths,
    ...receiptsPaths,
    ...reportsPaths,
    ...inventoryPaths,
    ...promotionsPaths,
    ...loyaltyPaths,
    ...reservationsPaths,
    ...purchasingPaths,
  },
  components: {
    securitySchemes,
    responses: standardResponses,
    schemas: componentSchemas,
  },
};
