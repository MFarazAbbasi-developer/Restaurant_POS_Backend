export const inventoryPaths = {
  // ---------------------------------------------------------------------------
  // Locations
  // ---------------------------------------------------------------------------
  '/api/v1/inventory/locations': {
    get: {
      tags: ['Inventory & Stock Management'],
      summary: 'List stock locations',
      description:
        'Retrieves all storage locations (e.g. Main Kitchen, Bar, Pantry) for the active restaurant tenant.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Locations retrieved successfully' },
        '401': { description: 'Unauthorized' },
        '403': { description: 'Forbidden - requires inventory.view permission' },
      },
    },
    post: {
      tags: ['Inventory & Stock Management'],
      summary: 'Create stock location',
      description: 'Creates a new stock location for the active restaurant tenant.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', example: 'Cold Room Storage' },
                code: { type: 'string', example: 'COLD_01' },
                isDefault: { type: 'boolean', example: false },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Location created successfully' },
        '400': { description: 'Validation error' },
        '409': { description: 'Location name conflict' },
      },
    },
  },
  '/api/v1/inventory/locations/{id}': {
    get: {
      tags: ['Inventory & Stock Management'],
      summary: 'Get stock location by ID',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Location retrieved successfully' },
        '404': { description: 'Location not found' },
      },
    },
    patch: {
      tags: ['Inventory & Stock Management'],
      summary: 'Update stock location',
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
                code: { type: 'string' },
                isDefault: { type: 'boolean' },
                isActive: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Location updated successfully' },
        '404': { description: 'Location not found' },
      },
    },
    delete: {
      tags: ['Inventory & Stock Management'],
      summary: 'Delete or deactivate stock location',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Location deleted or deactivated' },
        '404': { description: 'Location not found' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Suppliers
  // ---------------------------------------------------------------------------
  '/api/v1/inventory/suppliers': {
    get: {
      tags: ['Inventory & Stock Management'],
      summary: 'List suppliers',
      description: 'Retrieves all inventory suppliers for the active restaurant tenant.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Suppliers retrieved successfully' },
      },
    },
    post: {
      tags: ['Inventory & Stock Management'],
      summary: 'Create supplier',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', example: 'Al-Madina Meat Supplies' },
                contactPerson: { type: 'string', example: 'Tariq Mehmood' },
                phone: { type: 'string', example: '+92 300 1234567' },
                email: { type: 'string', example: 'orders@almadinameat.com' },
                address: { type: 'string', example: 'G-9 Markaz, Islamabad' },
                taxNumber: { type: 'string', example: 'STRN-123456' },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Supplier created successfully' },
        '409': { description: 'Supplier name conflict' },
      },
    },
  },
  '/api/v1/inventory/suppliers/{id}': {
    get: {
      tags: ['Inventory & Stock Management'],
      summary: 'Get supplier by ID',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Supplier retrieved' },
        '404': { description: 'Supplier not found' },
      },
    },
    patch: {
      tags: ['Inventory & Stock Management'],
      summary: 'Update supplier',
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
        '200': { description: 'Supplier updated' },
        '404': { description: 'Supplier not found' },
      },
    },
    delete: {
      tags: ['Inventory & Stock Management'],
      summary: 'Deactivate supplier',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Supplier deactivated' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Inventory Items
  // ---------------------------------------------------------------------------
  '/api/v1/inventory/items': {
    get: {
      tags: ['Inventory & Stock Management'],
      summary: 'List inventory items / raw ingredients',
      description: 'Filters items by supplier, location, lowStock flag, or search keyword.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'supplierId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'locationId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'lowStock', in: 'query', schema: { type: 'boolean' } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
      ],
      responses: {
        '200': { description: 'Inventory items retrieved' },
      },
    },
    post: {
      tags: ['Inventory & Stock Management'],
      summary: 'Create inventory item / raw ingredient',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['itemCode', 'name', 'unit', 'costPerUnit'],
              properties: {
                itemCode: { type: 'string', example: 'ING-BEEF-01' },
                name: { type: 'string', example: 'Ground Beef (Minced)' },
                description: { type: 'string', example: '80/20 Lean ground beef' },
                unit: { type: 'string', example: 'KG' },
                costPerUnit: { type: 'number', example: 12.5 },
                currentStock: { type: 'number', example: 50.0 },
                minStockLevel: { type: 'number', example: 10.0 },
                targetStockLevel: { type: 'number', example: 100.0 },
                locationId: { type: 'string', format: 'uuid' },
                supplierId: { type: 'string', format: 'uuid' },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Inventory item created' },
        '409': { description: 'Item code conflict' },
      },
    },
  },
  '/api/v1/inventory/items/{id}': {
    get: {
      tags: ['Inventory & Stock Management'],
      summary: 'Get inventory item details',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Inventory item retrieved' },
        '404': { description: 'Inventory item not found' },
      },
    },
    patch: {
      tags: ['Inventory & Stock Management'],
      summary: 'Update inventory item',
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
                unit: { type: 'string' },
                costPerUnit: { type: 'number' },
                minStockLevel: { type: 'number' },
                targetStockLevel: { type: 'number' },
                locationId: { type: 'string', format: 'uuid' },
                supplierId: { type: 'string', format: 'uuid' },
                isActive: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Inventory item updated' },
        '404': { description: 'Inventory item not found' },
      },
    },
    delete: {
      tags: ['Inventory & Stock Management'],
      summary: 'Deactivate inventory item',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Inventory item deactivated' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Recipes
  // ---------------------------------------------------------------------------
  '/api/v1/inventory/recipes': {
    post: {
      tags: ['Inventory & Stock Management'],
      summary: 'Create or update recipe ingredient mapping',
      description: 'Links an inventory item and quantity to a menu item, variant, or modifier.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['inventoryItemId', 'quantity'],
              properties: {
                menuItemId: { type: 'string', format: 'uuid' },
                variantId: { type: 'string', format: 'uuid' },
                modifierId: { type: 'string', format: 'uuid' },
                inventoryItemId: { type: 'string', format: 'uuid' },
                quantity: { type: 'number', example: 0.15 },
                wastePercentage: { type: 'number', example: 5 },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Recipe saved successfully' },
        '400': { description: 'Missing link target or invalid quantity' },
      },
    },
  },
  '/api/v1/inventory/recipes/menu-item/{menuItemId}': {
    get: {
      tags: ['Inventory & Stock Management'],
      summary: 'Get all recipe ingredients for a menu item',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'menuItemId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      responses: {
        '200': { description: 'Recipe ingredients retrieved' },
      },
    },
  },
  '/api/v1/inventory/recipes/{id}': {
    delete: {
      tags: ['Inventory & Stock Management'],
      summary: 'Remove recipe ingredient mapping',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Recipe ingredient removed' },
        '404': { description: 'Recipe ingredient not found' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Purchases
  // ---------------------------------------------------------------------------
  '/api/v1/inventory/purchases': {
    get: {
      tags: ['Inventory & Stock Management'],
      summary: 'List purchase receiving entries',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'supplierId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'locationId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'startDate', in: 'query', schema: { type: 'string', example: '2026-08-01' } },
        { name: 'endDate', in: 'query', schema: { type: 'string', example: '2026-08-31' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
      ],
      responses: {
        '200': { description: 'Purchase orders retrieved' },
      },
    },
    post: {
      tags: ['Inventory & Stock Management'],
      summary: 'Record purchase receiving / supplier delivery',
      description: 'Increments stock quantities and records purchase receipts in the ledger.',
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
                invoiceNumber: { type: 'string', example: 'INV-88990' },
                notes: { type: 'string', example: 'Delivered fresh meat batch' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['inventoryItemId', 'quantity', 'unitCost'],
                    properties: {
                      inventoryItemId: { type: 'string', format: 'uuid' },
                      quantity: { type: 'number', example: 25.0 },
                      unitCost: { type: 'number', example: 12.0 },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Purchase order received' },
      },
    },
  },
  '/api/v1/inventory/purchases/{id}': {
    get: {
      tags: ['Inventory & Stock Management'],
      summary: 'Get purchase order details',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Purchase order details' },
        '404': { description: 'Not found' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Adjustments
  // ---------------------------------------------------------------------------
  '/api/v1/inventory/adjustments': {
    get: {
      tags: ['Inventory & Stock Management'],
      summary: 'List stock adjustments',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Adjustments retrieved' },
      },
    },
    post: {
      tags: ['Inventory & Stock Management'],
      summary: 'Record physical stock count adjustment',
      description: 'Reconciles counted stock against system stock, logging differences in ledger.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['reason', 'items'],
              properties: {
                locationId: { type: 'string', format: 'uuid' },
                reason: { type: 'string', example: 'Weekly physical cycle count' },
                notes: { type: 'string', example: 'Adjusted after deep kitchen audit' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['inventoryItemId', 'actualStock'],
                    properties: {
                      inventoryItemId: { type: 'string', format: 'uuid' },
                      actualStock: { type: 'number', example: 42.5 },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Stock adjusted' },
      },
    },
  },
  '/api/v1/inventory/adjustments/{id}': {
    get: {
      tags: ['Inventory & Stock Management'],
      summary: 'Get stock adjustment details',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Adjustment details' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Wastage
  // ---------------------------------------------------------------------------
  '/api/v1/inventory/wastage': {
    get: {
      tags: ['Inventory & Stock Management'],
      summary: 'List stock wastage and spoilage records',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Wastage records retrieved' },
      },
    },
    post: {
      tags: ['Inventory & Stock Management'],
      summary: 'Record stock wastage / spoilage',
      description: 'Deducts spoiled or expired items from stock and records wastage value.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['reason', 'items'],
              properties: {
                locationId: { type: 'string', format: 'uuid' },
                reason: {
                  type: 'string',
                  enum: [
                    'EXPIRED',
                    'SPOILED',
                    'PREPARATION_ERROR',
                    'DAMAGED',
                    'CONTAMINATED',
                    'OTHER',
                  ],
                  example: 'SPOILED',
                },
                notes: {
                  type: 'string',
                  example: 'Refrigerator temperature fluctuation overnight',
                },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['inventoryItemId', 'quantity'],
                    properties: {
                      inventoryItemId: { type: 'string', format: 'uuid' },
                      quantity: { type: 'number', example: 3.5 },
                      itemReason: { type: 'string', example: 'Sour smell' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Stock wastage recorded' },
      },
    },
  },
  '/api/v1/inventory/wastage/{id}': {
    get: {
      tags: ['Inventory & Stock Management'],
      summary: 'Get wastage record details',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Wastage record details' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Transfers
  // ---------------------------------------------------------------------------
  '/api/v1/inventory/transfers': {
    get: {
      tags: ['Inventory & Stock Management'],
      summary: 'List stock transfers',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Transfers retrieved' },
      },
    },
    post: {
      tags: ['Inventory & Stock Management'],
      summary: 'Record stock transfer between locations',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['fromLocationId', 'toLocationId', 'items'],
              properties: {
                fromLocationId: { type: 'string', format: 'uuid' },
                toLocationId: { type: 'string', format: 'uuid' },
                notes: { type: 'string', example: 'Restocking kitchen pantry' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['inventoryItemId', 'quantity'],
                    properties: {
                      inventoryItemId: { type: 'string', format: 'uuid' },
                      quantity: { type: 'number', example: 10.0 },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Stock transfer completed' },
      },
    },
  },
  '/api/v1/inventory/transfers/{id}': {
    get: {
      tags: ['Inventory & Stock Management'],
      summary: 'Get stock transfer details',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Transfer details' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Ledger
  // ---------------------------------------------------------------------------
  '/api/v1/inventory/ledger': {
    get: {
      tags: ['Inventory & Stock Management'],
      summary: 'Get immutable stock movement ledger history',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'inventoryItemId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'locationId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'type', in: 'query', schema: { type: 'string' } },
        { name: 'startDate', in: 'query', schema: { type: 'string' } },
        { name: 'endDate', in: 'query', schema: { type: 'string' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
      ],
      responses: {
        '200': { description: 'Movement ledger history' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Summaries & Valuation
  // ---------------------------------------------------------------------------
  '/api/v1/inventory/summary': {
    get: {
      tags: ['Inventory & Stock Management'],
      summary: 'Get inventory stock and valuation summary',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Inventory summary retrieved' },
      },
    },
  },
  '/api/v1/inventory/low-stock': {
    get: {
      tags: ['Inventory & Stock Management'],
      summary: 'Get low-stock alert items and reorder recommendations',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Low stock items list' },
      },
    },
  },
  '/api/v1/inventory/valuation': {
    get: {
      tags: ['Inventory & Stock Management'],
      summary: 'Get inventory valuation report with location breakdown',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Valuation report retrieved' },
      },
    },
  },
};
