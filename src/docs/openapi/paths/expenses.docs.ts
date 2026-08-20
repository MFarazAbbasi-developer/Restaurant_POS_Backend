export const expensesPaths = {
  // ===========================================================================
  // Expense Categories
  // ===========================================================================
  '/api/v1/expenses/categories': {
    get: {
      tags: ['Expenses & Expense Management'],
      summary: 'List expense categories',
      description:
        'Retrieves all restaurant expense categories with optional search and active status filter.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
        { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
      ],
      responses: {
        '200': { description: 'Expense categories retrieved successfully' },
        '401': { description: 'Unauthorized' },
      },
    },
    post: {
      tags: ['Expenses & Expense Management'],
      summary: 'Create expense category',
      description: 'Registers a new operational expense category.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', example: 'Generator Fuel & Electricity' },
                description: {
                  type: 'string',
                  example: 'Diesel for backup generator and utility bills',
                },
                isActive: { type: 'boolean', default: true },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Expense category created successfully' },
        '409': { description: 'Category name already exists' },
      },
    },
  },

  '/api/v1/expenses/categories/{id}': {
    get: {
      tags: ['Expenses & Expense Management'],
      summary: 'Get expense category details',
      description: 'Retrieves category details, expense count, and recent expenses.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Expense category details retrieved successfully' },
        '404': { description: 'Expense category not found' },
      },
    },
    put: {
      tags: ['Expenses & Expense Management'],
      summary: 'Update expense category',
      description: 'Updates expense category name, description, or active status.',
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
                description: { type: 'string' },
                isActive: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Expense category updated successfully' },
        '404': { description: 'Expense category not found' },
      },
    },
    delete: {
      tags: ['Expenses & Expense Management'],
      summary: 'Deactivate expense category',
      description: 'Soft-deactivates an expense category.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Expense category deactivated successfully' },
        '404': { description: 'Expense category not found' },
      },
    },
  },

  // ===========================================================================
  // Summary & Analytics
  // ===========================================================================
  '/api/v1/expenses/summary': {
    get: {
      tags: ['Expenses & Expense Management'],
      summary: 'Get expense summary analytics',
      description:
        'Returns aggregated expense figures grouped by category, payment method, and daily breakdown.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'businessDate', in: 'query', schema: { type: 'string', example: '2026-08-20' } },
        { name: 'categoryId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        {
          name: 'paymentMethod',
          in: 'query',
          schema: {
            type: 'string',
            enum: ['CASH', 'CARD', 'BANK_TRANSFER', 'DIGITAL_WALLET', 'OTHER'],
          },
        },
        { name: 'supplierId', in: 'query', schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Expense summary retrieved successfully' },
      },
    },
  },

  // ===========================================================================
  // Expenses Operations
  // ===========================================================================
  '/api/v1/expenses': {
    get: {
      tags: ['Expenses & Expense Management'],
      summary: 'List expenses',
      description:
        'Lists expenses with filters for date range, category, payment method, status, supplier, and shift.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'businessDate', in: 'query', schema: { type: 'string' } },
        { name: 'categoryId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        {
          name: 'paymentMethod',
          in: 'query',
          schema: {
            type: 'string',
            enum: ['CASH', 'CARD', 'BANK_TRANSFER', 'DIGITAL_WALLET', 'OTHER'],
          },
        },
        { name: 'status', in: 'query', schema: { type: 'string', enum: ['RECORDED', 'VOIDED'] } },
        { name: 'supplierId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'shiftId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
      ],
      responses: {
        '200': { description: 'Expenses retrieved successfully' },
      },
    },
    post: {
      tags: ['Expenses & Expense Management'],
      summary: 'Record new expense',
      description:
        'Records an operational expense. Cash expenses automatically synchronize with and deduct from the active cashier register shift drawer.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['categoryId', 'amount', 'description'],
              properties: {
                categoryId: { type: 'string', format: 'uuid' },
                amount: { type: 'number', example: 2500 },
                paymentMethod: {
                  type: 'string',
                  enum: ['CASH', 'CARD', 'BANK_TRANSFER', 'DIGITAL_WALLET', 'OTHER'],
                  default: 'CASH',
                },
                description: {
                  type: 'string',
                  example: 'Emergency purchase of cooking oil & paper towels',
                },
                date: { type: 'string', format: 'date-time' },
                businessDate: { type: 'string', example: '2026-08-20' },
                supplierId: { type: 'string', format: 'uuid' },
                shiftId: { type: 'string', format: 'uuid' },
                reference: { type: 'string', example: 'RCP-88902' },
                receiptUrl: {
                  type: 'string',
                  example: 'https://storage.example.com/receipts/88902.jpg',
                },
                notes: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Expense recorded successfully' },
        '400': { description: 'Validation error' },
      },
    },
  },

  '/api/v1/expenses/{id}': {
    get: {
      tags: ['Expenses & Expense Management'],
      summary: 'Get expense details',
      description:
        'Retrieves complete expense record including category, supplier, cashier shift, and creator information.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Expense details retrieved successfully' },
        '404': { description: 'Expense not found' },
      },
    },
    put: {
      tags: ['Expenses & Expense Management'],
      summary: 'Update expense',
      description:
        'Updates notes, reference, receiptUrl, description, or category for a non-voided expense.',
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
                categoryId: { type: 'string', format: 'uuid' },
                description: { type: 'string' },
                reference: { type: 'string' },
                receiptUrl: { type: 'string' },
                notes: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Expense updated successfully' },
        '400': { description: 'Cannot update voided expense' },
        '404': { description: 'Expense not found' },
      },
    },
  },

  '/api/v1/expenses/{id}/void': {
    post: {
      tags: ['Expenses & Expense Management'],
      summary: 'Void / reverse expense',
      description:
        'Voids an expense record. For cash expenses linked to an active shift, the cash amount is reimbursed back to the shift ledger.',
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
              required: ['reason'],
              properties: {
                reason: { type: 'string', example: 'Duplicate entry / vendor returned cash' },
                managerPin: { type: 'string', example: '2233' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Expense voided successfully' },
        '400': { description: 'Expense already voided' },
        '403': { description: 'Manager authorization required' },
        '404': { description: 'Expense not found' },
      },
    },
  },
};
