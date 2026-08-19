export const shiftsPaths = {
  '/api/v1/shifts/open': {
    post: {
      tags: ['Payments & Cash Management - Cash Drawer & Shifts'],
      summary: 'Open a new register shift',
      security: [{ bearerAuth: [] }],
      description:
        'Opens a cash register shift for the logged-in cashier with an opening float amount. Blocks opening multiple concurrent open shifts for the same cashier.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                openingCash: { type: 'number', default: 0, example: 100.0 },
                registerName: { type: 'string', default: 'Main Register', example: 'Counter 1' },
                notes: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Shift opened successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      shift: { $ref: '#/components/schemas/CashierShift' },
                    },
                  },
                },
              },
            },
          },
        },
        '409': { $ref: '#/components/responses/ConflictError' },
      },
    },
  },
  '/api/v1/shifts/current': {
    get: {
      tags: ['Payments & Cash Management - Cash Drawer & Shifts'],
      summary: 'Get active shift for cashier',
      security: [{ bearerAuth: [] }],
      description:
        'Retrieves current open shift with dynamic ledger-calculated expected drawer balance (`openingCash + cashSales - cashRefunds - cashDrops + adjustments`).',
      responses: {
        '200': {
          description: 'Current shift details',
        },
        '404': { $ref: '#/components/responses/NotFoundError' },
      },
    },
  },
  '/api/v1/shifts/current/cash-drop': {
    post: {
      tags: ['Payments & Cash Management - Cash Drawer & Shifts'],
      summary: 'Record cash drop / safe deposit',
      security: [{ bearerAuth: [] }],
      description:
        'Transfers excess cash from the register drawer to the back-office safe. Decreases current drawer balance and prevents dropping more cash than currently available.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['amount', 'reason'],
              properties: {
                amount: { type: 'number', example: 150.0 },
                reason: { type: 'string', minLength: 3, example: 'Periodic midday safe drop' },
                managerPin: { type: 'string', example: '5566' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Cash drop recorded' },
        '400': { $ref: '#/components/responses/BadRequestError' },
        '403': { $ref: '#/components/responses/ForbiddenError' },
      },
    },
  },
  '/api/v1/shifts/current/adjustment': {
    post: {
      tags: ['Payments & Cash Management - Cash Drawer & Shifts'],
      summary: 'Record cash adjustment (Pay In / Pay Out)',
      security: [{ bearerAuth: [] }],
      description:
        'Records manual cash movement into or out of the register (e.g. petty cash expense, change float top-up).',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['type', 'amount', 'reason'],
              properties: {
                type: { type: 'string', enum: ['PAY_IN', 'PAY_OUT'] },
                amount: { type: 'number', example: 25.0 },
                reason: {
                  type: 'string',
                  minLength: 3,
                  example: 'Petty cash for receipt paper rolls',
                },
                managerPin: { type: 'string', example: '5566' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Adjustment recorded' },
        '400': { $ref: '#/components/responses/BadRequestError' },
      },
    },
  },
  '/api/v1/shifts/current/close': {
    post: {
      tags: ['Payments & Cash Management - Cash Drawer & Shifts'],
      summary: 'Close and settle register shift',
      security: [{ bearerAuth: [] }],
      description:
        'Closes active register shift with physical counted cash amount. Computes ledger expected cash, registers cash variance, and locks the shift.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['actualClosingCash'],
              properties: {
                actualClosingCash: { type: 'number', example: 340.0 },
                closingNotes: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Shift closed and settled with final variance summary',
        },
        '404': { $ref: '#/components/responses/NotFoundError' },
      },
    },
  },
  '/api/v1/shifts/{id}/summary': {
    get: {
      tags: ['Payments & Cash Management - Cash Drawer & Shifts'],
      summary: 'Get shift settlement summary report',
      security: [{ bearerAuth: [] }],
      description:
        'Generates comprehensive settlement report showing breakdown by payment method, net sales, cash movements, and variance.',
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Settlement summary report' },
      },
    },
  },
  '/api/v1/shifts/{id}': {
    get: {
      tags: ['Payments & Cash Management - Cash Drawer & Shifts'],
      summary: 'Get shift details by ID',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Shift details' },
        '404': { $ref: '#/components/responses/NotFoundError' },
      },
    },
  },
  '/api/v1/shifts': {
    get: {
      tags: ['Payments & Cash Management - Cash Drawer & Shifts'],
      summary: 'List & filter shifts',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'cashierId', schema: { type: 'string', format: 'uuid' } },
        { in: 'query', name: 'status', schema: { type: 'string', enum: ['OPEN', 'CLOSED'] } },
        { in: 'query', name: 'businessDate', schema: { type: 'string' } },
        { in: 'query', name: 'startDate', schema: { type: 'string', format: 'date-time' } },
        { in: 'query', name: 'endDate', schema: { type: 'string', format: 'date-time' } },
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
      ],
      responses: {
        '200': { description: 'List of shifts' },
      },
    },
  },
};
