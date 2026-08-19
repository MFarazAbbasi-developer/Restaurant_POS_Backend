export const ordersPaths = {
  '/api/v1/orders': {
    post: {
      tags: ['Core Orders & Billing'],
      summary: 'Create unified order',
      security: [{ bearerAuth: [] }],
      description:
        'Creates a unified order across `DINE_IN`, `TAKEAWAY`, or `DELIVERY`. Performs atomic daily order sequencing (`ORD-YYYYMMDD-XXX`), permanent item price and modifier snapshotting, automated tax and service charge calculations, and updates table occupancy status when applicable.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['orderType', 'items'],
              properties: {
                orderType: { type: 'string', enum: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'] },
                tableId: {
                  type: 'string',
                  format: 'uuid',
                  description: 'Mandatory for DINE_IN when linked to a physical dining table',
                },
                customerId: { type: 'string', format: 'uuid' },
                deliveryAddress: { type: 'string' },
                deliveryCharge: { type: 'number' },
                packagingCharge: { type: 'number' },
                notes: { type: 'string' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['menuItemId', 'quantity'],
                    properties: {
                      menuItemId: { type: 'string', format: 'uuid' },
                      variantId: { type: 'string', format: 'uuid' },
                      quantity: { type: 'integer', example: 2 },
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
        '201': {
          description: 'Order created successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      order: { $ref: '#/components/schemas/Order' },
                    },
                  },
                },
              },
            },
          },
        },
        '400': { $ref: '#/components/responses/ValidationError' },
        '401': { $ref: '#/components/responses/UnauthorizedError' },
        '403': { $ref: '#/components/responses/ForbiddenError' },
      },
    },
    get: {
      tags: ['Core Orders & Billing'],
      summary: 'List & filter orders',
      security: [{ bearerAuth: [] }],
      description:
        'Lists orders with comprehensive filters, search, sorting, and pagination. Requires `orders.view` permission.',
      parameters: [
        {
          in: 'query',
          name: 'orderType',
          schema: { type: 'string', enum: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'] },
        },
        { in: 'query', name: 'status', schema: { type: 'string' } },
        { in: 'query', name: 'paymentStatus', schema: { type: 'string' } },
        { in: 'query', name: 'tableId', schema: { type: 'string', format: 'uuid' } },
        { in: 'query', name: 'search', schema: { type: 'string' } },
        { in: 'query', name: 'startDate', schema: { type: 'string', format: 'date-time' } },
        { in: 'query', name: 'endDate', schema: { type: 'string', format: 'date-time' } },
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
      ],
      responses: {
        '200': {
          description: 'List of orders with pagination',
        },
      },
    },
  },
  '/api/v1/orders/summary/daily': {
    get: {
      tags: ['Core Orders & Billing'],
      summary: 'Get daily orders and sales metrics summary',
      security: [{ bearerAuth: [] }],
      description:
        'Calculates high-level metrics (total orders, total sales, sales by order type, paid vs unpaid totals) for a given business date.',
      parameters: [
        { in: 'query', name: 'businessDate', schema: { type: 'string', example: '2026-08-19' } },
      ],
      responses: {
        '200': { description: 'Daily summary metrics' },
      },
    },
  },
  '/api/v1/orders/table/{tableId}': {
    get: {
      tags: ['Core Orders & Billing'],
      summary: 'Get active orders for dining table',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'tableId', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Active orders for the table' },
      },
    },
  },
  '/api/v1/orders/{id}': {
    get: {
      tags: ['Core Orders & Billing'],
      summary: 'Get order details by ID',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': {
          description: 'Order details with full item and payment breakdown',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      order: { $ref: '#/components/schemas/Order' },
                    },
                  },
                },
              },
            },
          },
        },
        '404': { $ref: '#/components/responses/NotFoundError' },
      },
    },
  },
  '/api/v1/orders/{id}/items': {
    patch: {
      tags: ['Core Orders & Billing'],
      summary: 'Add incremental items / courses to order',
      security: [{ bearerAuth: [] }],
      description:
        'Appends additional menu items to an active order (e.g. subsequent rounds/courses during dine-in) and recalculates order financial totals.',
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['items'],
              properties: {
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['menuItemId', 'quantity'],
                    properties: {
                      menuItemId: { type: 'string', format: 'uuid' },
                      variantId: { type: 'string', format: 'uuid' },
                      quantity: { type: 'integer' },
                      notes: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Items added and totals recalculated' },
      },
    },
  },
  '/api/v1/orders/{id}/items/{itemId}/void': {
    post: {
      tags: ['Core Orders & Billing'],
      summary: 'Void a single order item',
      security: [{ bearerAuth: [] }],
      description:
        'Voids an individual item on the order with a mandatory reason. Requires `orders.void` permission or a valid `managerPin`. Recalculates order totals.',
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        { in: 'path', name: 'itemId', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['reason'],
              properties: {
                reason: { type: 'string', minLength: 3, example: 'Customer disliked taste' },
                managerPin: { type: 'string', example: '5566' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Item voided and totals recalculated' },
        '403': { $ref: '#/components/responses/ForbiddenError' },
      },
    },
  },
  '/api/v1/orders/{id}/discount': {
    post: {
      tags: ['Core Orders & Billing'],
      summary: 'Apply order-level discount',
      security: [{ bearerAuth: [] }],
      description:
        'Applies percentage or fixed discount to the order with a mandatory reason. Supports manager PIN authorization.',
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['discountType', 'discountValue', 'reason'],
              properties: {
                discountType: { type: 'string', enum: ['PERCENTAGE', 'FIXED_AMOUNT'] },
                discountValue: { type: 'number', example: 10.0 },
                reason: { type: 'string', minLength: 3, example: 'Loyalty customer discount' },
                managerPin: { type: 'string', example: '5566' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Discount applied and totals updated' },
        '403': { $ref: '#/components/responses/ForbiddenError' },
      },
    },
  },
  '/api/v1/orders/{id}/status': {
    patch: {
      tags: ['Core Orders & Billing'],
      summary: 'Update order lifecycle status',
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
                  enum: [
                    'CONFIRMED',
                    'PREPARING',
                    'READY',
                    'SERVED',
                    'COMPLETED',
                    'CANCELLED',
                    'VOIDED',
                  ],
                },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Order status updated' },
      },
    },
  },
  '/api/v1/orders/{id}/cancel': {
    post: {
      tags: ['Core Orders & Billing'],
      summary: 'Cancel order with reason',
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
      responses: {
        '200': { description: 'Order cancelled' },
      },
    },
  },
  '/api/v1/orders/{id}/void': {
    post: {
      tags: ['Core Orders & Billing'],
      summary: 'Void entire order',
      security: [{ bearerAuth: [] }],
      description:
        'Voids an entire order with mandatory reason. Requires manager PIN authorization.',
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
              properties: {
                reason: { type: 'string', minLength: 3 },
                managerPin: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Order voided' },
        '403': { $ref: '#/components/responses/ForbiddenError' },
      },
    },
  },
};
