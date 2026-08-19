export const restaurantPaths = {
  '/api/v1/restaurant/config': {
    get: {
      tags: ['Restaurant Configuration'],
      summary: 'Get restaurant configuration',
      security: [{ bearerAuth: [] }],
      description:
        'Retrieves current restaurant profile, currency, enabled order types, tax configuration, service charge rates, and receipt formatting.',
      responses: {
        '200': {
          description: 'Configuration retrieved',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      config: { $ref: '#/components/schemas/RestaurantConfig' },
                    },
                  },
                },
              },
            },
          },
        },
        '401': { $ref: '#/components/responses/UnauthorizedError' },
        '403': { $ref: '#/components/responses/ForbiddenError' },
      },
    },
    patch: {
      tags: ['Restaurant Configuration'],
      summary: 'Update restaurant configuration',
      security: [{ bearerAuth: [] }],
      description:
        'Updates restaurant settings. Requires `settings.manage` permission. Emits an audit log on modification.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateRestaurantConfigInput' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Configuration updated successfully',
        },
        '400': { $ref: '#/components/responses/ValidationError' },
        '401': { $ref: '#/components/responses/UnauthorizedError' },
        '403': { $ref: '#/components/responses/ForbiddenError' },
      },
    },
  },
};
