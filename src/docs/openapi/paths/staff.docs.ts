export const staffPaths = {
  '/api/v1/staff': {
    post: {
      tags: ['Staff Management'],
      summary: 'Create new staff member',
      security: [{ bearerAuth: [] }],
      description:
        'Creates a new staff account with a numeric PIN and assigned role(s). Requires `staff.manage` permission.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateStaffInput' },
          },
        },
      },
      responses: {
        '201': {
          description: 'Staff member created successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      staff: { $ref: '#/components/schemas/StaffMember' },
                    },
                  },
                },
              },
            },
          },
        },
        '400': { $ref: '#/components/responses/ValidationError' },
        '401': { $ref: '#/components/responses/UnauthorizedError' },
        '403': { $ref: '#/components/responses/ForbiddenError' },
        '409': { $ref: '#/components/responses/ConflictError' },
      },
    },
    get: {
      tags: ['Staff Management'],
      summary: 'List staff members',
      security: [{ bearerAuth: [] }],
      description:
        'Lists all staff members for the restaurant with pagination and filtering. Requires `staff.view` permission.',
      parameters: [
        { in: 'query', name: 'search', schema: { type: 'string' } },
        { in: 'query', name: 'role', schema: { type: 'string' } },
        { in: 'query', name: 'isActive', schema: { type: 'boolean' } },
        { in: 'query', name: 'page', schema: { type: 'integer', default: 1 } },
        { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
      ],
      responses: {
        '200': {
          description: 'List of staff members retrieved',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: {
                    type: 'object',
                    properties: {
                      staff: { type: 'array', items: { $ref: '#/components/schemas/StaffMember' } },
                      pagination: { $ref: '#/components/schemas/PaginationMeta' },
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
  },
  '/api/v1/staff/{id}': {
    get: {
      tags: ['Staff Management'],
      summary: 'Get staff member by ID',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Staff member details' },
        '404': { $ref: '#/components/responses/NotFoundError' },
      },
    },
    patch: {
      tags: ['Staff Management'],
      summary: 'Update staff details',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                phone: { type: 'string' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Staff updated successfully' },
        '404': { $ref: '#/components/responses/NotFoundError' },
      },
    },
  },
  '/api/v1/staff/{id}/status': {
    patch: {
      tags: ['Staff Management'],
      summary: 'Activate or deactivate staff',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['isActive'],
              properties: { isActive: { type: 'boolean' } },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Staff status updated' },
        '404': { $ref: '#/components/responses/NotFoundError' },
      },
    },
  },
  '/api/v1/staff/{id}/roles': {
    put: {
      tags: ['Staff Management'],
      summary: 'Assign roles to staff member',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['roleIds'],
              properties: { roleIds: { type: 'array', items: { type: 'string', format: 'uuid' } } },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Staff roles updated successfully' },
      },
    },
  },
  '/api/v1/staff/{id}/pin': {
    post: {
      tags: ['Staff Management'],
      summary: 'Reset or update staff PIN',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['pin'],
              properties: { pin: { type: 'string', minLength: 4, maxLength: 6 } },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Staff PIN changed successfully' },
      },
    },
  },
};
