export const healthPaths = {
  '/health': {
    get: {
      tags: ['Health'],
      summary: 'Root readiness probe',
      description:
        'Public readiness probe. Returns HTTP 200 only when the database is connected. Database failures return HTTP 503 so callers cannot mistake an unready app for healthy.',
      responses: {
        '200': {
          description: 'Service and database are healthy',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'healthy' },
                      uptime: { type: 'number', example: 120 },
                      timestamp: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
        },
        '503': {
          description: 'Database unavailable — application is not ready',
        },
      },
    },
  },
  '/api/v1/health': {
    get: {
      tags: ['Health'],
      summary: 'Detailed API health check',
      description:
        'Returns API operational status, database connectivity check, and server metrics. HTTP 503 when the database is disconnected.',
      responses: {
        '200': {
          description: 'API and database are fully operational',
        },
        '503': {
          description: 'Database unavailable — application is not ready',
        },
      },
    },
  },
};
