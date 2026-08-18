import { beforeAll, afterAll } from 'vitest';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '5001';
  process.env.LOG_LEVEL = 'fatal'; // suppress noisy logs during tests
  process.env.JWT_ACCESS_SECRET = 'faraz-pos-test-jwt-secret-key-32chars-long';
  process.env.JWT_ACCESS_EXPIRES_IN = '15m';
});

afterAll(async () => {
  // Clean up global handlers or connections if any
});
