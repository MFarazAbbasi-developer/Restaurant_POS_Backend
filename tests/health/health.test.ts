import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

// Mock prisma queryRaw for the test environment to avoid requiring a live DB in unit/integration tests
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

describe('Health Check Endpoints', () => {
  beforeEach(() => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ 1: 1 }]);
  });

  it('GET /health - should return 200 OK with healthy status and metadata', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('message', 'FARMAX POS Backend is operational');
    expect(response.body.data).toHaveProperty('status', 'healthy');
    expect(response.body.data).toHaveProperty('timestamp');
    expect(response.body.data).toHaveProperty('uptime');
    expect(response.body.data.services.database).toHaveProperty('status', 'connected');
    expect(response.body.data.services.memory).toHaveProperty('heapUsedMb');
  });

  it('GET /api/v1/health - should also return 200 OK with operational data', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toHaveProperty('status', 'healthy');
  });

  it('GET /health - should return 503 when database ping fails (not mistaken for ready)', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error('Connection refused'));

    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body.data).toHaveProperty('status', 'unhealthy');
    expect(response.body.data.services.database).toHaveProperty('status', 'disconnected');
    expect(response.body.message).toMatch(/not ready/i);
  });

  it('GET /api/v1/non-existent-route - should return 404 with structured error', async () => {
    const response = await request(app).get('/api/v1/non-existent-route');

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('success', false);
    expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
    expect(response.body.error).toHaveProperty('message');
  });
});
