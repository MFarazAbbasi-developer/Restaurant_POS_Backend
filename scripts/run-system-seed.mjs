/**
 * Production-safe system seed runner for desktop / packaged Node runtimes.
 *
 * Uses compiled backend output (dist) + @prisma/client — does NOT require tsx.
 * Upserts the global permission catalog only. Never invokes the demo seed.
 *
 * Usage:
 *   node scripts/run-system-seed.mjs
 *   (DATABASE_URL must be set or present in .env via caller)
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const { PrismaClient } = require('@prisma/client');

const catalogPath = path.join(backendRoot, 'dist', 'common', 'rbac', 'permissions.catalog.js');

async function loadPermissions() {
  const mod = await import(pathToFileURL(catalogPath).href);
  if (!mod.DEFAULT_PERMISSIONS || !Array.isArray(mod.DEFAULT_PERMISSIONS)) {
    throw new Error(
      `DEFAULT_PERMISSIONS not found in ${catalogPath}. Build the backend first (npm run build).`,
    );
  }
  return mod.DEFAULT_PERMISSIONS;
}

async function main() {
  console.log('[system-seed] Starting production-safe system seed (permissions catalog only)...');

  const permissions = await loadPermissions();
  const prisma = new PrismaClient();

  try {
    let upserted = 0;
    for (const perm of permissions) {
      await prisma.permission.upsert({
        where: { key: perm.key },
        create: { key: perm.key, description: perm.description },
        update: { description: perm.description },
      });
      upserted += 1;
    }

    const totalPermissions = await prisma.permission.count();
    console.log(`[system-seed] Upserted ${upserted} permission definition(s)`);
    console.log(`[system-seed] Permissions table now has ${totalPermissions} row(s)`);
    console.log(
      '[system-seed] Complete. No restaurants, users, roles, or business data were created or modified.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('[system-seed] FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
