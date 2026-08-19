export const authPaths = {
  '/api/v1/auth/login': {
    post: {
      tags: ['Authentication'],
      summary: 'Authenticate with PIN',
      description:
        'Authenticates a staff member using their restaurant username and numeric PIN. Returns a short-lived access token and a refresh token cookie/payload.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/LoginRequest' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Login successful',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      user: { $ref: '#/components/schemas/AuthUser' },
                      accessToken: { type: 'string' },
                      refreshToken: { type: 'string' },
                      expiresIn: { type: 'string', example: '15m' },
                    },
                  },
                },
              },
            },
          },
        },
        '400': { $ref: '#/components/responses/ValidationError' },
        '401': { $ref: '#/components/responses/UnauthorizedError' },
      },
    },
  },
  '/api/v1/auth/refresh': {
    post: {
      tags: ['Authentication'],
      summary: 'Refresh access token',
      description: 'Generates a new JWT access token using a valid, non-revoked refresh token.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/RefreshTokenRequest' },
          },
        },
      },
      responses: {
        '200': {
          description: 'Access token refreshed successfully',
        },
        '401': { $ref: '#/components/responses/UnauthorizedError' },
      },
    },
  },
  '/api/v1/auth/logout': {
    post: {
      tags: ['Authentication'],
      summary: 'Log out current session',
      security: [{ bearerAuth: [] }],
      description: 'Revokes the current active session associated with the bearer token.',
      responses: {
        '200': { description: 'Logged out successfully' },
        '401': { $ref: '#/components/responses/UnauthorizedError' },
      },
    },
  },
  '/api/v1/auth/logout-all': {
    post: {
      tags: ['Authentication'],
      summary: 'Log out all sessions',
      security: [{ bearerAuth: [] }],
      description:
        'Revokes all active sessions and refresh tokens across all devices for the logged-in user.',
      responses: {
        '200': { description: 'All sessions revoked successfully' },
        '401': { $ref: '#/components/responses/UnauthorizedError' },
      },
    },
  },
  '/api/v1/auth/me': {
    get: {
      tags: ['Authentication'],
      summary: 'Get current user profile',
      security: [{ bearerAuth: [] }],
      description:
        'Returns profile, roles, and effective granular permissions for the currently authenticated user.',
      responses: {
        '200': {
          description: 'Current user retrieved successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      user: { $ref: '#/components/schemas/AuthUser' },
                    },
                  },
                },
              },
            },
          },
        },
        '401': { $ref: '#/components/responses/UnauthorizedError' },
      },
    },
  },
};
