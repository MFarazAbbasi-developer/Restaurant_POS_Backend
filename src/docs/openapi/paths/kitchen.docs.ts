export const kitchenPaths = {
  '/api/v1/kitchen/queue': {
    get: {
      tags: ['Kitchen Operations & KDS - Queue'],
      summary: 'Get active kitchen preparation queue',
      security: [{ bearerAuth: [] }],
      description:
        'Returns real-time active kitchen display tickets (`CONFIRMED`, `PREPARING`, `READY`) with computed age (elapsed seconds/minutes), urgency tier (`NORMAL`, `WARNING`, `CRITICAL`), portion variants, modifiers, and special instructions. Supports station and category routing filters.',
      parameters: [
        {
          in: 'query',
          name: 'orderType',
          schema: { type: 'string', enum: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'] },
        },
        {
          in: 'query',
          name: 'status',
          schema: { type: 'string', enum: ['CONFIRMED', 'PREPARING', 'READY', 'ALL_ACTIVE'] },
        },
        { in: 'query', name: 'stationId', schema: { type: 'string', format: 'uuid' } },
        { in: 'query', name: 'categoryId', schema: { type: 'string', format: 'uuid' } },
        { in: 'query', name: 'search', schema: { type: 'string' } },
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 50 } },
      ],
      responses: {
        '200': { description: 'Active kitchen queue with ticket metrics and item breakdown' },
      },
    },
  },
  '/api/v1/kitchen/performance': {
    get: {
      tags: ['Kitchen Operations & KDS - Queue'],
      summary: 'Get kitchen performance analytics',
      security: [{ bearerAuth: [] }],
      description:
        'Calculates active tickets count, preparing vs ready counts, delayed orders (> 15 mins), today completed orders count, and average prep time in minutes.',
      responses: {
        '200': { description: 'Kitchen performance metrics' },
      },
    },
  },
  '/api/v1/kitchen/orders/{id}': {
    get: {
      tags: ['Kitchen Operations & KDS - Queue'],
      summary: 'Get single kitchen ticket details',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Kitchen ticket details' },
        '404': { $ref: '#/components/responses/NotFoundError' },
      },
    },
  },
  '/api/v1/kitchen/orders/{id}/status': {
    patch: {
      tags: ['Kitchen Operations & KDS - Bump Bar'],
      summary: 'Bump entire order ticket status',
      security: [{ bearerAuth: [] }],
      description:
        'Advances order kitchen preparation state (`PREPARING` -> `READY` -> `SERVED`). Cascades preparation status to active items and broadcasts real-time Socket.IO events.',
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
                status: { type: 'string', enum: ['PREPARING', 'READY', 'SERVED'] },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Order ticket bumped successfully' },
        '400': { $ref: '#/components/responses/BadRequestError' },
      },
    },
  },
  '/api/v1/kitchen/orders/{id}/recall': {
    post: {
      tags: ['Kitchen Operations & KDS - Bump Bar'],
      summary: 'Recall bumped order back to kitchen',
      security: [{ bearerAuth: [] }],
      description:
        'Reverts an order that was marked `READY` or `SERVED` back to `PREPARING`. Reverts its items back to preparing state and broadcasts real-time event.',
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                reason: { type: 'string', example: 'Customer requested food reheat' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Order recalled back to kitchen' },
        '400': { $ref: '#/components/responses/BadRequestError' },
      },
    },
  },
  '/api/v1/kitchen/orders/{orderId}/items/{itemId}/status': {
    patch: {
      tags: ['Kitchen Operations & KDS - Bump Bar'],
      summary: 'Bump individual item preparation status',
      security: [{ bearerAuth: [] }],
      description:
        'Updates preparation status of a specific item (`PENDING` -> `PREPARING` -> `READY` -> `SERVED`). Automatically advances the order status to `READY` when all items are prepared.',
      parameters: [
        { in: 'path', name: 'orderId', required: true, schema: { type: 'string', format: 'uuid' } },
        { in: 'path', name: 'itemId', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['status'],
              properties: {
                status: { type: 'string', enum: ['PENDING', 'PREPARING', 'READY', 'SERVED'] },
                kitchenNotes: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Item bumped and ticket updated' },
      },
    },
  },
  '/api/v1/kitchen/orders/{orderId}/items/{itemId}/recall': {
    post: {
      tags: ['Kitchen Operations & KDS - Bump Bar'],
      summary: 'Recall bumped item back to preparing',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'orderId', required: true, schema: { type: 'string', format: 'uuid' } },
        { in: 'path', name: 'itemId', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                reason: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Item recalled' },
      },
    },
  },
  '/api/v1/kitchen/stations': {
    post: {
      tags: ['Kitchen Operations & KDS - Stations'],
      summary: 'Create kitchen station',
      security: [{ bearerAuth: [] }],
      description:
        'Creates a dedicated kitchen prep station (e.g. Grill, Fryer, Pizza, Bar, Salad, Expediter) with category routing.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', example: 'Grill Station' },
                code: { type: 'string', example: 'GRILL' },
                displayOrder: { type: 'integer', default: 0 },
                categoryIds: {
                  type: 'array',
                  items: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Kitchen station created' },
        '409': { $ref: '#/components/responses/ConflictError' },
      },
    },
    get: {
      tags: ['Kitchen Operations & KDS - Stations'],
      summary: 'List kitchen stations',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'List of kitchen stations with mapped categories' },
      },
    },
  },
  '/api/v1/kitchen/stations/{id}': {
    get: {
      tags: ['Kitchen Operations & KDS - Stations'],
      summary: 'Get kitchen station details by ID',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Kitchen station details' },
        '404': { $ref: '#/components/responses/NotFoundError' },
      },
    },
    patch: {
      tags: ['Kitchen Operations & KDS - Stations'],
      summary: 'Update kitchen station',
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
              properties: {
                name: { type: 'string' },
                code: { type: 'string' },
                displayOrder: { type: 'integer' },
                isActive: { type: 'boolean' },
                categoryIds: {
                  type: 'array',
                  items: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Kitchen station updated' },
      },
    },
    delete: {
      tags: ['Kitchen Operations & KDS - Stations'],
      summary: 'Delete kitchen station',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Kitchen station deleted' },
      },
    },
  },
};
