export const purchasingPaths = {
  // ===========================================================================
  // Suppliers
  // ===========================================================================
  '/api/v1/purchasing/suppliers': {
    get: {
      tags: ['Purchasing & Supplier Management'],
      summary: 'List suppliers',
      description: 'Retrieves all vendors/suppliers with search and pagination.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
      ],
      responses: {
        '200': { description: 'Suppliers retrieved successfully' },
        '401': { description: 'Unauthorized' },
      },
    },
    post: {
      tags: ['Purchasing & Supplier Management'],
      summary: 'Create supplier',
      description: 'Registers a new supplier/vendor for restaurant inventory purchasing.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', example: 'Lahore Meat & Poultry Wholesale' },
                contactPerson: { type: 'string', example: 'Haji Aslam' },
                phone: { type: 'string', example: '+923005554433' },
                email: { type: 'string', format: 'email', example: 'aslam@lahoremeat.pk' },
                address: { type: 'string', example: 'Shop 14, Grain Market, Badami Bagh, Lahore' },
                taxNumber: { type: 'string', example: 'NTN-1234567-8' },
                isActive: { type: 'boolean', default: true },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Supplier created successfully' },
        '409': { description: 'Supplier already exists' },
      },
    },
  },

  '/api/v1/purchasing/suppliers/{id}': {
    get: {
      tags: ['Purchasing & Supplier Management'],
      summary: 'Get supplier details',
      description: 'Retrieves supplier profile, supplied items, and recent purchase orders.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Supplier details retrieved successfully' },
        '404': { description: 'Supplier not found' },
      },
    },
    put: {
      tags: ['Purchasing & Supplier Management'],
      summary: 'Update supplier',
      description: 'Updates supplier contact information and details.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                contactPerson: { type: 'string' },
                phone: { type: 'string' },
                email: { type: 'string' },
                address: { type: 'string' },
                taxNumber: { type: 'string' },
                isActive: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Supplier updated successfully' },
        '404': { description: 'Supplier not found' },
      },
    },
    delete: {
      tags: ['Purchasing & Supplier Management'],
      summary: 'Deactivate supplier',
      description: 'Soft-deletes/deactivates a supplier.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Supplier deactivated successfully' },
        '404': { description: 'Supplier not found' },
      },
    },
  },

  '/api/v1/purchasing/suppliers/{id}/history': {
    get: {
      tags: ['Purchasing & Supplier Management'],
      summary: 'Get supplier purchase history',
      description: 'Retrieves complete spend summary and past purchase orders for a supplier.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Supplier history retrieved successfully' },
        '404': { description: 'Supplier not found' },
      },
    },
  },

  // ===========================================================================
  // Purchase Orders Workflow
  // ===========================================================================
  '/api/v1/purchasing/orders': {
    get: {
      tags: ['Purchasing & Supplier Management'],
      summary: 'List purchase orders',
      description:
        'Lists purchase orders with filters for status, supplier, location, date range, and pagination.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        {
          name: 'status',
          in: 'query',
          schema: {
            type: 'string',
            enum: ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
          },
        },
        { name: 'supplierId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'locationId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
      ],
      responses: {
        '200': { description: 'Purchase orders retrieved successfully' },
      },
    },
    post: {
      tags: ['Purchasing & Supplier Management'],
      summary: 'Create purchase order',
      description:
        'Creates a purchase order in DRAFT, ORDERED, or directly in RECEIVED status (with auto-receiving).',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['items'],
              properties: {
                supplierId: { type: 'string', format: 'uuid' },
                locationId: { type: 'string', format: 'uuid' },
                invoiceNumber: { type: 'string', example: 'INV-9988' },
                expectedDeliveryDate: { type: 'string', format: 'date-time' },
                status: {
                  type: 'string',
                  enum: ['DRAFT', 'ORDERED', 'RECEIVED'],
                  default: 'ORDERED',
                },
                notes: { type: 'string' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['inventoryItemId', 'quantity', 'unitCost'],
                    properties: {
                      inventoryItemId: { type: 'string', format: 'uuid' },
                      quantity: { type: 'number', example: 50 },
                      unitCost: { type: 'number', example: 1200 },
                      taxRate: { type: 'number', default: 0, example: 5 },
                      discountRate: { type: 'number', default: 0, example: 0 },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Purchase order created successfully' },
        '400': { description: 'Validation error' },
      },
    },
  },

  '/api/v1/purchasing/orders/{id}': {
    get: {
      tags: ['Purchasing & Supplier Management'],
      summary: 'Get purchase order details',
      description: 'Retrieves complete purchase order details with line items and return history.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Purchase order retrieved successfully' },
        '404': { description: 'Purchase order not found' },
      },
    },
    put: {
      tags: ['Purchasing & Supplier Management'],
      summary: 'Update purchase order',
      description: 'Updates a DRAFT or ORDERED purchase order before goods are received.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                supplierId: { type: 'string', format: 'uuid' },
                locationId: { type: 'string', format: 'uuid' },
                invoiceNumber: { type: 'string' },
                expectedDeliveryDate: { type: 'string' },
                notes: { type: 'string' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      inventoryItemId: { type: 'string', format: 'uuid' },
                      quantity: { type: 'number' },
                      unitCost: { type: 'number' },
                      taxRate: { type: 'number' },
                      discountRate: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Purchase order updated successfully' },
        '400': { description: 'Cannot update PO with received goods' },
        '404': { description: 'Purchase order not found' },
      },
    },
  },

  '/api/v1/purchasing/orders/{id}/order': {
    post: {
      tags: ['Purchasing & Supplier Management'],
      summary: 'Send / place purchase order',
      description: 'Transitions purchase order from DRAFT to ORDERED status.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Purchase order ordered successfully' },
        '400': { description: 'Invalid status transition' },
      },
    },
  },

  '/api/v1/purchasing/orders/{id}/receive': {
    post: {
      tags: ['Purchasing & Supplier Management'],
      summary: 'Receive purchase order goods',
      description:
        'Receives full or partial stock against purchase order line items, incrementing inventory stock balances and creating stock movement logs.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['items'],
              properties: {
                invoiceNumber: { type: 'string' },
                receivedLocationId: { type: 'string', format: 'uuid' },
                notes: { type: 'string' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['purchaseOrderItemId', 'quantityReceived'],
                    properties: {
                      purchaseOrderItemId: { type: 'string', format: 'uuid' },
                      quantityReceived: { type: 'number', example: 25 },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Goods received and stock updated successfully' },
        '400': { description: 'Validation or over-receiving error' },
      },
    },
  },

  '/api/v1/purchasing/orders/{id}/returns': {
    post: {
      tags: ['Purchasing & Supplier Management'],
      summary: 'Process purchase return',
      description:
        'Returns received stock back to supplier, decrementing inventory stock and logging PURCHASE_RETURN movement.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['reason', 'items'],
              properties: {
                reason: { type: 'string', example: 'Damaged packaging / quality rejected' },
                notes: { type: 'string' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['purchaseOrderItemId', 'quantity'],
                    properties: {
                      purchaseOrderItemId: { type: 'string', format: 'uuid' },
                      quantity: { type: 'number', example: 5 },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Purchase return processed successfully' },
        '400': { description: 'Validation or insufficient stock error' },
      },
    },
  },

  '/api/v1/purchasing/orders/{id}/cancel': {
    post: {
      tags: ['Purchasing & Supplier Management'],
      summary: 'Cancel purchase order',
      description: 'Cancels an unreceived purchase order.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Purchase order cancelled successfully' },
        '400': { description: 'Cannot cancel received order' },
      },
    },
  },

  // ===========================================================================
  // Purchasing Summary
  // ===========================================================================
  '/api/v1/purchasing/summary': {
    get: {
      tags: ['Purchasing & Supplier Management'],
      summary: 'Get purchasing summary analytics',
      description:
        'Returns aggregated purchasing analytics including total spend, status breakdowns, and top supplier rankings.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'supplierId', in: 'query', schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Purchasing summary retrieved successfully' },
      },
    },
  },
};
