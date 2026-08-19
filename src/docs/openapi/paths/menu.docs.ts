export const menuPaths = {
  '/api/v1/menu/pos-catalog': {
    get: {
      tags: ['Menu Management'],
      summary: 'Get active POS menu catalog',
      security: [{ bearerAuth: [] }],
      description:
        'Returns the complete nested menu tree (active categories, active & available items, active variants, modifier groups, and options) optimized for POS terminal display.',
      responses: {
        '200': {
          description: 'POS menu catalog retrieved successfully',
        },
      },
    },
  },
  '/api/v1/menu/categories': {
    post: {
      tags: ['Menu Management - Categories'],
      summary: 'Create menu category',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', example: 'Beverages' },
                description: { type: 'string' },
                sortOrder: { type: 'integer', default: 0 },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Category created successfully' },
        '400': { $ref: '#/components/responses/ValidationError' },
      },
    },
    get: {
      tags: ['Menu Management - Categories'],
      summary: 'List menu categories',
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'query', name: 'isActive', schema: { type: 'boolean' } }],
      responses: {
        '200': { description: 'List of categories' },
      },
    },
  },
  '/api/v1/menu/categories/{id}': {
    get: {
      tags: ['Menu Management - Categories'],
      summary: 'Get category by ID',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Category details' },
        '404': { $ref: '#/components/responses/NotFoundError' },
      },
    },
    patch: {
      tags: ['Menu Management - Categories'],
      summary: 'Update category',
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
                description: { type: 'string' },
                sortOrder: { type: 'integer' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Category updated successfully' },
      },
    },
  },
  '/api/v1/menu/categories/{id}/status': {
    patch: {
      tags: ['Menu Management - Categories'],
      summary: 'Activate or deactivate category',
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
              required: ['isActive'],
              properties: { isActive: { type: 'boolean' } },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Category status updated' },
      },
    },
  },
  '/api/v1/menu/categories/reorder': {
    put: {
      tags: ['Menu Management - Categories'],
      summary: 'Batch reorder categories',
      security: [{ bearerAuth: [] }],
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
                    required: ['id', 'sortOrder'],
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      sortOrder: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Categories reordered' },
      },
    },
  },
  '/api/v1/menu/items': {
    post: {
      tags: ['Menu Management - Items'],
      summary: 'Create menu item',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['categoryId', 'name', 'basePrice'],
              properties: {
                categoryId: { type: 'string', format: 'uuid' },
                itemCode: { type: 'string' },
                name: { type: 'string', example: 'Club Sandwich' },
                urduName: { type: 'string' },
                description: { type: 'string' },
                basePrice: { type: 'number', example: 12.5 },
                taxRate: { type: 'number', nullable: true },
                sortOrder: { type: 'integer', default: 0 },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Menu item created successfully' },
        '400': { $ref: '#/components/responses/ValidationError' },
      },
    },
    get: {
      tags: ['Menu Management - Items'],
      summary: 'List menu items',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'categoryId', schema: { type: 'string', format: 'uuid' } },
        { in: 'query', name: 'search', schema: { type: 'string' } },
        { in: 'query', name: 'isActive', schema: { type: 'boolean' } },
        { in: 'query', name: 'isAvailable', schema: { type: 'boolean' } },
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
      ],
      responses: {
        '200': { description: 'List of menu items' },
      },
    },
  },
  '/api/v1/menu/items/{id}': {
    get: {
      tags: ['Menu Management - Items'],
      summary: 'Get menu item by ID',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Menu item details' },
        '404': { $ref: '#/components/responses/NotFoundError' },
      },
    },
    patch: {
      tags: ['Menu Management - Items'],
      summary: 'Update menu item',
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
                categoryId: { type: 'string', format: 'uuid' },
                itemCode: { type: 'string' },
                name: { type: 'string' },
                urduName: { type: 'string' },
                description: { type: 'string' },
                basePrice: { type: 'number' },
                taxRate: { type: 'number', nullable: true },
                sortOrder: { type: 'integer' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Item updated successfully' },
      },
    },
  },
  '/api/v1/menu/items/{id}/status': {
    patch: {
      tags: ['Menu Management - Items'],
      summary: 'Activate or deactivate menu item',
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
              required: ['isActive'],
              properties: { isActive: { type: 'boolean' } },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Item status updated' },
      },
    },
  },
  '/api/v1/menu/items/{id}/availability': {
    patch: {
      tags: ['Menu Management - Items'],
      summary: 'Set item 86 / availability',
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
              required: ['isAvailable'],
              properties: { isAvailable: { type: 'boolean' } },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Item availability updated' },
      },
    },
  },
  '/api/v1/menu/items/reorder': {
    put: {
      tags: ['Menu Management - Items'],
      summary: 'Batch reorder menu items',
      security: [{ bearerAuth: [] }],
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
                    required: ['id', 'sortOrder'],
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      sortOrder: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Items reordered' },
      },
    },
  },
  '/api/v1/menu/items/{itemId}/variants': {
    post: {
      tags: ['Menu Management - Variants'],
      summary: 'Create item variant',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'itemId', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'price'],
              properties: {
                name: { type: 'string', example: 'Small (10-inch)' },
                price: { type: 'number', example: 18.0 },
                sku: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Variant created' },
      },
    },
  },
  '/api/v1/menu/items/{itemId}/variants/{variantId}': {
    patch: {
      tags: ['Menu Management - Variants'],
      summary: 'Update item variant',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'itemId', required: true, schema: { type: 'string', format: 'uuid' } },
        {
          in: 'path',
          name: 'variantId',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                price: { type: 'number' },
                sku: { type: 'string' },
                isActive: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Variant updated' },
      },
    },
    delete: {
      tags: ['Menu Management - Variants'],
      summary: 'Delete item variant',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'itemId', required: true, schema: { type: 'string', format: 'uuid' } },
        {
          in: 'path',
          name: 'variantId',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      responses: {
        '200': { description: 'Variant deleted' },
      },
    },
  },
  '/api/v1/menu/items/{itemId}/modifier-groups': {
    post: {
      tags: ['Menu Management - Modifiers'],
      summary: 'Create modifier group for item',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'itemId', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', example: 'Crust Type' },
                minSelections: { type: 'integer', default: 0 },
                maxSelections: { type: 'integer', default: 1 },
                isRequired: { type: 'boolean', default: false },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Modifier group created' },
      },
    },
  },
  '/api/v1/menu/items/{itemId}/modifier-groups/{groupId}': {
    patch: {
      tags: ['Menu Management - Modifiers'],
      summary: 'Update modifier group',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'itemId', required: true, schema: { type: 'string', format: 'uuid' } },
        { in: 'path', name: 'groupId', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                minSelections: { type: 'integer' },
                maxSelections: { type: 'integer' },
                isRequired: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Modifier group updated' },
      },
    },
    delete: {
      tags: ['Menu Management - Modifiers'],
      summary: 'Delete modifier group',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'itemId', required: true, schema: { type: 'string', format: 'uuid' } },
        { in: 'path', name: 'groupId', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Modifier group deleted' },
      },
    },
  },
  '/api/v1/menu/items/{itemId}/modifier-groups/{groupId}/options': {
    post: {
      tags: ['Menu Management - Modifiers'],
      summary: 'Add option to modifier group',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'itemId', required: true, schema: { type: 'string', format: 'uuid' } },
        { in: 'path', name: 'groupId', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name', 'priceAdjustment'],
              properties: {
                name: { type: 'string', example: 'Stuffed Crust' },
                priceAdjustment: { type: 'number', example: 4.0 },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Option created' },
      },
    },
  },
  '/api/v1/menu/items/{itemId}/modifier-groups/{groupId}/options/{optionId}': {
    patch: {
      tags: ['Menu Management - Modifiers'],
      summary: 'Update modifier option',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'itemId', required: true, schema: { type: 'string', format: 'uuid' } },
        { in: 'path', name: 'groupId', required: true, schema: { type: 'string', format: 'uuid' } },
        {
          in: 'path',
          name: 'optionId',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                priceAdjustment: { type: 'number' },
                isAvailable: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Option updated' },
      },
    },
    delete: {
      tags: ['Menu Management - Modifiers'],
      summary: 'Delete modifier option',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'itemId', required: true, schema: { type: 'string', format: 'uuid' } },
        { in: 'path', name: 'groupId', required: true, schema: { type: 'string', format: 'uuid' } },
        {
          in: 'path',
          name: 'optionId',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      responses: {
        '200': { description: 'Option deleted' },
      },
    },
  },
};
