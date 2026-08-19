export const healthPaths = {
  '/health': {
    get: {
      tags: ['Health'],
      summary: 'Root liveness probe',
      description: 'Public health probe for container orchestration and load balancers.',
      responses: {
        '200': {
          description: 'Service is healthy',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
                      uptime: { type: 'number', example: 120.45 },
                      timestamp: { type: 'string', format: 'date-time' },
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
  '/api/v1/health': {
    get: {
      tags: ['Health'],
      summary: 'Detailed API health check',
      description:
        'Returns API operational status, database connectivity check, and server metrics.',
      responses: {
        '200': {
          description: 'API and database are fully operational',
        },
      },
    },
  },
};
