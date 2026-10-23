import { z } from 'zod';
import { DEFAULT_LAN_CLIENT_MAX_SKEW_MS } from './crypto/lan-client-request.js';

/**
 * Optional LAN / licensing host env (Phase 2D.3 / 2D.4).
 * Parsed lazily so existing POS boots without licensing keys configured.
 */

const lanEnvSchema = z.object({
  LAN_CLIENT_MAX_SKEW_MS: z
    .string()
    .optional()
    .transform((v) =>
      v === undefined || v === '' ? DEFAULT_LAN_CLIENT_MAX_SKEW_MS : parseInt(v, 10),
    )
    .pipe(z.number().int().positive().max(3_600_000)),
  ENTITLEMENT_TRUSTED_PUBLIC_KEYS: z.string().optional(),
  ENTITLEMENT_ISSUER: z.string().optional(),
  ENTITLEMENT_AUDIENCE: z.string().optional(),
  /** When set, LAN routes that require entitlement use this restaurant scope helper in tests. */
  LAN_DEFAULT_RESTAURANT_ID: z.string().uuid().optional(),
  /** Base URL of farmax-licensing-api (e.g. https://licensing.example.com). No trailing slash. */
  LICENSING_CLOUD_BASE_URL: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === '' ? undefined : v.trim()))
    .pipe(z.string().url().optional()),
  LICENSING_CLOUD_TIMEOUT_MS: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? 10_000 : parseInt(v, 10)))
    .pipe(z.number().int().positive().max(120_000)),
  LICENSING_CLOUD_MAX_RETRIES: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? 2 : parseInt(v, 10)))
    .pipe(z.number().int().min(0).max(5)),
  /** Bounded online refresh interval while host is running (ms). Default 1h. */
  ENTITLEMENT_REFRESH_INTERVAL_MS: z
    .string()
    .optional()
    .transform((v) =>
      v === undefined || v === '' ? 60 * 60 * 1000 : parseInt(v, 10),
    )
    .pipe(z.number().int().positive().max(24 * 60 * 60 * 1000)),
});

export type LanEnv = z.infer<typeof lanEnvSchema>;

let cached: LanEnv | null = null;

export function getLanEnv(): LanEnv {
  if (cached) return cached;
  const parsed = lanEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid LAN environment: ${parsed.error.message}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper — clear memoized LAN env after mutating process.env. */
export function resetLanEnvCache(): void {
  cached = null;
}
