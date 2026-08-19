export const tablesPaths = {
  '/api/v1/zones': {
    post: {
      tags: ['Tables & Zones - Seating Zones'],
      summary: 'Create seating zone',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', example: 'Family Hall' },
                code: { type: 'string', example: 'FH' },
                sortOrder: { type: 'integer', default: 0 },
              },
            },
          },
        },
      },
      responses: { '201': { description: 'Zone created' } },
    },
    get: {
      tags: ['Tables & Zones - Seating Zones'],
      summary: 'List seating zones',
      security: [{ bearerAuth: [] }],
      parameters: [{ in: 'query', name: 'isActive', schema: { type: 'boolean' } }],
      responses: { '200': { description: 'List of seating zones' } },
    },
  },
  '/api/v1/zones/{id}': {
    get: {
      tags: ['Tables & Zones - Seating Zones'],
      summary: 'Get zone by ID',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: { '200': { description: 'Zone details' } },
    },
    patch: {
      tags: ['Tables & Zones - Seating Zones'],
      summary: 'Update zone',
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
                code: { type: 'string' },
                sortOrder: { type: 'integer' },
                isActive: { type: 'boolean' },
              },
            },
          },
        },
      },
      responses: { '200': { description: 'Zone updated' } },
    },
    delete: {
      tags: ['Tables & Zones - Seating Zones'],
      summary: 'Delete zone',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: { '200': { description: 'Zone deleted' } },
    },
  },
  '/api/v1/tables': {
    post: {
      tags: ['Tables & Zones - Tables'],
      summary: 'Create dining table',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['zoneId', 'tableNumber', 'capacity'],
              properties: {
                zoneId: { type: 'string', format: 'uuid' },
                tableNumber: { type: 'string', example: 'T-05' },
                capacity: { type: 'integer', example: 4 },
                sortOrder: { type: 'integer', default: 0 },
              },
            },
          },
        },
      },
      responses: { '201': { description: 'Table created' } },
    },
    get: {
      tags: ['Tables & Zones - Tables'],
      summary: 'List dining tables',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'query', name: 'zoneId', schema: { type: 'string', format: 'uuid' } },
        { in: 'query', name: 'status', schema: { type: 'string' } },
        { in: 'query', name: 'isActive', schema: { type: 'boolean' } },
      ],
      responses: { '200': { description: 'List of tables' } },
    },
  },
  '/api/v1/tables/floor-plan': {
    get: {
      tags: ['Tables & Zones - Tables'],
      summary: 'Get real-time floor plan',
      security: [{ bearerAuth: [] }],
      description:
        'Returns all active seating zones with nested tables and their active real-time occupancy and order statuses.',
      responses: { '200': { description: 'Floor plan overview' } },
    },
  },
  '/api/v1/tables/{id}': {
    get: {
      tags: ['Tables & Zones - Tables'],
      summary: 'Get table details',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: { '200': { description: 'Table details with active orders' } },
    },
    patch: {
      tags: ['Tables & Zones - Tables'],
      summary: 'Update table info',
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
                tableNumber: { type: 'string' },
                capacity: { type: 'integer' },
                zoneId: { type: 'string', format: 'uuid' },
                sortOrder: { type: 'integer' },
              },
            },
          },
        },
      },
      responses: { '200': { description: 'Table updated' } },
    },
    delete: {
      tags: ['Tables & Zones - Tables'],
      summary: 'Delete table',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: { '200': { description: 'Table deleted' } },
    },
  },
  '/api/v1/tables/{id}/status': {
    patch: {
      tags: ['Tables & Zones - Tables'],
      summary: 'Update table occupancy status',
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
              required: ['status'],
              properties: {
                status: {
                  type: 'string',
                  enum: ['AVAILABLE', 'OCCUPIED', 'BILL_PRINTED', 'RESERVED', 'CLEANING'],
                },
              },
            },
          },
        },
      },
      responses: { '200': { description: 'Table status updated' } },
    },
  },
  '/api/v1/tables/transfer': {
    post: {
      tags: ['Tables & Zones - Operations'],
      summary: 'Transfer active table context',
      security: [{ bearerAuth: [] }],
      description:
        'Moves all active dining context and orders from one source table to an available destination table.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['sourceTableId', 'targetTableId'],
              properties: {
                sourceTableId: { type: 'string', format: 'uuid' },
                targetTableId: { type: 'string', format: 'uuid' },
                reason: { type: 'string' },
              },
            },
          },
        },
      },
      responses: { '200': { description: 'Table transferred successfully' } },
    },
  },
  '/api/v1/tables/merge': {
    post: {
      tags: ['Tables & Zones - Operations'],
      summary: 'Merge multiple tables',
      security: [{ bearerAuth: [] }],
      description:
        'Combines multiple physical tables under one primary parent table for large parties.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['primaryTableId', 'secondaryTableIds'],
              properties: {
                primaryTableId: { type: 'string', format: 'uuid' },
                secondaryTableIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
              },
            },
          },
        },
      },
      responses: { '200': { description: 'Tables merged' } },
    },
  },
  '/api/v1/tables/split': {
    post: {
      tags: ['Tables & Zones - Operations'],
      summary: 'Split/unmerge merged tables',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['primaryTableId'],
              properties: {
                primaryTableId: { type: 'string', format: 'uuid' },
              },
            },
          },
        },
      },
      responses: { '200': { description: 'Tables unmerged' } },
    },
  },
  '/api/v1/tables/{id}/orders': {
    post: {
      tags: ['Tables & Zones - Operations'],
      summary: 'Create independent sub-bill on table',
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
                subBillIndex: { type: 'integer', default: 1 },
                guestName: { type: 'string' },
                notes: { type: 'string' },
              },
            },
          },
        },
      },
      responses: { '201': { description: 'Sub-order created on table' } },
    },
    get: {
      tags: ['Tables & Zones - Operations'],
      summary: 'Get active orders on table',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: { '200': { description: 'List of active table orders' } },
    },
  },
};
