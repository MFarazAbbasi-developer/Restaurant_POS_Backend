import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

describe('Faraz POS - Restaurant Configuration Module Tests', () => {
  let restaurantId: string;
  let ownerAccessToken: string;
  let cashierAccessToken: string;

  beforeAll(async () => {
    // 1. Fetch default restaurant
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: 'faraz-flagship' },
    });
    if (!restaurant) {
      throw new Error('Database not seeded!');
    }
    restaurantId = restaurant.id;

    // 2. Login as Owner
    const ownerLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'owner_admin',
      pin: '1234',
    });
    ownerAccessToken = ownerLogin.body.data.accessToken;

    // 3. Login as Cashier
    const cashierLogin = await request(app).post('/api/v1/auth/login').send({
      username: 'cashier_sarah',
      pin: '4321',
    });
    cashierAccessToken = cashierLogin.body.data.accessToken;
  });

  afterAll(async () => {
    // Reset restaurant configurations to defaults
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        name: 'Faraz Flagship Bistro',
        legalName: 'Faraz Hospitality Group LLC',
        phone: '+1 (555) 019-2834',
        address: '100 Gourmet Avenue, Suite 10, New York, NY 10001',
        currency: 'USD',
        timezone: 'America/New_York',
        taxNumber: 'US-NYC-TAX-88901',
        taxRate: 8.875,
        taxInclusive: false,
        serviceChargeRate: 0,
        serviceChargeEnabled: false,
        dineInEnabled: true,
        takeawayEnabled: true,
        deliveryEnabled: true,
        receiptHeader: 'Welcome to Faraz Flagship Bistro!',
        receiptFooter: 'Thank you for dining with us! Please come again.',
      },
    });
  });

  describe('1. GET /api/v1/restaurant', () => {
    it('should retrieve current restaurant configuration for OWNER', async () => {
      const response = await request(app)
        .get('/api/v1/restaurant')
        .set('Authorization', `Bearer ${ownerAccessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Restaurant configuration retrieved successfully');
      expect(response.body.data.restaurant).toMatchObject({
        id: restaurantId,
        name: 'Faraz Flagship Bistro',
        slug: 'faraz-flagship',
        currency: 'USD',
        timezone: 'America/New_York',
        dineInEnabled: true,
        takeawayEnabled: true,
        deliveryEnabled: true,
      });
      expect(response.body.data.restaurant).toHaveProperty('taxRate');
      expect(response.body.data.restaurant).toHaveProperty('serviceChargeRate');
    });

    it('should reject unauthenticated request with 401', async () => {
      const response = await request(app).get('/api/v1/restaurant');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject user without settings.view permission (Cashier) with 403', async () => {
      const response = await request(app)
        .get('/api/v1/restaurant')
        .set('Authorization', `Bearer ${cashierAccessToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('2. PATCH /api/v1/restaurant', () => {
    it('should allow OWNER to update identity, billing, order types, and receipt headers', async () => {
      const updatePayload = {
        name: 'Faraz Grand Bistro & Lounge',
        legalName: 'Faraz Grand Hospitality Inc.',
        phone: '+1 (555) 999-0000',
        address: '200 Luxury Blvd, Penthouse 1, New York, NY 10002',
        taxNumber: 'TAX-998877-NY',
        taxRate: 10.5,
        taxInclusive: true,
        serviceChargeRate: 5.0,
        serviceChargeEnabled: true,
        dineInEnabled: true,
        takeawayEnabled: true,
        deliveryEnabled: false,
        receiptHeader: '*** FARAZ GRAND BISTRO ***\nTable for Champions',
        receiptFooter: 'Tips are appreciated. Follow us @farazgrand',
      };

      const response = await request(app)
        .patch('/api/v1/restaurant')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send(updatePayload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Restaurant configuration updated successfully');
      expect(response.body.data.restaurant).toMatchObject(updatePayload);

      // Verify AuditLog creation
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          restaurantId,
          action: 'RESTAURANT_SETTINGS_UPDATED',
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog?.entityType).toBe('RESTAURANT');
      expect(auditLog?.entityId).toBe(restaurantId);
      const metadata = auditLog?.metadata as { updatedFields?: string[] } | null;
      expect(metadata?.updatedFields).toContain('name');
      expect(metadata?.updatedFields).toContain('taxRate');
    });

    it('should reject update with invalid taxRate (> 100) with 400 validation error', async () => {
      const response = await request(app)
        .patch('/api/v1/restaurant')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          taxRate: 150, // invalid: > 100
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject update with invalid currency code with 400 validation error', async () => {
      const response = await request(app)
        .patch('/api/v1/restaurant')
        .set('Authorization', `Bearer ${ownerAccessToken}`)
        .send({
          currency: 'INVALID_CURRENCY',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject update from user without settings.manage permission (Cashier) with 403', async () => {
      const response = await request(app)
        .patch('/api/v1/restaurant')
        .set('Authorization', `Bearer ${cashierAccessToken}`)
        .send({
          name: 'Hacked Restaurant Name',
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });
});
