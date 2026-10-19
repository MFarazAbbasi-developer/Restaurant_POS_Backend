import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

const SETUP_PAYLOAD = {
  restaurant: {
    name: 'First Run Cafe',
    slug: 'first-run-cafe',
    phone: '+920000000000',
    address: '1 Setup Street',
    currency: 'PKR',
    timezone: 'Asia/Karachi',
    taxRate: 16,
  },
  owner: {
    name: 'Setup Owner',
    username: 'setup_owner',
    pin: '2468',
    password: 'SecureOwnerPass1!',
    phone: '+921111111111',
  },
};

async function wipeBusinessData(): Promise<void> {
  // Keep permission catalog; remove tenant data so setup can run again.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "user_roles",
      "role_permissions",
      "sessions",
      "audit_logs",
      "users",
      "roles",
      "restaurants"
    CASCADE;
  `);
}

/**
 * These tests TRUNCATE tenant tables. They must not run in parallel with
 * demo-seed-dependent suites against a shared database.
 *
 * Run explicitly:
 *   ALLOW_SETUP_DB_WIPE=1 npm run test:setup
 * against a disposable DATABASE_URL only.
 */
const setupWipeAllowed = process.env.ALLOW_SETUP_DB_WIPE === '1';

describe.runIf(setupWipeAllowed)('FARMAX POS - First-Run Setup Module', () => {
  beforeAll(async () => {
    await wipeBusinessData();
  });

  beforeEach(async () => {
    await wipeBusinessData();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('reports setupRequired=true on a fresh database with no restaurants', async () => {
    const res = await request(app).get('/api/v1/setup/status');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.setupRequired).toBe(true);
  });

  it('rejects invalid setup payloads with validation errors', async () => {
    const res = await request(app).post('/api/v1/setup').send({
      restaurant: { name: '', slug: 'BAD SLUG' },
      owner: { name: 'X', username: 'ab', pin: '12', password: 'short' },
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.restaurant.count()).toBe(0);
  });

  it('creates exactly one restaurant and one OWNER admin with hashed credentials', async () => {
    const res = await request(app).post('/api/v1/setup').send(SETUP_PAYLOAD);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.restaurant).toMatchObject({
      name: 'First Run Cafe',
      slug: 'first-run-cafe',
      currency: 'PKR',
      timezone: 'Asia/Karachi',
    });
    expect(res.body.data.owner).toMatchObject({
      name: 'Setup Owner',
      username: 'setup_owner',
    });
    expect(res.body.data.owner).not.toHaveProperty('pinHash');
    expect(res.body.data.owner).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain(SETUP_PAYLOAD.owner.password);
    expect(JSON.stringify(res.body)).not.toContain(SETUP_PAYLOAD.owner.pin);

    expect(await prisma.restaurant.count()).toBe(1);
    expect(await prisma.user.count()).toBe(1);

    const owner = await prisma.user.findFirst({
      include: {
        userRoles: { include: { role: true } },
      },
    });
    expect(owner).not.toBeNull();
    expect(owner!.userRoles.map((ur) => ur.role.name)).toContain('OWNER');
    expect(owner!.pinHash).not.toBe(SETUP_PAYLOAD.owner.pin);
    expect(owner!.passwordHash).not.toBe(SETUP_PAYLOAD.owner.password);
    expect(await bcrypt.compare(SETUP_PAYLOAD.owner.pin, owner!.pinHash)).toBe(true);
    expect(await bcrypt.compare(SETUP_PAYLOAD.owner.password, owner!.passwordHash!)).toBe(true);

    const status = await request(app).get('/api/v1/setup/status');
    expect(status.body.data.setupRequired).toBe(false);

    // Owner can log in with PIN
    const login = await request(app).post('/api/v1/auth/login').send({
      username: 'setup_owner',
      pin: '2468',
    });
    expect(login.status).toBe(200);
    expect(login.body.data.accessToken).toBeTruthy();
  });

  it('rejects a second setup attempt without modifying existing data', async () => {
    const first = await request(app).post('/api/v1/setup').send(SETUP_PAYLOAD);
    expect(first.status).toBe(201);

    const restaurantId = first.body.data.restaurant.id;
    const ownerId = first.body.data.owner.id;

    const second = await request(app)
      .post('/api/v1/setup')
      .send({
        ...SETUP_PAYLOAD,
        restaurant: { ...SETUP_PAYLOAD.restaurant, slug: 'another-cafe', name: 'Another Cafe' },
        owner: { ...SETUP_PAYLOAD.owner, username: 'another_owner' },
      });

    expect(second.status).toBe(409);
    expect(second.body.success).toBe(false);
    expect(await prisma.restaurant.count()).toBe(1);
    expect(await prisma.user.count()).toBe(1);
    expect((await prisma.restaurant.findFirst())!.id).toBe(restaurantId);
    expect((await prisma.user.findFirst())!.id).toBe(ownerId);
  });

  it('prevents concurrent setup attempts from creating duplicate restaurants/owners', async () => {
    const payloads = Array.from({ length: 8 }, (_, i) => ({
      restaurant: {
        ...SETUP_PAYLOAD.restaurant,
        name: `Concurrent Cafe ${i}`,
        slug: `concurrent-cafe-${i}`,
      },
      owner: {
        ...SETUP_PAYLOAD.owner,
        username: `concurrent_owner_${i}`,
        pin: `100${i}`.slice(0, 4),
        password: `ConcurrentPass${i}!x`,
      },
    }));

    const results = await Promise.all(
      payloads.map((body) => request(app).post('/api/v1/setup').send(body)),
    );

    const created = results.filter((r) => r.status === 201);
    const conflicts = results.filter((r) => r.status === 409);

    expect(created.length).toBe(1);
    expect(conflicts.length).toBe(7);
    expect(await prisma.restaurant.count()).toBe(1);
    expect(await prisma.user.count()).toBe(1);
  });
});
