/* eslint-disable no-console */
/**
 * Explicit opt-in launcher for the destructive demo seed.
 * Sets ALLOW_DESTRUCTIVE_SEED=1 then runs seed-demo.ts.
 *
 * Usage: npm run prisma:seed:demo
 */
process.env.ALLOW_DESTRUCTIVE_SEED = '1';

import('./seed-demo.js').catch((error: unknown) => {
  console.error('❌ Failed to launch destructive demo seed:', error);
  process.exit(1);
});
