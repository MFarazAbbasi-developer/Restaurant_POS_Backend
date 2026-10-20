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
    console.error('[db-check] FAILED: DATABASE_URL is not set');
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
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const msg = error instanceof Error ? error.message : String(error);
  if (code) {
    console.error(`[db-check] FAILED (${code}): ${msg}`);
  } else {
    console.error(`[db-check] FAILED: ${msg}`);
  }
  process.exit(1);
});
