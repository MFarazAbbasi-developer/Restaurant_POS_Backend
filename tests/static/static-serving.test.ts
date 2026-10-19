import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import type { Application } from 'express';

// Mock prisma to avoid live database dependency
vi.mock('../../src/config/database.js', () => {
  return {
    prisma: {
      $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
      $connect: vi.fn().mockResolvedValue(undefined),
      $disconnect: vi.fn().mockResolvedValue(undefined),
    },
    connectDatabase: vi.fn().mockResolvedValue(undefined),
    disconnectDatabase: vi.fn().mockResolvedValue(undefined),
  };
});

describe('Static Frontend Serving & SPA Routing', () => {
  let app: Application;

  beforeAll(async () => {
    // Set STATIC_FILES_PATH to frontend dist
    process.env.STATIC_FILES_PATH = path.resolve(__dirname, '../../../Restaurant_POS_Frontend/dist');
    const appModule = await import('../../src/app.js');
    app = appModule.createApp();
  });

  it('GET / - should serve the React SPA index.html', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<div id="root"');
    expect(res.text).toContain('Faraz POS');
  });

  it.each(['/login', '/orders', '/tables', '/kitchen', '/settings'])(
    'GET %s - should fall back to index.html for client-side routing',
    async (route) => {
      const res = await request(app).get(route);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('<div id="root"');
    },
  );

  it('GET /api/v1/non-existent - should return JSON 404 and NOT index.html', async () => {
    const res = await request(app).get('/api/v1/non-existent');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body).toHaveProperty('success', false);
    expect(res.body.error).toHaveProperty('code', 'NOT_FOUND');
  });

  it('GET /api/unknown - should return JSON 404 and NOT index.html', async () => {
    const res = await request(app).get('/api/unknown');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body).toHaveProperty('success', false);
    expect(res.body.error).toHaveProperty('code', 'NOT_FOUND');
  });

  it('GET /health - should return JSON health status and NOT index.html', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body).toHaveProperty('success', true);
  });
});
