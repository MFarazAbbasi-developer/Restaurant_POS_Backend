/* eslint-disable no-console */
/**
 * Prisma default seed entry (`prisma db seed` / `npm run prisma:seed`).
 *
 * COMMAND CHANGE (Step 2C):
 * - Previously this file ran the destructive demo seed (TRUNCATE + demo data).
 * - It now delegates to the production-safe system seed (permissions catalog only).
 *
 * For the full wipe-and-reload demo dataset (development/testing only):
 *   npm run prisma:seed:demo
 */
import('./seed-system.js').catch((error: unknown) => {
  console.error('❌ Failed to launch system seed:', error);
  process.exit(1);
});
