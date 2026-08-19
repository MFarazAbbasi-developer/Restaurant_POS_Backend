export const standardResponses = {
  BadRequestError: {
    description: 'Bad Request - Invalid parameters, business rule violation, or malformed data',
    content: {
      'application/json': {
        schema: {
          $ref: '#/components/schemas/ApiErrorResponse',
        },
        example: {
          success: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'Invalid request parameters',
          },
        },
      },
    },
  },
  ValidationError: {
    description: 'Validation Error - Schema payload validation failed',
    content: {
      'application/json': {
        schema: {
          $ref: '#/components/schemas/ApiErrorResponse',
        },
        example: {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: [
              {
                field: 'username',
                message: 'Username is required',
              },
            ],
          },
        },
      },
    },
  },
  UnauthorizedError: {
    description: 'Unauthorized - Missing or invalid access token',
    content: {
      'application/json': {
        schema: {
          $ref: '#/components/schemas/ApiErrorResponse',
        },
        example: {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication token is required or expired',
          },
        },
      },
    },
  },
  ForbiddenError: {
    description: 'Forbidden - Insufficient permissions to perform operation',
    content: {
      'application/json': {
        schema: {
          $ref: '#/components/schemas/ApiErrorResponse',
        },
        example: {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Forbidden - insufficient permissions for this operation',
          },
        },
      },
    },
  },
  NotFoundError: {
    description: 'Not Found - The requested resource was not found',
    content: {
      'application/json': {
        schema: {
          $ref: '#/components/schemas/ApiErrorResponse',
        },
        example: {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Resource not found',
          },
        },
      },
    },
  },
  ConflictError: {
    description: 'Conflict - Resource already exists or concurrent conflict occurred',
    content: {
      'application/json': {
        schema: {
          $ref: '#/components/schemas/ApiErrorResponse',
        },
        example: {
          success: false,
          error: {
            code: 'CONFLICT',
            message: 'A resource with this identifier already exists',
          },
        },
      },
    },
  },
  InternalServerError: {
    description: 'Internal Server Error - Unexpected server condition',
    content: {
      'application/json': {
        schema: {
          $ref: '#/components/schemas/ApiErrorResponse',
        },
        example: {
          success: false,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected internal server error occurred',
          },
        },
      },
    },
  },
};
