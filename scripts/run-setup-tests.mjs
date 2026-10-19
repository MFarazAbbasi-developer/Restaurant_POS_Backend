import { spawnSync } from 'node:child_process';

process.env.ALLOW_SETUP_DB_WIPE = '1';

const result = spawnSync(
  'npx',
  ['vitest', 'run', 'tests/setup/setup.test.ts'],
  { stdio: 'inherit', env: process.env, shell: true },
);

process.exit(result.status ?? 1);
