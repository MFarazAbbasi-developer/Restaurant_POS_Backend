export const reportsPaths = {
  '/api/v1/reports/sales-summary': {
    get: {
      tags: ['Reporting & Analytics'],
      summary: 'Executive Sales Summary',
      security: [{ bearerAuth: [] }],
      description:
        'Calculates Gross Sales, Item & Order Discounts, Net Sales, Taxes Collected, Service Charges, Delivery/Packaging Fees, Rounding, Grand Total, Total Paid vs Outstanding, Average Order Value (AOV), and Order Status Distributions.',
      parameters: [
        {
          in: 'query',
          name: 'startDate',
          schema: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        },
        {
          in: 'query',
          name: 'endDate',
          schema: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        },
        { in: 'query', name: 'from', schema: { type: 'string', format: 'date-time' } },
        { in: 'query', name: 'to', schema: { type: 'string', format: 'date-time' } },
      ],
      responses: {
        '200': { description: 'Executive sales and orders performance summary' },
      },
    },
  },
  '/api/v1/reports/by-order-type': {
    get: {
      tags: ['Reporting & Analytics'],
      summary: 'Sales by Order Type (Channel Breakdown)',
      security: [{ bearerAuth: [] }],
      description:
        'Breakdown of sales, discounts, net revenue, taxes, and average ticket sizes across `DINE_IN`, `TAKEAWAY`, and `DELIVERY`.',
      parameters: [
        {
          in: 'query',
          name: 'orderType',
          schema: { type: 'string', enum: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'] },
        },
        {
          in: 'query',
          name: 'startDate',
          schema: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        },
        {
          in: 'query',
          name: 'endDate',
          schema: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        },
      ],
      responses: {
        '200': { description: 'Sales and volume breakdown by channel' },
      },
    },
  },
  '/api/v1/reports/by-payment-method': {
    get: {
      tags: ['Reporting & Analytics'],
      summary: 'Sales by Payment Method',
      security: [{ bearerAuth: [] }],
      description:
        'Aggregates collected payments, refunds, net collections, and revenue share percentage across payment methods (`CASH`, `CARD`, `BANK_TRANSFER`, `DIGITAL_WALLET`, `OTHER`).',
      parameters: [
        {
          in: 'query',
          name: 'paymentMethod',
          schema: {
            type: 'string',
            enum: ['CASH', 'CARD', 'BANK_TRANSFER', 'DIGITAL_WALLET', 'OTHER'],
          },
        },
        {
          in: 'query',
          name: 'startDate',
          schema: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        },
        {
          in: 'query',
          name: 'endDate',
          schema: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        },
      ],
      responses: {
        '200': { description: 'Payment method collection breakdown' },
      },
    },
  },
  '/api/v1/reports/items-ranking': {
    get: {
      tags: ['Reporting & Analytics'],
      summary: 'Product / Item Sales Ranking',
      security: [{ bearerAuth: [] }],
      description:
        'Top-selling and lowest-selling menu items by quantity sold and net revenue. Supports sorting by `quantity` or `revenue`, category filtering, and pagination.',
      parameters: [
        { in: 'query', name: 'categoryId', schema: { type: 'string', format: 'uuid' } },
        {
          in: 'query',
          name: 'sortBy',
          schema: { type: 'string', enum: ['quantity', 'revenue'], default: 'revenue' },
        },
        {
          in: 'query',
          name: 'sortOrder',
          schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
        },
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
        { in: 'query', name: 'startDate', schema: { type: 'string' } },
        { in: 'query', name: 'endDate', schema: { type: 'string' } },
      ],
      responses: {
        '200': { description: 'Paginated item sales ranking and revenue contributions' },
      },
    },
  },
  '/api/v1/reports/by-category': {
    get: {
      tags: ['Reporting & Analytics'],
      summary: 'Category Sales Summary',
      security: [{ bearerAuth: [] }],
      description: 'Aggregates sales, item volume, and revenue contributions per menu category.',
      parameters: [
        { in: 'query', name: 'startDate', schema: { type: 'string' } },
        { in: 'query', name: 'endDate', schema: { type: 'string' } },
      ],
      responses: {
        '200': { description: 'Category sales and volume breakdown' },
      },
    },
  },
  '/api/v1/reports/financial-adjustments': {
    get: {
      tags: ['Reporting & Analytics'],
      summary: 'Taxes, Discounts, Voids & Cancellations Audit',
      security: [{ bearerAuth: [] }],
      description:
        'Comprehensive financial audit report detailing tax collections, discount distributions by reason, voided items & orders value, and cancellation statistics.',
      parameters: [
        { in: 'query', name: 'startDate', schema: { type: 'string' } },
        { in: 'query', name: 'endDate', schema: { type: 'string' } },
      ],
      responses: {
        '200': { description: 'Taxes, discounts, voids, and cancellations audit report' },
      },
    },
  },
  '/api/v1/reports/hourly-trends': {
    get: {
      tags: ['Reporting & Analytics'],
      summary: 'Hourly Sales & Traffic Trends',
      security: [{ bearerAuth: [] }],
      description:
        '24-hour distribution of orders placed, gross and net sales, highlighting peak traffic hours.',
      parameters: [
        { in: 'query', name: 'startDate', schema: { type: 'string' } },
        { in: 'query', name: 'endDate', schema: { type: 'string' } },
      ],
      responses: {
        '200': { description: '24-hour traffic and sales distribution with peak hour analysis' },
      },
    },
  },
  '/api/v1/reports/staff-performance': {
    get: {
      tags: ['Reporting & Analytics'],
      summary: 'Staff & Cashier Performance',
      security: [{ bearerAuth: [] }],
      description:
        'Performance metrics per staff member: shifts worked, orders processed, gross revenue collected, and discounts applied.',
      parameters: [
        { in: 'query', name: 'startDate', schema: { type: 'string' } },
        { in: 'query', name: 'endDate', schema: { type: 'string' } },
      ],
      responses: {
        '200': { description: 'Staff performance and shift activity breakdown' },
      },
    },
  },
  '/api/v1/reports/shifts-summary': {
    get: {
      tags: ['Reporting & Analytics'],
      summary: 'Shift Settlement Summary',
      security: [{ bearerAuth: [] }],
      description:
        'Aggregates cashier shift settlements: opening cash float, drawer cash sales, cash drops, adjustments, expected vs actual cash, and cash variance.',
      parameters: [
        { in: 'query', name: 'startDate', schema: { type: 'string' } },
        { in: 'query', name: 'endDate', schema: { type: 'string' } },
      ],
      responses: {
        '200': { description: 'Cash register shift summaries and cash variance metrics' },
      },
    },
  },
  '/api/v1/reports/operations-performance': {
    get: {
      tags: ['Reporting & Analytics'],
      summary: 'Delivery & Takeaway Operations Performance',
      security: [{ bearerAuth: [] }],
      description:
        'Operational analytics for takeaway tokens and delivery orders, assigned rider delivery volumes, completed vs cancelled deliveries, and delivery charges.',
      parameters: [
        { in: 'query', name: 'startDate', schema: { type: 'string' } },
        { in: 'query', name: 'endDate', schema: { type: 'string' } },
      ],
      responses: {
        '200': { description: 'Delivery and takeaway operational performance metrics' },
      },
    },
  },
};
