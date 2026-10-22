export const loyaltyPaths = {
  // ---------------------------------------------------------------------------
  // Program Configuration
  // ---------------------------------------------------------------------------
  '/api/v1/loyalty/program': {
    get: {
      tags: ['Loyalty & Customer Rewards'],
      summary: 'Get loyalty program configuration',
      description:
        'Retrieves active earning rates, redemption ratios, minimum thresholds, and rounding rules.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Loyalty program configuration retrieved successfully' },
        '401': { description: 'Unauthorized' },
      },
    },
    put: {
      tags: ['Loyalty & Customer Rewards'],
      summary: 'Update loyalty program configuration',
      description:
        'Modifies points earning ratios, redemption values, minimum balances, and expiration windows.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                isEnabled: { type: 'boolean', example: true },
                programName: { type: 'string', example: 'FARMAX VIP Rewards' },
                pointsPerCurrencyUnit: { type: 'number', example: 1.0 },
                redemptionRate: { type: 'number', example: 0.01 },
                minPointsToRedeem: { type: 'integer', example: 50 },
                maxPointsPerOrder: { type: 'integer', nullable: true, example: 500 },
                maxDiscountPercentage: { type: 'number', example: 50.0 },
                pointsExpiryDays: { type: 'integer', nullable: true, example: 365 },
                roundingMode: {
                  type: 'string',
                  enum: ['FLOOR', 'ROUND', 'CEIL'],
                  example: 'FLOOR',
                },
                minOrderSubtotal: { type: 'number', example: 10.0 },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Loyalty program updated successfully' },
        '400': { description: 'Validation error' },
        '403': { description: 'Forbidden - requires loyalty.manage permission' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Summary Analytics
  // ---------------------------------------------------------------------------
  '/api/v1/loyalty/summary': {
    get: {
      tags: ['Loyalty & Customer Rewards'],
      summary: 'Get loyalty program summary metrics',
      description:
        'Retrieves member counts, points issued/redeemed/active, and financial liability metrics.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Summary metrics retrieved successfully' },
        '401': { description: 'Unauthorized' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Tiers
  // ---------------------------------------------------------------------------
  '/api/v1/loyalty/tiers': {
    get: {
      tags: ['Loyalty & Customer Rewards'],
      summary: 'List loyalty tiers',
      description: 'Retrieves configured membership tiers and multiplier perks.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Loyalty tiers retrieved successfully' },
      },
    },
    post: {
      tags: ['Loyalty & Customer Rewards'],
      summary: 'Create loyalty tier',
      description:
        'Creates a new loyalty tier with qualification point threshold and point multiplier.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', example: 'Gold Tier' },
                minPoints: { type: 'integer', example: 1000 },
                multiplier: { type: 'number', example: 1.5 },
                discountPercentage: { type: 'number', example: 5.0 },
                color: { type: 'string', example: '#FFD700' },
                sortOrder: { type: 'integer', example: 2 },
                isActive: { type: 'boolean', default: true },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Loyalty tier created successfully' },
        '400': { description: 'Validation error' },
        '409': { description: 'Tier name already exists' },
      },
    },
  },

  '/api/v1/loyalty/tiers/{id}': {
    put: {
      tags: ['Loyalty & Customer Rewards'],
      summary: 'Update loyalty tier',
      description: 'Modifies an existing loyalty tier.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { type: 'object' } } },
      },
      responses: {
        '200': { description: 'Tier updated successfully' },
        '404': { description: 'Tier not found' },
      },
    },
    delete: {
      tags: ['Loyalty & Customer Rewards'],
      summary: 'Delete loyalty tier',
      description: 'Removes a loyalty tier.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Tier deleted successfully' },
        '404': { description: 'Tier not found' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Customer Accounts
  // ---------------------------------------------------------------------------
  '/api/v1/loyalty/accounts': {
    get: {
      tags: ['Loyalty & Customer Rewards'],
      summary: 'List customer loyalty accounts',
      description: 'Retrieves customer loyalty accounts with pagination, search, and tier filters.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'tierId', in: 'query', schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Accounts retrieved successfully' },
      },
    },
  },

  '/api/v1/loyalty/customers/{customerId}': {
    get: {
      tags: ['Loyalty & Customer Rewards'],
      summary: 'Get customer loyalty profile',
      description:
        'Retrieves current points balance, lifetime points, cash equivalent, and tier status for a customer.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'customerId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      responses: {
        '200': { description: 'Customer profile retrieved successfully' },
        '404': { description: 'Customer not found' },
      },
    },
  },

  '/api/v1/loyalty/enroll': {
    post: {
      tags: ['Loyalty & Customer Rewards'],
      summary: 'Enroll customer into loyalty program',
      description: 'Explicitly enrolls a customer with optional welcome bonus points.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['customerId'],
              properties: {
                customerId: { type: 'string', format: 'uuid' },
                initialPoints: { type: 'integer', default: 0 },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Customer enrolled successfully' },
        '404': { description: 'Customer not found' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Preview Redemption
  // ---------------------------------------------------------------------------
  '/api/v1/loyalty/preview-redemption': {
    post: {
      tags: ['Loyalty & Customer Rewards'],
      summary: 'Preview loyalty points redemption',
      description:
        'Calculates maximum eligible redemption points and resulting discount value for a cart subtotal.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['customerId', 'subtotal'],
              properties: {
                customerId: { type: 'string', format: 'uuid' },
                subtotal: { type: 'number', example: 50.0 },
                pointsToRedeem: { type: 'integer', example: 100 },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Redemption preview calculated successfully' },
        '400': { description: 'Validation or eligibility error' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Manual Adjustment
  // ---------------------------------------------------------------------------
  '/api/v1/loyalty/adjust': {
    post: {
      tags: ['Loyalty & Customer Rewards'],
      summary: 'Manual point adjustment',
      description:
        'Adds or deducts loyalty points from a customer account with manager PIN verification.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['customerId', 'points', 'reason'],
              properties: {
                customerId: { type: 'string', format: 'uuid' },
                points: { type: 'integer', example: 50 },
                reason: { type: 'string', example: 'Customer service compensation' },
                managerPin: { type: 'string', example: '1234' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Points adjusted successfully' },
        '400': { description: 'Validation error' },
        '403': { description: 'Forbidden - manager PIN or permission required' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Transaction Ledger
  // ---------------------------------------------------------------------------
  '/api/v1/loyalty/transactions': {
    get: {
      tags: ['Loyalty & Customer Rewards'],
      summary: 'List points transaction ledger',
      description:
        'Retrieves immutable audit ledger of points earned, redeemed, adjusted, and reversed.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        { name: 'customerId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        {
          name: 'type',
          in: 'query',
          schema: {
            type: 'string',
            enum: ['EARN', 'REDEEM', 'MANUAL_ADJUSTMENT', 'REFUND_REVERSAL', 'EXPIRY'],
          },
        },
      ],
      responses: {
        '200': { description: 'Transactions retrieved successfully' },
      },
    },
  },
};
