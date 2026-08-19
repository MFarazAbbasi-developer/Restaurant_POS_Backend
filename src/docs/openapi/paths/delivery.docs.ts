export const deliveryPaths = {
  '/api/v1/customers': {
    post: {
      tags: ['Delivery & Customers - Customers'],
      summary: 'Create delivery customer',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'phone'],
              properties: {
                name: { type: 'string', example: 'Fatima Noor' },
                phone: { type: 'string', example: '+92 321 7654321' },
                address: { type: 'string', example: 'House 45, Street 10, Sector G' },
                landmark: { type: 'string', example: 'Near Green Mosque' },
                notes: { type: 'string' },
              },
            },
          },
        },
      },
      responses: { '201': { description: 'Customer created' } },
    },
    get: {
      tags: ['Delivery & Customers - Customers'],
      summary: 'List customers',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'search', schema: { type: 'string' } },
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
      ],
      responses: { '200': { description: 'Customer list' } },
    },
  },
  '/api/v1/customers/lookup': {
    get: {
      tags: ['Delivery & Customers - Customers'],
      summary: 'Caller ID / Phone lookup customer',
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'query', name: 'phone', required: true, schema: { type: 'string' } }],
      responses: { '200': { description: 'Customer profile with order history' } },
    },
  },
  '/api/v1/customers/{id}': {
    get: {
      tags: ['Delivery & Customers - Customers'],
      summary: 'Get customer by ID',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: { '200': { description: 'Customer details' } },
    },
    patch: {
      tags: ['Delivery & Customers - Customers'],
      summary: 'Update customer',
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
                phone: { type: 'string' },
                address: { type: 'string' },
                landmark: { type: 'string' },
                notes: { type: 'string' },
              },
            },
          },
        },
      },
      responses: { '200': { description: 'Customer updated' } },
    },
  },
  '/api/v1/customers/{id}/order-history': {
    get: {
      tags: ['Delivery & Customers - Customers'],
      summary: 'Get customer past order history',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: { '200': { description: 'Past orders for customer' } },
    },
  },
  '/api/v1/delivery/orders': {
    post: {
      tags: ['Delivery & Customers - Delivery Orders'],
      summary: 'Create delivery order',
      security: [{ bearerAuth: [] }],
      description:
        'Creates a delivery order linked to customer, delivery address, zone fees, packaging fees, and auto-computed total.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['customerName', 'customerPhone', 'deliveryAddress', 'items'],
              properties: {
                customerName: { type: 'string' },
                customerPhone: { type: 'string' },
                deliveryAddress: { type: 'string' },
                landmark: { type: 'string' },
                zoneId: { type: 'string', format: 'uuid' },
                deliveryFee: { type: 'number' },
                packagingFee: { type: 'number' },
                isPrepaid: { type: 'boolean', default: false },
                notes: { type: 'string' },
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
      responses: { '201': { description: 'Delivery order created' } },
    },
    get: {
      tags: ['Delivery & Customers - Delivery Orders'],
      summary: 'List delivery orders',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'status', schema: { type: 'string' } },
        { in: 'query', name: 'riderId', schema: { type: 'string', format: 'uuid' } },
        { in: 'query', name: 'businessDate', schema: { type: 'string' } },
      ],
      responses: { '200': { description: 'List of delivery orders' } },
    },
  },
  '/api/v1/delivery/orders/active': {
    get: {
      tags: ['Delivery & Customers - Delivery Orders'],
      summary: 'Get active delivery orders in progress',
      security: [{ bearerAuth: [] }],
      responses: { '200': { description: 'Active delivery orders' } },
    },
  },
  '/api/v1/delivery/orders/{id}': {
    get: {
      tags: ['Delivery & Customers - Delivery Orders'],
      summary: 'Get delivery order by ID',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: { '200': { description: 'Delivery order details' } },
    },
  },
  '/api/v1/delivery/orders/{id}/status': {
    patch: {
      tags: ['Delivery & Customers - Delivery Orders'],
      summary: 'Update delivery status',
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
                    'PENDING',
                    'CONFIRMED',
                    'PREPARING',
                    'READY_FOR_PICKUP',
                    'OUT_FOR_DELIVERY',
                    'DELIVERED',
                    'CANCELLED',
                  ],
                },
              },
            },
          },
        },
      },
      responses: { '200': { description: 'Delivery status updated' } },
    },
  },
  '/api/v1/delivery/orders/{id}/assign-rider': {
    post: {
      tags: ['Delivery & Customers - Delivery Orders'],
      summary: 'Assign rider to delivery order',
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
              required: ['riderId'],
              properties: { riderId: { type: 'string', format: 'uuid' } },
            },
          },
        },
      },
      responses: { '200': { description: 'Rider assigned to order' } },
    },
  },
  '/api/v1/delivery/orders/{id}/cancel': {
    post: {
      tags: ['Delivery & Customers - Delivery Orders'],
      summary: 'Cancel delivery order',
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
  '/api/v1/delivery/riders': {
    post: {
      tags: ['Delivery & Customers - Riders'],
      summary: 'Register delivery rider',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'phone'],
              properties: {
                name: { type: 'string', example: 'Bilal Ahmed' },
                phone: { type: 'string', example: '+92 333 4455667' },
                vehicleNumber: { type: 'string', example: 'LEA-2024-123' },
              },
            },
          },
        },
      },
      responses: { '201': { description: 'Rider registered' } },
    },
    get: {
      tags: ['Delivery & Customers - Riders'],
      summary: 'List delivery riders',
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'query', name: 'status', schema: { type: 'string' } }],
      responses: { '200': { description: 'Rider list' } },
    },
  },
  '/api/v1/delivery/riders/{id}': {
    get: {
      tags: ['Delivery & Customers - Riders'],
      summary: 'Get rider details',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: { '200': { description: 'Rider details' } },
    },
    patch: {
      tags: ['Delivery & Customers - Riders'],
      summary: 'Update rider',
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
                phone: { type: 'string' },
                vehicleNumber: { type: 'string' },
              },
            },
          },
        },
      },
      responses: { '200': { description: 'Rider updated' } },
    },
  },
  '/api/v1/delivery/riders/{id}/status': {
    patch: {
      tags: ['Delivery & Customers - Riders'],
      summary: 'Update rider status (AVAILABLE / BUSY / OFFLINE)',
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
                status: { type: 'string', enum: ['AVAILABLE', 'BUSY', 'OFFLINE'] },
              },
            },
          },
        },
      },
      responses: { '200': { description: 'Rider status updated' } },
    },
  },
  '/api/v1/delivery/zones': {
    post: {
      tags: ['Delivery & Customers - Delivery Zones'],
      summary: 'Create delivery zone',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'deliveryFee'],
              properties: {
                name: { type: 'string', example: 'Zone A (0-3km)' },
                deliveryFee: { type: 'number', example: 150.0 },
                minOrderAmount: { type: 'number', example: 500.0 },
                estimatedMinutes: { type: 'integer', example: 35 },
              },
            },
          },
        },
      },
      responses: { '201': { description: 'Delivery zone created' } },
    },
    get: {
      tags: ['Delivery & Customers - Delivery Zones'],
      summary: 'List delivery zones',
      security: [{ bearerAuth: [] }],
      responses: { '200': { description: 'List of delivery zones' } },
    },
  },
  '/api/v1/delivery/zones/{id}': {
    get: {
      tags: ['Delivery & Customers - Delivery Zones'],
      summary: 'Get delivery zone details',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: { '200': { description: 'Zone details' } },
    },
    patch: {
      tags: ['Delivery & Customers - Delivery Zones'],
      summary: 'Update delivery zone',
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
                deliveryFee: { type: 'number' },
                minOrderAmount: { type: 'number' },
                estimatedMinutes: { type: 'integer' },
                isActive: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: { '200': { description: 'Zone updated' } },
    },
    delete: {
      tags: ['Delivery & Customers - Delivery Zones'],
      summary: 'Delete delivery zone',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: { '200': { description: 'Zone deleted' } },
    },
  },
};
