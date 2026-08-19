export const promotionsPaths = {
  // ---------------------------------------------------------------------------
  // Preview & Validate
  // ---------------------------------------------------------------------------
  '/api/v1/promotions/preview': {
    post: {
      tags: ['Discounts & Promotions'],
      summary: 'Preview applicable promotions for cart',
      description:
        'Simulates and calculates real-time discounts for a draft basket based on active automatic rules and optional promo codes.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['items'],
              properties: {
                orderType: {
                  type: 'string',
                  enum: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'],
                  example: 'DINE_IN',
                },
                customerId: { type: 'string', format: 'uuid', nullable: true },
                promoCode: { type: 'string', example: 'HAPPYHOUR' },
                items: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['menuItemId', 'quantity'],
                    properties: {
                      menuItemId: { type: 'string', format: 'uuid' },
                      variantId: { type: 'string', format: 'uuid', nullable: true },
                      quantity: { type: 'integer', example: 2 },
                      unitPrice: { type: 'number', example: 15.0 },
                      modifiersPrice: { type: 'number', example: 2.0 },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Preview calculation retrieved successfully' },
        '400': { description: 'Validation error' },
        '401': { description: 'Unauthorized' },
      },
    },
  },

  '/api/v1/promotions/validate-code': {
    post: {
      tags: ['Discounts & Promotions'],
      summary: 'Validate promo code',
      description:
        'Checks whether a promo code is valid, active, and applicable to current context.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['code'],
              properties: {
                code: { type: 'string', example: 'SUMMER20' },
                orderType: {
                  type: 'string',
                  enum: ['DINE_IN', 'TAKEAWAY', 'DELIVERY'],
                  default: 'DINE_IN',
                },
                customerId: { type: 'string', format: 'uuid', nullable: true },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Promo code is valid' },
        '400': { description: 'Promo code not applicable' },
        '404': { description: 'Promo code not found' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Core Promotion Management
  // ---------------------------------------------------------------------------
  '/api/v1/promotions': {
    get: {
      tags: ['Discounts & Promotions'],
      summary: 'List promotions',
      description:
        'Retrieves all promotional campaigns with pagination, type filtering, and search.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        {
          name: 'type',
          in: 'query',
          schema: {
            type: 'string',
            enum: ['PERCENTAGE', 'FIXED_AMOUNT', 'BUY_X_GET_Y', 'FREE_ITEM'],
          },
        },
        {
          name: 'targetType',
          in: 'query',
          schema: { type: 'string', enum: ['ORDER', 'ITEM', 'CATEGORY'] },
        },
        { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
        { name: 'isAutoApply', in: 'query', schema: { type: 'boolean' } },
      ],
      responses: {
        '200': { description: 'Promotions retrieved successfully' },
        '401': { description: 'Unauthorized' },
        '403': { description: 'Forbidden - requires promotions.view permission' },
      },
    },
    post: {
      tags: ['Discounts & Promotions'],
      summary: 'Create promotion',
      description: 'Creates a new promotional campaign or discount rule.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', example: 'Weekend 20% Off' },
                code: { type: 'string', example: 'WEEKEND20', nullable: true },
                description: { type: 'string', example: '20% off all orders during weekends' },
                type: {
                  type: 'string',
                  enum: ['PERCENTAGE', 'FIXED_AMOUNT', 'BUY_X_GET_Y', 'FREE_ITEM'],
                  default: 'PERCENTAGE',
                },
                targetType: {
                  type: 'string',
                  enum: ['ORDER', 'ITEM', 'CATEGORY'],
                  default: 'ORDER',
                },
                discountValue: { type: 'number', example: 20.0 },
                maxDiscountAmount: { type: 'number', example: 10.0, nullable: true },
                minOrderAmount: { type: 'number', example: 30.0, nullable: true },
                minQuantity: { type: 'integer', nullable: true },
                buyQuantity: { type: 'integer', nullable: true },
                getQuantity: { type: 'integer', nullable: true },
                getDiscountPercentage: { type: 'number', default: 100, nullable: true },
                orderTypes: { type: 'array', items: { type: 'string' }, nullable: true },
                daysOfWeek: { type: 'array', items: { type: 'integer' }, nullable: true },
                startDate: { type: 'string', format: 'date-time', nullable: true },
                endDate: { type: 'string', format: 'date-time', nullable: true },
                startTime: { type: 'string', example: '14:00', nullable: true },
                endTime: { type: 'string', example: '18:00', nullable: true },
                isActive: { type: 'boolean', default: true },
                isAutoApply: { type: 'boolean', default: false },
                isStackable: { type: 'boolean', default: false },
                priority: { type: 'integer', default: 0 },
                usageLimit: { type: 'integer', nullable: true },
                perCustomerLimit: { type: 'integer', nullable: true },
                menuItemIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
                categoryIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Promotion created successfully' },
        '400': { description: 'Validation error' },
        '401': { description: 'Unauthorized' },
        '403': { description: 'Forbidden - requires promotions.manage permission' },
      },
    },
  },

  '/api/v1/promotions/{id}': {
    get: {
      tags: ['Discounts & Promotions'],
      summary: 'Get promotion by ID',
      description: 'Retrieves promotion details, targeting configurations, and usage metrics.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Promotion retrieved successfully' },
        '404': { description: 'Promotion not found' },
      },
    },
    put: {
      tags: ['Discounts & Promotions'],
      summary: 'Update promotion',
      description: 'Modifies an existing promotion configuration.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object' } } },
      },
      responses: {
        '200': { description: 'Promotion updated successfully' },
        '404': { description: 'Promotion not found' },
      },
    },
    delete: {
      tags: ['Discounts & Promotions'],
      summary: 'Delete promotion',
      description: 'Removes a promotion from the restaurant catalog.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Promotion deleted successfully' },
        '404': { description: 'Promotion not found' },
      },
    },
  },

  '/api/v1/promotions/{id}/toggle-status': {
    patch: {
      tags: ['Discounts & Promotions'],
      summary: 'Toggle promotion active status',
      description: 'Quickly enables or disables a promotional campaign.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Status updated successfully' },
        '404': { description: 'Promotion not found' },
      },
    },
  },

  '/api/v1/promotions/{id}/usages': {
    get: {
      tags: ['Discounts & Promotions'],
      summary: 'List promotion redemption history',
      description: 'Retrieves all order transactions where this promotion was redeemed.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
      ],
      responses: {
        '200': { description: 'Usages retrieved successfully' },
        '404': { description: 'Promotion not found' },
      },
    },
  },
};
