/* eslint-disable no-console */
/**
 * Production-safe system seed.
 *
 * Upserts only the global permission catalog. Does not create restaurants,
 * users, roles, or any business/demo data. Safe to re-run (idempotent).
 *
 * Usage:
 *   npm run prisma:seed:system
 *   npm run prisma:seed          (alias — also used by `prisma db seed`)
 */
import { PrismaClient } from '@prisma/client';
import { DEFAULT_PERMISSIONS } from '../src/common/rbac/permissions.catalog.js';

const prisma = new PrismaClient();

export async function seedSystemPermissions(): Promise<{
  upserted: number;
  totalPermissions: number;
}> {
  console.log('🔐 Starting production-safe system seed (permissions catalog only)...\n');

  let upserted = 0;
  for (const perm of DEFAULT_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      create: { key: perm.key, description: perm.description },
      update: { description: perm.description },
    });
    upserted += 1;
  }

  const totalPermissions = await prisma.permission.count();

  console.log(`   ✅ Upserted ${upserted} permission definitions`);
  console.log(`   📊 Permissions table now has ${totalPermissions} row(s)`);
  console.log(
    '\n✨ System seed complete. No restaurants, users, roles, or business data were created or modified.\n',
  );

  return { upserted, totalPermissions };
}

async function main(): Promise<void> {
  await seedSystemPermissions();
}

main()
  .catch((error) => {
    console.error('❌ System seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
