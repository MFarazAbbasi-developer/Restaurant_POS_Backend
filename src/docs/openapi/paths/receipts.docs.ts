export const receiptsPaths = {
  '/api/v1/receipts/preview': {
    get: {
      tags: ['Receipt & Printing Management'],
      summary: 'Generate sample receipt preview',
      security: [{ bearerAuth: [] }],
      description:
        'Generates a mock receipt using current restaurant branding, tax settings, and service charge rates. Supports `80mm` and `58mm` paper width formatting and different order types (`DINE_IN`, `TAKEAWAY`, `DELIVERY`).',
      parameters: [
        {
          in: 'query',
          name: 'paperWidth',
          schema: { type: 'string', enum: ['80mm', '58mm'], default: '80mm' },
        },
        {
          in: 'query',
          name: 'sampleType',
          schema: { type: 'string', enum: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'], default: 'DINE_IN' },
        },
      ],
      responses: {
        '200': {
          description: 'Sample receipt with structured data and pre-rendered ASCII thermal slip',
        },
      },
    },
  },
  '/api/v1/receipts/orders/{orderId}/customer': {
    get: {
      tags: ['Receipt & Printing Management'],
      summary: 'Generate customer receipt / bill slip',
      security: [{ bearerAuth: [] }],
      description:
        'Generates printer-ready customer receipt data for a specific order. Includes restaurant identity, order metadata, line items with portion variants and modifiers, item & order discounts, tax, service charge, delivery/packaging fees, payment breakdown, and formatted ASCII thermal text slip.',
      parameters: [
        { in: 'path', name: 'orderId', required: true, schema: { type: 'string', format: 'uuid' } },
        {
          in: 'query',
          name: 'paperWidth',
          schema: { type: 'string', enum: ['80mm', '58mm'], default: '80mm' },
        },
        { in: 'query', name: 'includeTaxDetails', schema: { type: 'boolean', default: true } },
      ],
      responses: {
        '200': { description: 'Structured customer receipt and formatted thermal printer slip' },
        '404': { $ref: '#/components/responses/NotFoundError' },
      },
    },
  },
  '/api/v1/receipts/orders/{orderId}/kitchen': {
    get: {
      tags: ['Receipt & Printing Management'],
      summary: 'Generate Kitchen Order Ticket (KOT)',
      security: [{ bearerAuth: [] }],
      description:
        'Generates printer-ready kitchen prep slip / KOT. Highlights order code, token number, table number, server name, line items, portions, modifier choices, and special instructions. Supports optional `stationId` to filter items routed to a specific kitchen prep station.',
      parameters: [
        { in: 'path', name: 'orderId', required: true, schema: { type: 'string', format: 'uuid' } },
        { in: 'query', name: 'stationId', schema: { type: 'string', format: 'uuid' } },
        {
          in: 'query',
          name: 'paperWidth',
          schema: { type: 'string', enum: ['80mm', '58mm'], default: '80mm' },
        },
      ],
      responses: {
        '200': { description: 'Kitchen Order Ticket (KOT) structured data and ASCII thermal slip' },
        '404': { $ref: '#/components/responses/NotFoundError' },
      },
    },
  },
  '/api/v1/receipts/orders/{orderId}/reprint': {
    post: {
      tags: ['Receipt & Printing Management'],
      summary: 'Reprint duplicate customer receipt',
      security: [{ bearerAuth: [] }],
      description:
        'Generates a duplicate receipt marked with `isReprint: true`, `reprintCount`, and the reprint reason. Transactionally logs an audit trail record for compliance.',
      parameters: [
        { in: 'path', name: 'orderId', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['reason'],
              properties: {
                reason: {
                  type: 'string',
                  minLength: 3,
                  example: 'Customer requested copy of bill',
                },
                paperWidth: { type: 'string', enum: ['80mm', '58mm'], default: '80mm' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Duplicate customer receipt with reprint metadata and audit log' },
        '400': { $ref: '#/components/responses/BadRequestError' },
        '404': { $ref: '#/components/responses/NotFoundError' },
      },
    },
  },
};
