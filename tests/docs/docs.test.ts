import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';

describe('Faraz POS - OpenAPI / Swagger Documentation Tests', () => {
  it('should serve Swagger UI HTML page at GET /api/docs/', async () => {
    const response = await request(app).get('/api/docs/');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('Faraz POS - API Documentation');
    expect(response.text).toContain('swagger-ui');
  });

  it('should redirect GET /api/docs to /api/docs/', async () => {
    const response = await request(app).get('/api/docs');

    // swagger-ui-express redirects /api/docs to /api/docs/ (301)
    expect([200, 301, 302]).toContain(response.status);
  });

  it('should serve the complete OpenAPI 3.0.3 JSON specification at GET /api/docs/json', async () => {
    const response = await request(app).get('/api/docs/json');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');

    const spec = response.body;
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.title).toBe('Faraz POS Backend API');
    expect(spec.info.version).toBe('0.1.0');
    expect(spec).toHaveProperty('paths');
    expect(spec).toHaveProperty('components');
    expect(spec.components).toHaveProperty('securitySchemes');
    expect(spec.components.securitySchemes).toHaveProperty('bearerAuth');

    // Verify all module paths exist in the spec
    const paths = Object.keys(spec.paths);

    // Health
    expect(paths).toContain('/health');
    expect(paths).toContain('/api/v1/health');

    // Auth
    expect(paths).toContain('/api/v1/auth/login');
    expect(paths).toContain('/api/v1/auth/refresh');
    expect(paths).toContain('/api/v1/auth/logout');
    expect(paths).toContain('/api/v1/auth/me');

    // Restaurant
    expect(paths).toContain('/api/v1/restaurant/config');

    // Staff
    expect(paths).toContain('/api/v1/staff');
    expect(paths).toContain('/api/v1/staff/{id}');
    expect(paths).toContain('/api/v1/staff/{id}/roles');
    expect(paths).toContain('/api/v1/staff/{id}/pin');

    // Menu
    expect(paths).toContain('/api/v1/menu/pos-catalog');
    expect(paths).toContain('/api/v1/menu/categories');
    expect(paths).toContain('/api/v1/menu/items');
    expect(paths).toContain('/api/v1/menu/items/{itemId}/variants');
    expect(paths).toContain('/api/v1/menu/items/{itemId}/modifier-groups');

    // Tables & Zones
    expect(paths).toContain('/api/v1/zones');
    expect(paths).toContain('/api/v1/tables');
    expect(paths).toContain('/api/v1/tables/floor-plan');
    expect(paths).toContain('/api/v1/tables/transfer');
    expect(paths).toContain('/api/v1/tables/merge');

    // Takeaway
    expect(paths).toContain('/api/v1/takeaway/orders');
    expect(paths).toContain('/api/v1/takeaway/orders/active');

    // Delivery & Customers
    expect(paths).toContain('/api/v1/customers');
    expect(paths).toContain('/api/v1/customers/lookup');
    expect(paths).toContain('/api/v1/delivery/orders');
    expect(paths).toContain('/api/v1/delivery/riders');
    expect(paths).toContain('/api/v1/delivery/zones');

    // Core Orders & Billing
    expect(paths).toContain('/api/v1/orders');
    expect(paths).toContain('/api/v1/orders/summary/daily');
    expect(paths).toContain('/api/v1/orders/{id}/items');
    expect(paths).toContain('/api/v1/orders/{id}/items/{itemId}/void');
    expect(paths).toContain('/api/v1/orders/{id}/discount');

    // Payments & Cash Drawer
    expect(paths).toContain('/api/v1/payments');
    expect(paths).toContain('/api/v1/payments/{id}/refund');
    expect(paths).toContain('/api/v1/payments/order/{orderId}');
    expect(paths).toContain('/api/v1/shifts/open');
    expect(paths).toContain('/api/v1/shifts/current');
    expect(paths).toContain('/api/v1/shifts/current/cash-drop');
    expect(paths).toContain('/api/v1/shifts/current/adjustment');
    expect(paths).toContain('/api/v1/shifts/current/close');
    expect(paths).toContain('/api/v1/shifts/{id}/summary');

    // Kitchen Operations & KDS
    expect(paths).toContain('/api/v1/kitchen/queue');
    expect(paths).toContain('/api/v1/kitchen/performance');
    expect(paths).toContain('/api/v1/kitchen/orders/{id}');
    expect(paths).toContain('/api/v1/kitchen/orders/{id}/status');
    expect(paths).toContain('/api/v1/kitchen/orders/{id}/recall');
    expect(paths).toContain('/api/v1/kitchen/orders/{orderId}/items/{itemId}/status');
    expect(paths).toContain('/api/v1/kitchen/orders/{orderId}/items/{itemId}/recall');
    expect(paths).toContain('/api/v1/kitchen/stations');
    expect(paths).toContain('/api/v1/kitchen/stations/{id}');

    // Receipt & Printing Management
    expect(paths).toContain('/api/v1/receipts/preview');
    expect(paths).toContain('/api/v1/receipts/orders/{orderId}/customer');
    expect(paths).toContain('/api/v1/receipts/orders/{orderId}/kitchen');
    expect(paths).toContain('/api/v1/receipts/orders/{orderId}/reprint');

    // Reporting & Analytics
    expect(paths).toContain('/api/v1/reports/sales-summary');
    expect(paths).toContain('/api/v1/reports/by-order-type');
    expect(paths).toContain('/api/v1/reports/by-payment-method');
    expect(paths).toContain('/api/v1/reports/items-ranking');
    expect(paths).toContain('/api/v1/reports/by-category');
    expect(paths).toContain('/api/v1/reports/financial-adjustments');
    expect(paths).toContain('/api/v1/reports/hourly-trends');
    expect(paths).toContain('/api/v1/reports/staff-performance');
    expect(paths).toContain('/api/v1/reports/shifts-summary');
    expect(paths).toContain('/api/v1/reports/operations-performance');

    // Inventory & Stock Management
    expect(paths).toContain('/api/v1/inventory/locations');
    expect(paths).toContain('/api/v1/inventory/locations/{id}');
    expect(paths).toContain('/api/v1/inventory/suppliers');
    expect(paths).toContain('/api/v1/inventory/suppliers/{id}');
    expect(paths).toContain('/api/v1/inventory/items');
    expect(paths).toContain('/api/v1/inventory/items/{id}');
    expect(paths).toContain('/api/v1/inventory/recipes');
    expect(paths).toContain('/api/v1/inventory/recipes/menu-item/{menuItemId}');
    expect(paths).toContain('/api/v1/inventory/recipes/{id}');
    expect(paths).toContain('/api/v1/inventory/purchases');
    expect(paths).toContain('/api/v1/inventory/purchases/{id}');
    expect(paths).toContain('/api/v1/inventory/adjustments');
    expect(paths).toContain('/api/v1/inventory/adjustments/{id}');
    expect(paths).toContain('/api/v1/inventory/wastage');
    expect(paths).toContain('/api/v1/inventory/wastage/{id}');
    expect(paths).toContain('/api/v1/inventory/transfers');
    expect(paths).toContain('/api/v1/inventory/transfers/{id}');
    expect(paths).toContain('/api/v1/inventory/ledger');
    expect(paths).toContain('/api/v1/inventory/summary');
    expect(paths).toContain('/api/v1/inventory/low-stock');
    expect(paths).toContain('/api/v1/inventory/valuation');

    // Discounts & Promotions
    expect(paths).toContain('/api/v1/promotions');
    expect(paths).toContain('/api/v1/promotions/{id}');
    expect(paths).toContain('/api/v1/promotions/{id}/toggle-status');
    expect(paths).toContain('/api/v1/promotions/{id}/usages');
    expect(paths).toContain('/api/v1/promotions/preview');
    expect(paths).toContain('/api/v1/promotions/validate-code');

    // Loyalty & Customer Rewards
    expect(paths).toContain('/api/v1/loyalty/program');
    expect(paths).toContain('/api/v1/loyalty/summary');
    expect(paths).toContain('/api/v1/loyalty/tiers');
    expect(paths).toContain('/api/v1/loyalty/tiers/{id}');
    expect(paths).toContain('/api/v1/loyalty/accounts');
    expect(paths).toContain('/api/v1/loyalty/customers/{customerId}');
    expect(paths).toContain('/api/v1/loyalty/enroll');
    expect(paths).toContain('/api/v1/loyalty/preview-redemption');
    expect(paths).toContain('/api/v1/loyalty/adjust');
    expect(paths).toContain('/api/v1/loyalty/transactions');
  });
});
