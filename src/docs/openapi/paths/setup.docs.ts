export const setupPaths = {
  '/setup/status': {
    get: {
      tags: ['Setup'],
      summary: 'Check whether first-run setup is required',
      description:
        'Unauthenticated endpoint. Returns setupRequired=true when no restaurant exists yet.',
      responses: {
        '200': {
          description: 'Setup status',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  message: { type: 'string' },
                  data: {
                    type: 'object',
                    properties: {
                      setupRequired: { type: 'boolean' },
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
  '/setup': {
    post: {
      tags: ['Setup'],
      summary: 'Complete first-run restaurant and owner setup',
      description:
        'Creates the first restaurant, system roles, and OWNER admin. Rejected once any restaurant exists. Concurrent calls are serialized with a PostgreSQL advisory lock.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['restaurant', 'owner'],
              properties: {
                restaurant: {
                  type: 'object',
                  required: ['name', 'slug'],
                  properties: {
                    name: { type: 'string' },
                    slug: { type: 'string' },
                    legalName: { type: 'string' },
                    phone: { type: 'string' },
                    address: { type: 'string' },
                    currency: { type: 'string', example: 'PKR' },
                    timezone: { type: 'string', example: 'Asia/Karachi' },
                    taxRate: { type: 'number' },
                  },
                },
                owner: {
                  type: 'object',
                  required: ['name', 'username', 'pin', 'password'],
                  properties: {
                    name: { type: 'string' },
                    username: { type: 'string' },
                    phone: { type: 'string' },
                    pin: { type: 'string', description: '4–8 digit PIN' },
                    password: { type: 'string', minLength: 8 },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Setup completed' },
        '400': { description: 'Validation failed' },
        '409': { description: 'Setup already completed' },
      },
    },
  },
};
