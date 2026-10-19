import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

describe('FARMAX POS - Reservations & Table Booking Management Module Tests', () => {
  let restaurantAId: string;
  let restaurantBId: string;

  let _ownerAToken: string;
  let managerAToken: string;
  let cashierAToken: string;
  let tenantBToken: string;

  let zoneIndoorId: string;
  let table2SeatsId: string;
  let table4SeatsId: string;
  let table6SeatsId: string;

  beforeAll(async () => {
    // 1. Create Dedicated Suite-Isolated Restaurant A
    const restaurantA = await prisma.restaurant.create({
      data: {
        name: 'Faraz Dining Flagship',
        slug: 'faraz-reservations-suite-' + Date.now(),
        currency: 'PKR',
      },
    });
    restaurantAId = restaurantA.id;

    // 2. Create Restaurant B for isolation tests
    const restaurantB = await prisma.restaurant.create({
      data: {
        name: 'Faraz Branch Res Test',
        slug: 'faraz-res-branch-' + Date.now(),
        currency: 'PKR',
      },
    });
    restaurantBId = restaurantB.id;

    const defaultPinHash = await bcrypt.hash('1234', 10);
    const cashierPinHash = await bcrypt.hash('4321', 10);

    const allPerms = await prisma.permission.findMany();

    // Create OWNER Role
    const ownerRole = await prisma.role.create({
      data: {
        restaurantId: restaurantAId,
        name: 'OWNER_' + Date.now(),
        rolePermissions: {
          create: allPerms.map((p) => ({ permissionId: p.id })),
        },
      },
    });

    // Create MANAGER Role (has reservations.*, tables.*)
    const managerRole = await prisma.role.create({
      data: {
        restaurantId: restaurantAId,
        name: 'MANAGER_' + Date.now(),
        rolePermissions: {
          create: allPerms
            .filter((p) =>
              [
                'tables.view',
                'tables.manage',
                'reservations.view',
                'reservations.manage',
                'reservations.status',
              ].includes(p.key),
            )
            .map((p) => ({ permissionId: p.id })),
        },
      },
    });

    // Create CASHIER Role (has reservations.view, reservations.manage, reservations.status)
    const cashierRole = await prisma.role.create({
      data: {
        restaurantId: restaurantAId,
        name: 'CASHIER_' + Date.now(),
        rolePermissions: {
          create: allPerms
            .filter((p) =>
              [
                'tables.view',
                'reservations.view',
                'reservations.manage',
                'reservations.status',
              ].includes(p.key),
            )
            .map((p) => ({ permissionId: p.id })),
        },
      },
    });

    // Create Users for Restaurant A
    const ownerUser = await prisma.user.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Res Owner',
        username: 'owner_res_' + Date.now(),
        pinHash: defaultPinHash,
        userRoles: { create: [{ roleId: ownerRole.id }] },
      },
    });

    const managerUser = await prisma.user.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Res Manager',
        username: 'manager_res_' + Date.now(),
        pinHash: defaultPinHash,
        userRoles: { create: [{ roleId: managerRole.id }] },
      },
    });

    const cashierUser = await prisma.user.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Res Host / Cashier',
        username: 'cashier_res_' + Date.now(),
        pinHash: cashierPinHash,
        userRoles: { create: [{ roleId: cashierRole.id }] },
      },
    });

    // Create OWNER Role for Tenant B
    const ownerBRole = await prisma.role.create({
      data: {
        restaurantId: restaurantBId,
        name: 'OWNER_B_' + Date.now(),
        rolePermissions: {
          create: allPerms.map((p) => ({ permissionId: p.id })),
        },
      },
    });

    const ownerBUser = await prisma.user.create({
      data: {
        restaurantId: restaurantBId,
        name: 'Tenant B Owner',
        username: 'tenant_b_res_' + Date.now(),
        pinHash: defaultPinHash,
        userRoles: { create: [{ roleId: ownerBRole.id }] },
      },
    });

    // Obtain JWT Tokens
    const ownerLogin = await request(app).post('/api/v1/auth/login').send({
      username: ownerUser.username,
      pin: '1234',
    });
    _ownerAToken = `Bearer ${ownerLogin.body.data.accessToken}`;

    const managerLogin = await request(app).post('/api/v1/auth/login').send({
      username: managerUser.username,
      pin: '1234',
    });
    managerAToken = `Bearer ${managerLogin.body.data.accessToken}`;

    const cashierLogin = await request(app).post('/api/v1/auth/login').send({
      username: cashierUser.username,
      pin: '4321',
    });
    cashierAToken = `Bearer ${cashierLogin.body.data.accessToken}`;

    const tenantBLogin = await request(app).post('/api/v1/auth/login').send({
      username: ownerBUser.username,
      pin: '1234',
    });
    tenantBToken = `Bearer ${tenantBLogin.body.data.accessToken}`;

    // Create Seating Zone and Tables
    const zoneIndoor = await prisma.zone.create({
      data: {
        restaurantId: restaurantAId,
        name: 'Main Dining Hall',
        sortOrder: 1,
      },
    });
    zoneIndoorId = zoneIndoor.id;

    const t2 = await prisma.restaurantTable.create({
      data: {
        restaurantId: restaurantAId,
        zoneId: zoneIndoorId,
        name: 'Table T-02 (2-Seat)',
        capacity: 2,
        status: 'AVAILABLE',
      },
    });
    table2SeatsId = t2.id;

    const t4 = await prisma.restaurantTable.create({
      data: {
        restaurantId: restaurantAId,
        zoneId: zoneIndoorId,
        name: 'Table T-04 (4-Seat)',
        capacity: 4,
        status: 'AVAILABLE',
      },
    });
    table4SeatsId = t4.id;

    const t6 = await prisma.restaurantTable.create({
      data: {
        restaurantId: restaurantAId,
        zoneId: zoneIndoorId,
        name: 'Table T-06 (6-Seat VIP)',
        capacity: 6,
        status: 'AVAILABLE',
      },
    });
    table6SeatsId = t6.id;
  });

  // ---------------------------------------------------------------------------
  // 1. Create Reservations
  // ---------------------------------------------------------------------------
  describe('Create Reservations', () => {
    it('should create reservation with unassigned table (POST /api/v1/reservations)', async () => {
      const res = await request(app)
        .post('/api/v1/reservations')
        .set('Authorization', cashierAToken)
        .send({
          customerName: 'Zainab Ahmed',
          customerPhone: '+923001112233',
          customerEmail: 'zainab@example.com',
          guestCount: 3,
          reservationDate: '2026-08-25',
          startTime: '19:30',
          durationMinutes: 90,
          specialRequests: 'Window side preferred, family dining',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const resv = res.body.data.reservation;
      expect(resv.reservationCode).toMatch(/^RES-20260825-\d{3}$/);
      expect(resv.customerName).toBe('Zainab Ahmed');
      expect(resv.guestCount).toBe(3);
      expect(resv.tableId).toBeNull();
      expect(resv.status).toBe('CONFIRMED');

      // Verify customer record was auto-linked
      expect(resv.customerId).toBeDefined();
    });

    it('should create reservation with an assigned table (POST /api/v1/reservations)', async () => {
      const res = await request(app)
        .post('/api/v1/reservations')
        .set('Authorization', cashierAToken)
        .send({
          customerName: 'Hamza Malik',
          customerPhone: '+923214445566',
          guestCount: 4,
          tableId: table4SeatsId,
          reservationDate: '2026-08-25',
          startTime: '20:00',
          durationMinutes: 120,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reservation.tableId).toBe(table4SeatsId);
      expect(res.body.data.reservation.guestCount).toBe(4);
    });

    it('should reject reservation if table capacity is insufficient (400)', async () => {
      const res = await request(app)
        .post('/api/v1/reservations')
        .set('Authorization', cashierAToken)
        .send({
          customerName: 'Large Party Group',
          customerPhone: '+923337778899',
          guestCount: 6,
          tableId: table2SeatsId, // Table capacity is only 2
          reservationDate: '2026-08-25',
          startTime: '20:00',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('capacity');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Conflict & Overlap Prevention (Double-Booking Guard)
  // ---------------------------------------------------------------------------
  describe('Double-Booking Conflict Prevention', () => {
    it('should reject booking the same table during an overlapping time window (409)', async () => {
      // Table 4 is already booked 20:00 - 22:00
      // Attempting to book Table 4 from 20:30 to 21:30 should fail
      const res = await request(app)
        .post('/api/v1/reservations')
        .set('Authorization', managerAToken)
        .send({
          customerName: 'Overlapping Guest',
          customerPhone: '+923459990011',
          guestCount: 2,
          tableId: table4SeatsId,
          reservationDate: '2026-08-25',
          startTime: '20:30',
          durationMinutes: 60,
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('already reserved');
    });

    it('should allow booking the same table outside the overlapping time window', async () => {
      // Table 4 is booked 20:00 - 22:00.
      // Booking from 18:00 to 19:30 should succeed
      const res = await request(app)
        .post('/api/v1/reservations')
        .set('Authorization', cashierAToken)
        .send({
          customerName: 'Early Dinner Guest',
          customerPhone: '+923001239876',
          guestCount: 2,
          tableId: table4SeatsId,
          reservationDate: '2026-08-25',
          startTime: '18:00',
          durationMinutes: 90,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reservation.tableId).toBe(table4SeatsId);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Availability Evaluation
  // ---------------------------------------------------------------------------
  describe('Table Availability Evaluation', () => {
    it('should return available and unavailable tables for requested window (GET /api/v1/reservations/availability)', async () => {
      const res = await request(app)
        .get('/api/v1/reservations/availability')
        .query({
          reservationDate: '2026-08-25',
          startTime: '20:30',
          durationMinutes: 60,
          guestCount: 4,
        })
        .set('Authorization', cashierAToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.availableTables).toBeDefined();
      expect(res.body.data.unavailableTables).toBeDefined();

      // Table 6 (6-Seat VIP) is available for 4 guests
      const availIds = res.body.data.availableTables.map((t: { id: string }) => t.id);
      expect(availIds).toContain(table6SeatsId);

      // Table 4 is booked at 20:30 -> in unavailable
      const unavailIds = res.body.data.unavailableTables.map((t: { id: string }) => t.id);
      expect(unavailIds).toContain(table4SeatsId);

      // Table 2 capacity (2) < requested (4) -> in unavailable
      expect(unavailIds).toContain(table2SeatsId);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Assign & Reassign Table
  // ---------------------------------------------------------------------------
  describe('Assign & Reassign Table', () => {
    let unassignedResId: string;

    beforeAll(async () => {
      const createRes = await request(app)
        .post('/api/v1/reservations')
        .set('Authorization', cashierAToken)
        .send({
          customerName: 'Sara Khan',
          customerPhone: '+923123456789',
          guestCount: 4,
          reservationDate: '2026-08-25',
          startTime: '21:00',
          durationMinutes: 90,
        });
      unassignedResId = createRes.body.data.reservation.id;
    });

    it('should assign suitable table to reservation (PUT /api/v1/reservations/:id/assign-table)', async () => {
      const res = await request(app)
        .put(`/api/v1/reservations/${unassignedResId}/assign-table`)
        .set('Authorization', cashierAToken)
        .send({
          tableId: table6SeatsId,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reservation.tableId).toBe(table6SeatsId);
    });

    it('should reject reassigning to an overlapping booked table (409)', async () => {
      // Table 4 is booked 20:00 - 22:00, which overlaps with this reservation (21:00 - 22:30)
      const res = await request(app)
        .put(`/api/v1/reservations/${unassignedResId}/assign-table`)
        .set('Authorization', managerAToken)
        .send({
          tableId: table4SeatsId,
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Update Reservation Details
  // ---------------------------------------------------------------------------
  describe('Update Reservation Details', () => {
    let testResId: string;

    beforeAll(async () => {
      const createRes = await request(app)
        .post('/api/v1/reservations')
        .set('Authorization', cashierAToken)
        .send({
          customerName: 'Imran Qureshi',
          customerPhone: '+923005556677',
          guestCount: 2,
          reservationDate: '2026-08-26',
          startTime: '19:00',
          durationMinutes: 60,
        });
      testResId = createRes.body.data.reservation.id;
    });

    it('should update guest count and special requests (PUT /api/v1/reservations/:id)', async () => {
      const res = await request(app)
        .put(`/api/v1/reservations/${testResId}`)
        .set('Authorization', cashierAToken)
        .send({
          guestCount: 3,
          specialRequests: 'Anniversary cake & flowers requested',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reservation.guestCount).toBe(3);
      expect(res.body.data.reservation.specialRequests).toBe(
        'Anniversary cake & flowers requested',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Lifecycle Status Transitions & Table Occupancy
  // ---------------------------------------------------------------------------
  describe('Lifecycle Status Transitions & Table Occupancy', () => {
    let lifecycleResId: string;
    let seatingTableId: string;

    beforeAll(async () => {
      const table = await prisma.restaurantTable.create({
        data: {
          restaurantId: restaurantAId,
          zoneId: zoneIndoorId,
          name: 'Table T-Lifecycle',
          capacity: 4,
          status: 'AVAILABLE',
        },
      });
      seatingTableId = table.id;

      const createRes = await request(app)
        .post('/api/v1/reservations')
        .set('Authorization', cashierAToken)
        .send({
          customerName: 'Usman Tariq',
          customerPhone: '+923229998877',
          guestCount: 2,
          tableId: seatingTableId,
          reservationDate: '2026-08-26',
          startTime: '20:00',
          durationMinutes: 90,
          status: 'CONFIRMED',
        });
      lifecycleResId = createRes.body.data.reservation.id;
    });

    it('should transition to SEATED and automatically update table status to OCCUPIED (PATCH /api/v1/reservations/:id/status)', async () => {
      const res = await request(app)
        .patch(`/api/v1/reservations/${lifecycleResId}/status`)
        .set('Authorization', cashierAToken)
        .send({ status: 'SEATED' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reservation.status).toBe('SEATED');
      expect(res.body.data.reservation.seatedAt).toBeDefined();

      // Verify table status is now OCCUPIED
      const table = await prisma.restaurantTable.findUnique({
        where: { id: seatingTableId },
      });
      expect(table?.status).toBe('OCCUPIED');
    });

    it('should transition to COMPLETED upon meal finish (PATCH /api/v1/reservations/:id/status)', async () => {
      const res = await request(app)
        .patch(`/api/v1/reservations/${lifecycleResId}/status`)
        .set('Authorization', cashierAToken)
        .send({ status: 'COMPLETED' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reservation.status).toBe('COMPLETED');
      expect(res.body.data.reservation.completedAt).toBeDefined();
    });

    it('should reject any further status transitions once COMPLETED (400)', async () => {
      const res = await request(app)
        .patch(`/api/v1/reservations/${lifecycleResId}/status`)
        .set('Authorization', cashierAToken)
        .send({ status: 'CANCELLED' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should cancel active reservation with reason (PATCH /api/v1/reservations/:id/status)', async () => {
      const newRes = await request(app)
        .post('/api/v1/reservations')
        .set('Authorization', cashierAToken)
        .send({
          customerName: 'Cancel Test Guest',
          customerPhone: '+923000000000',
          guestCount: 2,
          reservationDate: '2026-08-27',
          startTime: '19:00',
        });

      const cancelId = newRes.body.data.reservation.id;

      const cancelRes = await request(app)
        .patch(`/api/v1/reservations/${cancelId}/status`)
        .set('Authorization', cashierAToken)
        .send({
          status: 'CANCELLED',
          cancelReason: 'Customer unwell',
        });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.reservation.status).toBe('CANCELLED');
      expect(cancelRes.body.data.reservation.cancelReason).toBe('Customer unwell');
    });

    it('should record NO_SHOW for missed reservation (PATCH /api/v1/reservations/:id/status)', async () => {
      const newRes = await request(app)
        .post('/api/v1/reservations')
        .set('Authorization', cashierAToken)
        .send({
          customerName: 'No Show Guest',
          customerPhone: '+923000000001',
          guestCount: 2,
          reservationDate: '2026-08-27',
          startTime: '20:00',
        });

      const noShowId = newRes.body.data.reservation.id;

      const noShowRes = await request(app)
        .patch(`/api/v1/reservations/${noShowId}/status`)
        .set('Authorization', cashierAToken)
        .send({
          status: 'NO_SHOW',
        });

      expect(noShowRes.status).toBe(200);
      expect(noShowRes.body.data.reservation.status).toBe('NO_SHOW');
    });
  });

  // ---------------------------------------------------------------------------
  // 7. List, Search, and Pagination
  // ---------------------------------------------------------------------------
  describe('List, Filter, and Pagination', () => {
    it('should list reservations with date and status filters (GET /api/v1/reservations)', async () => {
      const res = await request(app)
        .get('/api/v1/reservations')
        .query({
          reservationDate: '2026-08-25',
          page: 1,
          limit: 10,
        })
        .set('Authorization', cashierAToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.pagination).toBeDefined();
    });

    it('should search reservations by customer name or phone (GET /api/v1/reservations)', async () => {
      const res = await request(app)
        .get('/api/v1/reservations')
        .query({
          search: 'Zainab',
        })
        .set('Authorization', cashierAToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(
        res.body.data.items.some((r: { customerName: string }) =>
          r.customerName.includes('Zainab'),
        ),
      ).toBe(true);
    });

    it('should get single reservation details by ID (GET /api/v1/reservations/:id)', async () => {
      const listRes = await request(app)
        .get('/api/v1/reservations')
        .set('Authorization', cashierAToken);

      const targetId = listRes.body.data.items[0].id;

      const res = await request(app)
        .get(`/api/v1/reservations/${targetId}`)
        .set('Authorization', cashierAToken);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reservation.id).toBe(targetId);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Multi-Tenant Isolation
  // ---------------------------------------------------------------------------
  describe('Multi-Tenant Isolation', () => {
    it('should prevent Tenant B from accessing Tenant A reservations (404)', async () => {
      const listRes = await request(app)
        .get('/api/v1/reservations')
        .set('Authorization', cashierAToken);

      const tenantAResId = listRes.body.data.items[0].id;

      const res = await request(app)
        .get(`/api/v1/reservations/${tenantAResId}`)
        .set('Authorization', tenantBToken);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
