export const paymentsPaths = {
  '/api/v1/payments': {
    post: {
      tags: ['Payments & Cash Management - Payments'],
      summary: 'Process payment for an order',
      security: [{ bearerAuth: [] }],
      description:
        'Records a payment (CASH, CARD, BANK_TRANSFER, DIGITAL_WALLET, OTHER) against an active order. Handles exact change calculation for cash, split payments, active cashier shift linking, and transactional order payment status progression (`UNPAID` -> `PARTIALLY_PAID` -> `PAID`).',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['orderId', 'paymentMethod', 'amount'],
              properties: {
                orderId: { type: 'string', format: 'uuid' },
                paymentMethod: {
                  type: 'string',
                  enum: ['CASH', 'CARD', 'BANK_TRANSFER', 'DIGITAL_WALLET', 'OTHER'],
                },
                amount: { type: 'number', example: 50.0 },
                amountTendered: {
                  type: 'number',
                  example: 60.0,
                  description: 'Required for cash change calculation if higher than payment amount',
                },
                reference: {
                  type: 'string',
                  description: 'Transaction / authorization reference code',
                },
                cardLast4: { type: 'string', example: '4242' },
                cardBrand: { type: 'string', example: 'VISA' },
                notes: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Payment processed and recorded successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      payment: { $ref: '#/components/schemas/Payment' },
                    },
                  },
                },
              },
            },
          },
        },
        '400': { $ref: '#/components/responses/ValidationError' },
        '401': { $ref: '#/components/responses/UnauthorizedError' },
        '409': { $ref: '#/components/responses/ConflictError' },
      },
    },
    get: {
      tags: ['Payments & Cash Management - Payments'],
      summary: 'List & filter payments',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'orderId', schema: { type: 'string', format: 'uuid' } },
        { in: 'query', name: 'paymentMethod', schema: { type: 'string' } },
        { in: 'query', name: 'status', schema: { type: 'string' } },
        { in: 'query', name: 'shiftId', schema: { type: 'string', format: 'uuid' } },
        { in: 'query', name: 'startDate', schema: { type: 'string', format: 'date-time' } },
        { in: 'query', name: 'endDate', schema: { type: 'string', format: 'date-time' } },
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
      ],
      responses: {
        '200': { description: 'List of payments' },
      },
    },
  },
  '/api/v1/payments/order/{orderId}': {
    get: {
      tags: ['Payments & Cash Management - Payments'],
      summary: 'Get payment summary for an order',
      security: [{ bearerAuth: [] }],
      description:
        'Returns all payments, refunds, outstanding balance, and overall payment status for a specific order.',
      parameters: [
        { in: 'path', name: 'orderId', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Order payments summary' },
      },
    },
  },
  '/api/v1/payments/{id}': {
    get: {
      tags: ['Payments & Cash Management - Payments'],
      summary: 'Get payment details by ID',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Payment details' },
        '404': { $ref: '#/components/responses/NotFoundError' },
      },
    },
  },
  '/api/v1/payments/{id}/refund': {
    post: {
      tags: ['Payments & Cash Management - Payments'],
      summary: 'Process partial or full refund',
      security: [{ bearerAuth: [] }],
      description:
        'Refunds a payment with mandatory reason. Requires `payments.refund` permission or manager PIN override (`managerPin`). Adjusts shift cash refunds and updates order payment status.',
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['amount', 'reason'],
              properties: {
                amount: { type: 'number', example: 20.0 },
                reason: { type: 'string', minLength: 3, example: 'Customer returned item' },
                managerPin: { type: 'string', example: '5566' },
                refundMethod: {
                  type: 'string',
                  enum: ['CASH', 'CARD', 'BANK_TRANSFER', 'DIGITAL_WALLET', 'OTHER'],
                },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Refund processed successfully' },
        '400': { $ref: '#/components/responses/BadRequestError' },
        '403': { $ref: '#/components/responses/ForbiddenError' },
      },
    },
  },
};
