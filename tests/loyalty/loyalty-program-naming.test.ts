import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Naming release checks for loyalty program defaults and migration SQL.
 * Does not target faraz_pos_db / farmax_pos_db specifically — uses the test DATABASE_URL.
 */
const prisma = new PrismaClient();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationSqlPath = path.resolve(
  __dirname,
  '../../prisma/migrations/20261022001000_loyalty_program_name_farmax_default/migration.sql',
);

const OFFICIAL_NAME = 'FARMAX Rewards Club';
const LEGACY_DEFAULTS = ['Faraz Rewards', 'Faraz Rewards Club'] as const;

describe('FARMAX POS — Loyalty program naming', () => {
  const restaurantIds: string[] = [];

  beforeAll(async () => {
    expect(fs.existsSync(migrationSqlPath)).toBe(true);
  });

  afterAll(async () => {
    if (restaurantIds.length > 0) {
      await prisma.loyaltyProgram.deleteMany({ where: { restaurantId: { in: restaurantIds } } });
      await prisma.restaurant.deleteMany({ where: { id: { in: restaurantIds } } });
    }
    await prisma.$disconnect();
  });

  it('ships additive migration that sets FARMAX default and converts only legacy defaults', () => {
    const sql = fs.readFileSync(migrationSqlPath, 'utf8');
    expect(sql).toContain(`SET DEFAULT '${OFFICIAL_NAME}'`);
    expect(sql).toMatch(
      /UPDATE\s+"loyalty_programs"\s+SET\s+"programName"\s*=\s*'FARMAX Rewards Club'/i,
    );
    expect(sql).toContain(`'Faraz Rewards'`);
    expect(sql).toContain(`'Faraz Rewards Club'`);
    expect(sql).not.toMatch(/DROP\s+TABLE/i);
    expect(sql).not.toMatch(/TRUNCATE/i);
  });

  it('Prisma schema default is FARMAX Rewards Club', () => {
    const schema = fs.readFileSync(
      path.resolve(__dirname, '../../prisma/schema.prisma'),
      'utf8',
    );
    expect(schema).toMatch(/programName\s+String\s+@default\("FARMAX Rewards Club"\)/);
    expect(schema).not.toMatch(/@default\("Faraz Rewards"\)/);
  });

  it('converts exact legacy program names and preserves custom names', async () => {
    const stamp = Date.now();
    const legacyA = await prisma.restaurant.create({
      data: {
        name: `Naming Legacy A ${stamp}`,
        slug: `naming-legacy-a-${stamp}`,
        currency: 'PKR',
        timezone: 'Asia/Karachi',
        taxRate: 0,
      },
    });
    const legacyB = await prisma.restaurant.create({
      data: {
        name: `Naming Legacy B ${stamp}`,
        slug: `naming-legacy-b-${stamp}`,
        currency: 'PKR',
        timezone: 'Asia/Karachi',
        taxRate: 0,
      },
    });
    const custom = await prisma.restaurant.create({
      data: {
        name: `Naming Custom ${stamp}`,
        slug: `naming-custom-${stamp}`,
        currency: 'PKR',
        timezone: 'Asia/Karachi',
        taxRate: 0,
      },
    });
    restaurantIds.push(legacyA.id, legacyB.id, custom.id);

    await prisma.loyaltyProgram.create({
      data: { restaurantId: legacyA.id, programName: LEGACY_DEFAULTS[0] },
    });
    await prisma.loyaltyProgram.create({
      data: { restaurantId: legacyB.id, programName: LEGACY_DEFAULTS[1] },
    });
    await prisma.loyaltyProgram.create({
      data: { restaurantId: custom.id, programName: 'My Custom Rewards' },
    });

    // Same predicate as the additive migration UPDATE (scoped to these fixtures only).
    await prisma.loyaltyProgram.updateMany({
      where: {
        restaurantId: { in: [legacyA.id, legacyB.id, custom.id] },
        programName: { in: [...LEGACY_DEFAULTS] },
      },
      data: { programName: OFFICIAL_NAME },
    });

    const rows = await prisma.loyaltyProgram.findMany({
      where: { restaurantId: { in: [legacyA.id, legacyB.id, custom.id] } },
      select: { restaurantId: true, programName: true },
    });
    const byRestaurant = Object.fromEntries(rows.map((r) => [r.restaurantId, r.programName]));
    expect(byRestaurant[legacyA.id]).toBe(OFFICIAL_NAME);
    expect(byRestaurant[legacyB.id]).toBe(OFFICIAL_NAME);
    expect(byRestaurant[custom.id]).toBe('My Custom Rewards');
  });
});

