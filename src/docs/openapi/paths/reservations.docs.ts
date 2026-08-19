export const reservationsPaths = {
  // ---------------------------------------------------------------------------
  // List & Create Reservations
  // ---------------------------------------------------------------------------
  '/api/v1/reservations': {
    get: {
      tags: ['Reservations & Table Bookings'],
      summary: 'List reservations',
      description:
        'Retrieves table bookings with filters for date, status, table, customer, and search query.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        { name: 'reservationDate', in: 'query', schema: { type: 'string', example: '2026-08-20' } },
        { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
        { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date-time' } },
        {
          name: 'status',
          in: 'query',
          schema: {
            type: 'string',
            enum: ['PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
          },
        },
        { name: 'tableId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'customerId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'search', in: 'query', schema: { type: 'string' } },
      ],
      responses: {
        '200': { description: 'Reservations retrieved successfully' },
        '401': { description: 'Unauthorized' },
      },
    },
    post: {
      tags: ['Reservations & Table Bookings'],
      summary: 'Create reservation',
      description:
        'Creates a table reservation with overlap validation and automatic customer association.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['customerName', 'customerPhone', 'reservationDate', 'startTime'],
              properties: {
                customerName: { type: 'string', example: 'Bilal Khan' },
                customerPhone: { type: 'string', example: '+923001234567' },
                customerEmail: { type: 'string', format: 'email', example: 'bilal@example.com' },
                customerId: { type: 'string', format: 'uuid' },
                guestCount: { type: 'integer', default: 2, example: 4 },
                tableId: { type: 'string', format: 'uuid' },
                reservationDate: { type: 'string', example: '2026-08-20' },
                startTime: { type: 'string', example: '19:30' },
                durationMinutes: { type: 'integer', default: 90, example: 90 },
                status: { type: 'string', enum: ['PENDING', 'CONFIRMED'], default: 'CONFIRMED' },
                specialRequests: {
                  type: 'string',
                  example: 'Near window, birthday cake arrangement',
                },
              },
            },
          },
        },
      },
      responses: {
        '201': { description: 'Reservation created successfully' },
        '400': { description: 'Validation or capacity error' },
        '409': { description: 'Table is already booked during this time window' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Check Table Availability
  // ---------------------------------------------------------------------------
  '/api/v1/reservations/availability': {
    get: {
      tags: ['Reservations & Table Bookings'],
      summary: 'Check table availability',
      description: 'Finds available dining tables for a given date, time window, and guest count.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'reservationDate',
          in: 'query',
          required: true,
          schema: { type: 'string', example: '2026-08-20' },
        },
        {
          name: 'startTime',
          in: 'query',
          required: true,
          schema: { type: 'string', example: '20:00' },
        },
        { name: 'durationMinutes', in: 'query', schema: { type: 'integer', default: 90 } },
        { name: 'guestCount', in: 'query', schema: { type: 'integer', default: 2 } },
      ],
      responses: {
        '200': { description: 'Table availability evaluated successfully' },
        '400': { description: 'Validation error' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Get / Update Reservation by ID
  // ---------------------------------------------------------------------------
  '/api/v1/reservations/{id}': {
    get: {
      tags: ['Reservations & Table Bookings'],
      summary: 'Get reservation by ID',
      description: 'Retrieves complete reservation details including assigned table and customer.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Reservation retrieved successfully' },
        '404': { description: 'Reservation not found' },
      },
    },
    put: {
      tags: ['Reservations & Table Bookings'],
      summary: 'Update reservation',
      description:
        'Updates reservation time, guest count, customer contact, or special requests with conflict re-validation.',
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
                customerName: { type: 'string' },
                customerPhone: { type: 'string' },
                customerEmail: { type: 'string' },
                guestCount: { type: 'integer' },
                tableId: { type: 'string', format: 'uuid', nullable: true },
                reservationDate: { type: 'string' },
                startTime: { type: 'string' },
                durationMinutes: { type: 'integer' },
                specialRequests: { type: 'string', nullable: true },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Reservation updated successfully' },
        '400': { description: 'Validation error' },
        '404': { description: 'Reservation not found' },
        '409': { description: 'Table conflict with existing reservation' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Assign Table
  // ---------------------------------------------------------------------------
  '/api/v1/reservations/{id}/assign-table': {
    put: {
      tags: ['Reservations & Table Bookings'],
      summary: 'Assign or change table for reservation',
      description: 'Assigns a physical table with capacity and overlap conflict checks.',
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
              required: ['tableId'],
              properties: {
                tableId: { type: 'string', format: 'uuid' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Table assigned successfully' },
        '400': { description: 'Validation error' },
        '404': { description: 'Reservation or table not found' },
        '409': { description: 'Table conflict' },
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Status Transitions
  // ---------------------------------------------------------------------------
  '/api/v1/reservations/{id}/status': {
    patch: {
      tags: ['Reservations & Table Bookings'],
      summary: 'Transition reservation status',
      description:
        'Updates reservation lifecycle status (CONFIRMED, SEATED, COMPLETED, CANCELLED, NO_SHOW) and adjusts table occupancy.',
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
              required: ['status'],
              properties: {
                status: {
                  type: 'string',
                  enum: ['PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
                },
                cancelReason: { type: 'string', example: 'Customer called to cancel' },
              },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Status updated successfully' },
        '400': { description: 'Invalid transition' },
        '404': { description: 'Reservation not found' },
      },
    },
  },
};
