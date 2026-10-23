import { prisma } from '../../config/database.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { getLanEnv } from './lan-env.js';
import {
  parseTrustedPublicKeys,
  verifySignedEntitlement,
  type SignedEntitlement,
} from './crypto/entitlement-verify.js';
import {
  getLicensingCloudClient,
  type LicensingCloudClient,
} from './licensing-cloud.client.js';
import {
  isLicensingCloudError,
  LicensingCloudError,
} from './licensing-cloud.errors.js';
import { HostIdentityService } from './host-identity/host-identity.service.js';

/**
 * Host entitlement enforcement + durable cache (Phase 2D.3 / 2D.4).
 *
 * Honesty:
 * - Offline paidThrough / Karachi grace is NOT implemented — only signed nbf/exp/status.
 * - Cloud suspension while offline cannot be detected until refresh; exposure ≤ document exp.
 * - Network outage ≠ licensing denial: cached usable document may authorize until exp;
 *   explicit denial / bad signature / binding mismatch / clock rollback fail closed.
 */

function asSignedEntitlement(value: unknown): SignedEntitlement | null {
  if (!value || typeof value !== 'object') return null;
  const doc = value as SignedEntitlement;
  if (!doc.claims || typeof doc.signature !== 'string') return null;
  return doc;
}

function mapCloudError(err: unknown): AppError {
  if (isLicensingCloudError(err)) {
    const code =
      err.kind === 'network' || err.kind === 'timeout'
        ? ErrorCode.LICENSING_CLOUD_NETWORK
        : err.kind === 'auth'
          ? ErrorCode.LICENSING_CLOUD_AUTH
          : err.kind === 'malformed'
            ? ErrorCode.LICENSING_CLOUD_MALFORMED
            : ErrorCode.LICENSING_CLOUD_DENIED;
    const status =
      err.kind === 'network' || err.kind === 'timeout'
        ? 503
        : err.kind === 'auth'
          ? 401
          : 403;
    return new AppError(err.message, status, code, true, {
      kind: err.kind,
      remoteCode: err.remoteCode,
    });
  }
  if (err instanceof AppError) return err;
  return new AppError(
    err instanceof Error ? err.message : 'Licensing cloud error',
    502,
    ErrorCode.LICENSING_CLOUD_NETWORK,
  );
}

export class LanEntitlementService {
  /**
   * Verify entitlement for a protected LAN operation and advance the clock watermark.
   */
  public static async assertUsableForLan(input: {
    restaurantId: string;
    document: SignedEntitlement;
    requireOnlineCommercial?: boolean;
  }): Promise<SignedEntitlement['claims']> {
    const lanEnv = getLanEnv();
    const trusted = parseTrustedPublicKeys(lanEnv.ENTITLEMENT_TRUSTED_PUBLIC_KEYS);
    if (trusted.size === 0) {
      throw new AppError(
        'No trusted entitlement public keys configured on host',
        503,
        ErrorCode.LAN_ENTITLEMENT_INVALID,
      );
    }

    const trust = await prisma.hostLicensingTrustState.findUnique({
      where: { restaurantId: input.restaurantId },
    });

    const wall = new Date();
    if (trust && wall.getTime() + 1000 < trust.lastTrustedUtc.getTime()) {
      throw new AppError(
        'Host clock rollback detected; entitlement use blocked until clock is safe',
        403,
        ErrorCode.LAN_CLOCK_ROLLBACK,
      );
    }

    const effectiveNow =
      trust && trust.lastTrustedUtc > wall ? trust.lastTrustedUtc : wall;

    const result = verifySignedEntitlement({
      document: input.document,
      trustedKeys: trusted,
      ...(lanEnv.ENTITLEMENT_ISSUER ? { expectedIssuer: lanEnv.ENTITLEMENT_ISSUER } : {}),
      ...(lanEnv.ENTITLEMENT_AUDIENCE
        ? { expectedAudience: lanEnv.ENTITLEMENT_AUDIENCE }
        : {}),
      ...(trust?.installationBindingId
        ? { expectedInstallationBindingId: trust.installationBindingId }
        : {}),
      effectiveNow,
    });

    if (!result.ok) {
      const code =
        result.reason === 'EXPIRED'
          ? ErrorCode.LAN_ENTITLEMENT_EXPIRED
          : result.reason === 'CLOCK_ROLLBACK'
            ? ErrorCode.LAN_CLOCK_ROLLBACK
            : ErrorCode.LAN_ENTITLEMENT_INVALID;
      throw new AppError(result.message, 403, code);
    }

    // Optional online commercial gate — only when caller asks and cloud is configured.
    if (input.requireOnlineCommercial) {
      const cloud = getLicensingCloudClient();
      if (!cloud || !trust?.installationBindingId) {
        throw new AppError(
          'Online commercial revalidation required but licensing cloud is unavailable',
          503,
          ErrorCode.LICENSING_CLOUD_NETWORK,
        );
      }
      try {
        await this.refreshFromCloud({
          restaurantId: input.restaurantId,
          installationId: trust.installationBindingId,
          client: cloud,
        });
      } catch (err) {
        throw mapCloudError(err);
      }
    }

    const newWatermark = effectiveNow > wall ? effectiveNow : wall;
    await prisma.hostLicensingTrustState.upsert({
      where: { restaurantId: input.restaurantId },
      create: {
        restaurantId: input.restaurantId,
        lastTrustedUtc: newWatermark,
        installationBindingId: result.claims.installationBindingId,
        cachedEntitlement: input.document as object,
      },
      update: {
        lastTrustedUtc:
          trust && trust.lastTrustedUtc > newWatermark
            ? trust.lastTrustedUtc
            : newWatermark,
        installationBindingId: result.claims.installationBindingId,
        cachedEntitlement: input.document as object,
      },
    });

    return result.claims;
  }

  /**
   * Revalidate the durable cached entitlement (startup / before protected LAN ops).
   * Does not invent offline paidThrough/grace. Fail closed on invalid cache.
   */
  public static async assertCachedUsable(restaurantId: string): Promise<SignedEntitlement['claims']> {
    const trust = await prisma.hostLicensingTrustState.findUnique({
      where: { restaurantId },
    });
    const document = asSignedEntitlement(trust?.cachedEntitlement);
    if (!document) {
      throw new AppError(
        'No cached entitlement available; online refresh required',
        403,
        ErrorCode.LAN_ENTITLEMENT_INVALID,
      );
    }
    return this.assertUsableForLan({ restaurantId, document });
  }

  /** Persist a verified entitlement + advance watermark transactionally. */
  public static async persistVerifiedCache(input: {
    restaurantId: string;
    document: SignedEntitlement;
    installationBindingId?: string | null;
    licenseId?: string | null;
    hostPublicKeySpkiB64?: string | null;
    hostKeyFingerprintSha256Hex?: string | null;
    installationNonce?: string | null;
  }): Promise<SignedEntitlement['claims']> {
    const claims = await this.assertUsableForLan({
      restaurantId: input.restaurantId,
      document: input.document,
    });

    await prisma.hostLicensingTrustState.update({
      where: { restaurantId: input.restaurantId },
      data: {
        ...(input.installationBindingId !== undefined
          ? { installationBindingId: input.installationBindingId }
          : {}),
        ...(input.licenseId !== undefined ? { licenseId: input.licenseId } : {}),
        ...(input.hostPublicKeySpkiB64 !== undefined
          ? { hostPublicKeySpkiB64: input.hostPublicKeySpkiB64 }
          : {}),
        ...(input.hostKeyFingerprintSha256Hex !== undefined
          ? { hostKeyFingerprintSha256Hex: input.hostKeyFingerprintSha256Hex }
          : {}),
        ...(input.installationNonce !== undefined
          ? { installationNonce: input.installationNonce }
          : {}),
        lastSuccessfulRefreshAt: new Date(),
        lastRefreshError: null,
      },
    });

    return claims;
  }

  /**
   * Online refresh from licensing cloud, verify, and persist durable cache.
   * Network failures leave prior cache intact (caller decides offline policy).
   */
  public static async refreshFromCloud(input: {
    restaurantId: string;
    installationId: string;
    client?: LicensingCloudClient;
  }): Promise<SignedEntitlement['claims']> {
    const client = input.client ?? getLicensingCloudClient();
    if (!client) {
      throw new AppError(
        'Licensing cloud client not configured',
        503,
        ErrorCode.SERVICE_UNAVAILABLE,
      );
    }

    await prisma.hostLicensingTrustState.upsert({
      where: { restaurantId: input.restaurantId },
      create: {
        restaurantId: input.restaurantId,
        lastTrustedUtc: new Date(),
        installationBindingId: input.installationId,
        lastRefreshAttemptAt: new Date(),
      },
      update: { lastRefreshAttemptAt: new Date() },
    });

    let refreshed;
    try {
      refreshed = await client.refreshEntitlement({
        installationId: input.installationId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'refresh failed';
      await prisma.hostLicensingTrustState.update({
        where: { restaurantId: input.restaurantId },
        data: { lastRefreshError: message.slice(0, 500) },
      });
      throw err instanceof LicensingCloudError || err instanceof AppError
        ? err
        : mapCloudError(err);
    }

    const identity = HostIdentityService.getPublicMeta();
    return this.persistVerifiedCache({
      restaurantId: input.restaurantId,
      document: refreshed.entitlement,
      installationBindingId: refreshed.installationId,
      licenseId: refreshed.licenseId,
      hostPublicKeySpkiB64: identity?.publicKeySpkiB64 ?? null,
      hostKeyFingerprintSha256Hex: identity?.fingerprintSha256Hex ?? null,
      installationNonce: identity?.installationNonce ?? null,
    });
  }

  /**
   * Startup / interval refresh: try online refresh; on network outage, revalidate cache only.
   * Explicit licensing denial fails closed (does not keep using a newly-denied online path).
   */
  public static async refreshOrRevalidateCached(input: {
    restaurantId: string;
    installationId?: string;
  }): Promise<{
    source: 'cloud' | 'cache';
    claims: SignedEntitlement['claims'];
    networkOutage?: boolean;
  }> {
    const trust = await prisma.hostLicensingTrustState.findUnique({
      where: { restaurantId: input.restaurantId },
    });
    const installationId =
      input.installationId ??
      trust?.installationBindingId ??
      HostIdentityService.getPublicMeta()?.installationId;

    const cloud = getLicensingCloudClient();
    if (cloud && installationId) {
      try {
        const claims = await this.refreshFromCloud({
          restaurantId: input.restaurantId,
          installationId,
          client: cloud,
        });
        return { source: 'cloud', claims };
      } catch (err) {
        if (isLicensingCloudError(err) && (err.kind === 'network' || err.kind === 'timeout')) {
          const claims = await this.assertCachedUsable(input.restaurantId);
          return { source: 'cache', claims, networkOutage: true };
        }
        // Explicit denial / auth / malformed — fail closed; do not fall back to cache
        // after the cloud has rejected the host commercially.
        throw mapCloudError(err);
      }
    }

    const claims = await this.assertCachedUsable(input.restaurantId);
    return { source: 'cache', claims };
  }

  public static async touchWatermark(restaurantId: string, at: Date = new Date()) {
    const existing = await prisma.hostLicensingTrustState.findUnique({
      where: { restaurantId },
    });
    if (existing && at < existing.lastTrustedUtc) {
      throw new AppError(
        'Refusing to move licensing watermark backward',
        403,
        ErrorCode.LAN_CLOCK_ROLLBACK,
      );
    }
    return prisma.hostLicensingTrustState.upsert({
      where: { restaurantId },
      create: { restaurantId, lastTrustedUtc: at },
      update: { lastTrustedUtc: at },
    });
  }

  public static async getWatermark(restaurantId: string) {
    return prisma.hostLicensingTrustState.findUnique({ where: { restaurantId } });
  }
}
