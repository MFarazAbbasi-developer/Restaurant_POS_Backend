import { getLanEnv } from './lan-env.js';
import {
  HttpLicensingCloudClient,
  getLicensingCloudClient,
  setLicensingCloudClient,
} from './licensing-cloud.client.js';
import { HostIdentityService } from './host-identity/host-identity.service.js';
import { LanEntitlementService } from './lan-entitlement.service.js';
import { LanReconciliationService } from './lan-reconciliation.service.js';
import {
  assertRestaurantIdentityConsistent,
  bindHostIdentityRestaurantIfNeeded,
  getLanRuntime,
  resolveAuthoritativeRestaurantId,
  setLanRuntime,
  type LanRuntimeSnapshot,
} from './lan-runtime.js';
import { isRemoteLanPairingEnabled } from './lan-pairing-gate.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';

let refreshTimer: ReturnType<typeof setInterval> | null = null;
let boundRestaurantId: string | null = null;

/**
 * Wire the real HTTP licensing client when LICENSING_CLOUD_BASE_URL is set
 * and no client was injected (tests). Does not throw on missing config —
 * existing single-terminal POS continues without Plane A.
 */
export function ensureLicensingCloudClientWired(): void {
  if (getLicensingCloudClient()) return;
  const env = getLanEnv();
  if (!env.LICENSING_CLOUD_BASE_URL) return;

  setLicensingCloudClient(
    new HttpLicensingCloudClient({
      baseUrl: env.LICENSING_CLOUD_BASE_URL,
      getPrivateKey: () => HostIdentityService.loadPrivateKey(),
      connectTimeoutMs: env.LICENSING_CLOUD_TIMEOUT_MS,
      maxRetries: env.LICENSING_CLOUD_MAX_RETRIES,
    }),
  );
}

function disableLan(reason: string, setupComplete: boolean, hostActivated: boolean): void {
  setLanRuntime({
    restaurantId: null,
    lanEnabled: false,
    hostActivated,
    disabledReason: reason,
    setupComplete,
  });
  boundRestaurantId = null;
}

/**
 * Full desktop licensing/LAN startup:
 * 1) Resolve authoritative restaurant from DB (setup), not env.
 * 2) Load host identity; refuse restaurant mismatch.
 * 3) Refresh/revalidate entitlement when activated.
 * 4) Reconcile roster.
 * 5) Enable LAN POS Plane B routes only when entitlement + binding are healthy.
 *
 * Local staff JWT POS continues even when LAN stays disabled.
 */
export async function bootstrapLicensingAndLanRuntime(): Promise<LanRuntimeSnapshot> {
  ensureLicensingCloudClientWired();

  const resolved = await resolveAuthoritativeRestaurantId();
  if (!resolved.ok) {
    disableLan(resolved.reason, resolved.setupComplete, false);
    logger.info({ reason: resolved.reason }, 'LAN runtime not enabled');
    return setAndReturn();
  }

  const restaurantId = resolved.restaurantId;
  let hostActivated = false;

  try {
    const identity = HostIdentityService.getPublicMeta();
    hostActivated = Boolean(identity?.activated && identity.installationId);

    await assertRestaurantIdentityConsistent(restaurantId);
    if (hostActivated) {
      bindHostIdentityRestaurantIfNeeded(restaurantId);
    }

    if (!hostActivated) {
      // Single-terminal workflow: no Plane A activation yet → LAN remote routes stay off.
      setLanRuntime({
        restaurantId,
        lanEnabled: false,
        hostActivated: false,
        disabledReason: 'host_not_activated',
        setupComplete: true,
      });
      boundRestaurantId = restaurantId;
      logger.info(
        { restaurantId, pairingEnabled: isRemoteLanPairingEnabled() },
        'Restaurant bound; LAN remote routes disabled until host activation + TLS pairing',
      );
      return setAndReturn();
    }

    await runLicensingStartup(restaurantId);

    setLanRuntime({
      restaurantId,
      lanEnabled: true,
      hostActivated: true,
      disabledReason: null,
      setupComplete: true,
    });
    boundRestaurantId = restaurantId;
    startEntitlementRefreshLoop(restaurantId);
    logger.info(
      { restaurantId, pairingEnabled: isRemoteLanPairingEnabled() },
      'LAN runtime enabled for Plane B POS boundary',
    );
    return setAndReturn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = err instanceof AppError ? err.errorCode : ErrorCode.LAN_DISABLED;
    disableLan(
      code === ErrorCode.LAN_RESTAURANT_MISMATCH ? 'restaurant_identity_mismatch' : message.slice(0, 200),
      true,
      hostActivated,
    );
    // Preserve restaurantId on mismatch? No — fail closed for LAN; do not advertise a bad binding.
    if (err instanceof AppError && err.errorCode === ErrorCode.LAN_RESTAURANT_MISMATCH) {
      logger.warn({ err: message, restaurantId }, 'LAN disabled due to identity mismatch');
    } else {
      logger.warn(
        { err: message, restaurantId },
        'Licensing startup failed closed for LAN; local POS continues',
      );
    }
    return setAndReturn();
  }
}

function setAndReturn(): LanRuntimeSnapshot {
  return getLanRuntime();
}

/**
 * Startup: refresh entitlement when activated; on network outage revalidate cache.
 * Never authorizes when cache/signature/binding fail.
 */
export async function runLicensingStartup(restaurantId: string): Promise<void> {
  ensureLicensingCloudClientWired();
  const identity = HostIdentityService.getPublicMeta();
  if (!identity?.activated || !identity.installationId) {
    return;
  }

  await assertRestaurantIdentityConsistent(restaurantId);

  try {
    await LanEntitlementService.refreshOrRevalidateCached({
      restaurantId,
      installationId: identity.installationId,
    });
  } catch (err) {
    logger.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        restaurantId,
      },
      'Licensing startup refresh/revalidate failed closed',
    );
    throw err;
  }

  try {
    await LanReconciliationService.reconcileFromCloud({
      restaurantId,
      installationId: identity.installationId,
    });
    await LanReconciliationService.retryPendingCloudDeactivates({
      restaurantId,
      installationId: identity.installationId,
    });
  } catch (err) {
    logger.warn(
      {
        err: err instanceof Error ? err.message : String(err),
        restaurantId,
      },
      'Licensing startup roster reconcile deferred',
    );
  }
}

export function startEntitlementRefreshLoop(restaurantId: string): void {
  stopEntitlementRefreshLoop();
  const env = getLanEnv();
  refreshTimer = setInterval(() => {
    void LanEntitlementService.refreshOrRevalidateCached({ restaurantId })
      .then(() => {
        // Keep LAN enabled while cache/cloud refresh succeeds.
        setLanRuntime({
          restaurantId,
          lanEnabled: true,
          hostActivated: true,
          disabledReason: null,
          setupComplete: true,
        });
      })
      .catch((err) => {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err), restaurantId },
          'Periodic entitlement refresh failed — disabling LAN routes',
        );
        setLanRuntime({
          restaurantId,
          lanEnabled: false,
          hostActivated: true,
          disabledReason: 'entitlement_refresh_failed',
          setupComplete: true,
        });
      });
  }, env.ENTITLEMENT_REFRESH_INTERVAL_MS);
  if (refreshTimer && typeof refreshTimer === 'object' && 'unref' in refreshTimer) {
    refreshTimer.unref();
  }
}

export function stopEntitlementRefreshLoop(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

export function getBoundLicensingRestaurantId(): string | null {
  return boundRestaurantId;
}
