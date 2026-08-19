export const takeawayPaths = {
  '/api/v1/takeaway/orders': {
    post: {
      tags: ['Takeaway Management'],
      summary: 'Create takeaway order',
      security: [{ bearerAuth: [] }],
      description:
        'Creates a takeaway order with auto-generated sequential daily token numbering (`TK-001`), packaging charge calculation, and price snapshots.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['items'],
              properties: {
                customerName: { type: 'string', example: 'Hamza' },
                customerPhone: { type: 'string', example: '+92 300 1234567' },
                notes: { type: 'string' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['menuItemId', 'quantity'],
                    properties: {
                      menuItemId: { type: 'string', format: 'uuid' },
                      variantId: { type: 'string', format: 'uuid' },
                      quantity: { type: 'integer', example: 1 },
                      notes: { type: 'string' },
                      modifiers: {
                        type: 'array',
                        items: {
                          type: 'object',
                          required: ['modifierOptionId'],
                          properties: {
                            modifierOptionId: { type: 'string', format: 'uuid' },
                            quantity: { type: 'integer', default: 1 },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Takeaway order created successfully with token number' },
        '400': { $ref: '#/components/responses/ValidationError' },
      },
    },
    get: {
      tags: ['Takeaway Management'],
      summary: 'List takeaway orders',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'status', schema: { type: 'string' } },
        { in: 'query', name: 'paymentStatus', schema: { type: 'string' } },
        { in: 'query', name: 'businessDate', schema: { type: 'string', example: '2026-08-19' } },
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
      ],
      responses: { '200': { description: 'List of takeaway orders' } },
    },
  },
  '/api/v1/takeaway/orders/active': {
    get: {
      tags: ['Takeaway Management'],
      summary: 'Get active takeaway orders',
      security: [{ bearerAuth: [] }],
      description:
        'Returns non-completed, non-cancelled takeaway orders currently in kitchen/counter queue.',
      responses: { '200': { description: 'Active takeaway orders' } },
    },
  },
  '/api/v1/takeaway/orders/{id}': {
    get: {
      tags: ['Takeaway Management'],
      summary: 'Get takeaway order by ID',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: { '200': { description: 'Takeaway order details' } },
    },
  },
  '/api/v1/takeaway/orders/{id}/status': {
    patch: {
      tags: ['Takeaway Management'],
      summary: 'Update takeaway order status',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['status'],
              properties: {
                status: {
                  type: 'string',
                  enum: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'],
                },
              },
            },
          },
        },
      },
      responses: { '200': { description: 'Status updated' } },
    },
  },
  '/api/v1/takeaway/orders/{id}/cancel': {
    post: {
      tags: ['Takeaway Management'],
      summary: 'Cancel takeaway order',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['reason'],
              properties: { reason: { type: 'string', minLength: 3 } },
            },
          },
        },
      },
      responses: { '200': { description: 'Order cancelled' } },
    },
  },
};
