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
      description: 'Staff accounts, roles, PIN management, and status controls',
    },
    { name: 'Menu Management - Categories', description: 'Menu category hierarchy and sorting' },
    {
      name: 'Menu Management - Items',
      description: 'Menu items, pricing, 86 availability, and catalog management',
    },
    {
      name: 'Menu Management - Variants',
      description: 'Item portion sizes, variations, and pricing',
    },
    {
      name: 'Menu Management - Modifiers',
      description: 'Modifier groups, choices, and price adjustments',
    },
    { name: 'Menu Management', description: 'Complete POS nested catalog retrieval' },
    {
      name: 'Tables & Zones - Seating Zones',
      description: 'Restaurant seating zones and floor management',
    },
    {
      name: 'Tables & Zones - Tables',
      description: 'Physical tables, capacities, and real-time floor plan statuses',
    },
    {
      name: 'Tables & Zones - Operations',
      description: 'Table transfers, table merging, splitting, and sub-orders',
    },
    {
      name: 'Takeaway Management',
      description: 'Takeaway orders, sequential daily tokens, and queue tracking',
    },
    {
      name: 'Delivery & Customers - Customers',
      description: 'Customer profiles, phone lookup, and address book',
    },
    {
      name: 'Delivery & Customers - Delivery Orders',
      description: 'Phone-in delivery orders, zone fees, and status tracking',
    },
    {
      name: 'Delivery & Customers - Riders',
      description: 'Delivery rider fleet management and status',
    },
    {
      name: 'Delivery & Customers - Delivery Zones',
      description: 'Delivery coverage zones, fees, and distance thresholds',
    },
    {
      name: 'Core Orders & Billing',
      description:
        'Unified order engine, line item additions, voids, discounts, and daily summaries',
    },
    {
      name: 'Payments & Cash Management - Payments',
      description: 'Payment processing (Cash, Card, Wallets), exact change, and refunds',
    },
    {
      name: 'Payments & Cash Management - Cash Drawer & Shifts',
      description: 'Cash register shifts, cash drops, adjustments, and shift settlement reporting',
    },
    {
      name: 'Kitchen Operations & KDS - Queue',
      description: 'Active kitchen order queue, urgency metrics, and performance analytics',
    },
    {
      name: 'Kitchen Operations & KDS - Bump Bar',
      description: 'Order and item preparation state advancement and ticket recall',
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
  },
  components: {
    securitySchemes,
    responses: standardResponses,
    schemas: componentSchemas,
  },
};
