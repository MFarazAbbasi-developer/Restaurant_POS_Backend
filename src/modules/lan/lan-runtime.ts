import { prisma } from '../../config/database.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import {
  getHostSecretStore,
  HostIdentityService,
} from './host-identity/host-identity.service.js';

/**
 * In-process LAN runtime binding (Phase 2D.5).
 * Authoritative restaurant id comes from persisted setup (Postgres Restaurant row),
 * cross-checked against activated host identity / trust state — never from an arbitrary env default.
 */

export type LanRuntimeSnapshot = {
  /** Bound restaurant when setup exists and identity checks pass. */
  restaurantId: string | null;
  /** True only when remote LAN POS routes may accept Plane B traffic. */
  lanEnabled: boolean;
  /** Host licensing activation present and restaurant binding consistent. */
  hostActivated: boolean;
  /** Last startup reason when LAN is disabled (safe to log; no secrets). */
  disabledReason: string | null;
  setupComplete: boolean;
};

let runtime: LanRuntimeSnapshot = {
  restaurantId: null,
  lanEnabled: false,
  hostActivated: false,
  disabledReason: 'not_initialized',
  setupComplete: false,
};

export function getLanRuntime(): LanRuntimeSnapshot {
  return { ...runtime };
}

export function resetLanRuntimeForTests(): void {
  runtime = {
    restaurantId: null,
    lanEnabled: false,
    hostActivated: false,
    disabledReason: 'not_initialized',
    setupComplete: false,
  };
}

/** Test helper: force a known runtime without DB resolution. */
export function configureLanRuntimeForTests( partial: Partial<LanRuntimeSnapshot> & { restaurantId: string }): void {
  runtime = {
    restaurantId: partial.restaurantId,
    lanEnabled: partial.lanEnabled ?? true,
    hostActivated: partial.hostActivated ?? false,
    disabledReason: partial.disabledReason ?? null,
    setupComplete: partial.setupComplete ?? true,
  };
}

export type ResolveRestaurantResult =
  | { ok: true; restaurantId: string; setupComplete: true }
  | { ok: false; reason: string; setupComplete: boolean };

/**
 * Resolve the authoritative restaurant for LAN/licensing binding.
 * Prefer activated host-identity / trust binding; otherwise the sole active restaurant.
 * Never uses LAN_DEFAULT_RESTAURANT_ID.
 */
export async function resolveAuthoritativeRestaurantId(): Promise<ResolveRestaurantResult> {
  const identity = HostIdentityService.getPublicMeta();
  if (identity?.activated && identity.restaurantId) {
    const bound = await prisma.restaurant.findFirst({
      where: { id: identity.restaurantId, isActive: true },
      select: { id: true },
    });
    if (bound) {
      return { ok: true, restaurantId: bound.id, setupComplete: true };
    }
    return {
      ok: false,
      reason: 'activated_host_restaurant_missing_or_inactive',
      setupComplete: true,
    };
  }

  const trustBound = await prisma.hostLicensingTrustState.findFirst({
    where: { installationBindingId: { not: null } },
    select: { restaurantId: true },
    orderBy: { updatedAt: 'desc' },
  });
  if (trustBound) {
    const bound = await prisma.restaurant.findFirst({
      where: { id: trustBound.restaurantId, isActive: true },
      select: { id: true },
    });
    if (bound) {
      return { ok: true, restaurantId: bound.id, setupComplete: true };
    }
  }

  const restaurants = await prisma.restaurant.findMany({
    where: { isActive: true },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  if (restaurants.length === 0) {
    return { ok: false, reason: 'setup_required', setupComplete: false };
  }
  if (restaurants.length > 1) {
    return {
      ok: false,
      reason: 'multiple_active_restaurants_unsupported_for_lan',
      setupComplete: true,
    };
  }
  return { ok: true, restaurantId: restaurants[0]!.id, setupComplete: true };
}

/**
 * Bind host identity + trust state to the authoritative restaurant.
 * Mismatch fails closed for LAN without deleting business data.
 */
export async function assertRestaurantIdentityConsistent(restaurantId: string): Promise<void> {
  const identity = HostIdentityService.getPublicMeta();
  if (identity?.activated) {
    if (identity.restaurantId && identity.restaurantId !== restaurantId) {
      throw new AppError(
        'Activated host identity is bound to a different restaurant',
        403,
        ErrorCode.LAN_RESTAURANT_MISMATCH,
      );
    }
  }

  const trust = await prisma.hostLicensingTrustState.findUnique({
    where: { restaurantId },
  });

  // Only compare installation binding for THIS restaurant's trust row.
  if (identity?.activated && identity.installationId && trust?.installationBindingId) {
    if (trust.installationBindingId !== identity.installationId) {
      throw new AppError(
        'Host installation binding mismatch between identity store and trust state',
        403,
        ErrorCode.LAN_RESTAURANT_MISMATCH,
      );
    }
  }
}

/**
 * Persist restaurantId onto activated host meta when missing (does not rotate keys).
 */
export function bindHostIdentityRestaurantIfNeeded(restaurantId: string): void {
  const identity = HostIdentityService.getPublicMeta();
  if (!identity?.activated) return;
  if (identity.restaurantId === restaurantId) return;
  if (identity.restaurantId && identity.restaurantId !== restaurantId) {
    throw new AppError(
      'Refusing to rebind activated host identity to another restaurant',
      403,
      ErrorCode.LAN_RESTAURANT_MISMATCH,
    );
  }
  const store = getHostSecretStore();
  const meta = store.readMeta();
  if (!meta) return;
  store.writeMeta({ ...meta, restaurantId });
}

export function setLanRuntime(next: LanRuntimeSnapshot): void {
  runtime = { ...next };
}

export function assertLanEnabled(): void {
  const snap = getLanRuntime();
  if (!snap.lanEnabled || !snap.restaurantId) {
    throw new AppError(
      snap.disabledReason
        ? `LAN access disabled: ${snap.disabledReason}`
        : 'LAN access is not enabled on this host',
      403,
      ErrorCode.LAN_DISABLED,
    );
  }
}
