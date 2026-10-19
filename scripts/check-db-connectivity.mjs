/**
 * Lightweight PostgreSQL connectivity probe for desktop startup orchestration.
 * Exits 0 on success, 1 on failure. Does not mutate schema or data.
 *
 * Usage:
 *   node scripts/check-db-connectivity.mjs
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[db-check] DATABASE_URL is not set');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    console.log('[db-check] Database connectivity OK');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[db-check] FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
