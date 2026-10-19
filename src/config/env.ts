import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * Load env files without overriding variables already set by the desktop shell.
 * Production desktop prefers FARAZ_POS_CONFIG_FILE (persistent ProgramData config).
 * Development continues to use local .env in the backend cwd.
 */
if (process.env.FARAZ_POS_CONFIG_FILE) {
  dotenv.config({ path: process.env.FARAZ_POS_CONFIG_FILE });
}
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z
    .string()
    .default('127.0.0.1')
    .describe('Listen address. Default 127.0.0.1 keeps the initial release local-only.'),
  PORT: z
    .string()
    .default('5000')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive().max(65535)),
  API_PREFIX: z.string().default('/api/v1'),
  DATABASE_URL: z.string().url().min(1, 'DATABASE_URL is required'),
  CORS_ORIGIN: z.string().default('*'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /**
   * Optional persistent log directory (desktop Step 3).
   * When set, backend also writes JSON logs under this directory.
   */
  LOG_DIR: z.string().optional(),
  FARAZ_POS_DATA_DIR: z.string().optional(),
  FARAZ_POS_CONFIG_DIR: z.string().optional(),
  FARAZ_POS_CONFIG_FILE: z.string().optional(),
  FARAZ_POS_LOG_DIR: z.string().optional(),
  FARAZ_POS_POSTGRES_DATA_DIR: z.string().optional(),
  FARAZ_POS_BACKUP_DIR: z.string().optional(),
  JWT_ACCESS_SECRET: z
    .string()
    .min(16, 'JWT_ACCESS_SECRET must be at least 16 characters')
    .default('faraz-pos-jwt-access-secret-default-key-dev-2026'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_DAYS: z
    .string()
    .default('7')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive()),
  BCRYPT_SALT_ROUNDS: z
    .string()
    .default('10')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive().max(14)),
  STATIC_FILES_PATH: z.string().optional(),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error(
      '❌ Invalid environment variables:',
      JSON.stringify(result.error.format(), null, 2),
    );
    process.exit(1);
  }

  return result.data;
};

export const env = parseEnv();
export type Env = z.infer<typeof envSchema>;
