import { prisma } from '../../config/database.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { HostIdentityService } from './host-identity/host-identity.service.js';
import {
  getLicensingCloudClient,
  type CloudRedeemActivationResult,
  type LicensingCloudClient,
} from './licensing-cloud.client.js';
import {
  isLicensingCloudError,
  LicensingCloudError,
} from './licensing-cloud.errors.js';
import { LanEntitlementService } from './lan-entitlement.service.js';

/**
 * Host activation code redeem + durable binding (Phase 2D.4).
 * Does not implement host rebind / multi-host.
 */
export class HostActivationService {
  public static async redeemAndBind(input: {
    restaurantId: string;
    activationCode: string;
    hostLabel?: string;
    client?: LicensingCloudClient;
  }): Promise<{
    result: CloudRedeemActivationResult;
    identity: ReturnType<typeof HostIdentityService.markActivated>;
  }> {
    const client = input.client ?? getLicensingCloudClient();
    if (!client) {
      throw new AppError(
        'Licensing cloud client not configured',
        503,
        ErrorCode.SERVICE_UNAVAILABLE,
      );
    }

    const existing = HostIdentityService.getPublicMeta();
    if (existing?.activated && existing.installationId) {
      throw new AppError(
        'Host is already activated; rebind is not supported in this release',
        409,
        ErrorCode.CONFLICT,
      );
    }

    const identity = HostIdentityService.ensureKeyPair();
    const privateKey = HostIdentityService.loadPrivateKey();

    let result: CloudRedeemActivationResult;
    try {
      result = await client.redeemActivation({
        activationCode: input.activationCode,
        installationNonce: identity.installationNonce,
        hostPublicKey: identity.publicKeySpkiB64,
        ...(input.hostLabel ? { hostLabel: input.hostLabel } : {}),
        hostPrivateKey: privateKey,
      });
    } catch (err) {
      // Lost first-redeem response: retry with recovery proof (same identity).
      if (
        isLicensingCloudError(err) &&
        (err.kind === 'timeout' || err.kind === 'network')
      ) {
        try {
          result = await client.redeemActivation({
            activationCode: input.activationCode,
            installationNonce: identity.installationNonce,
            hostPublicKey: identity.publicKeySpkiB64,
            ...(input.hostLabel ? { hostLabel: input.hostLabel } : {}),
            hostPrivateKey: privateKey,
          });
        } catch (retryErr) {
          throw this.mapRedeemError(retryErr);
        }
      } else {
        throw this.mapRedeemError(err);
      }
    }

    const bound = HostIdentityService.markActivated({
      installationId: result.installationId,
      licenseId: result.licenseId,
      restaurantId: input.restaurantId,
    });

    await LanEntitlementService.persistVerifiedCache({
      restaurantId: input.restaurantId,
      document: result.entitlement,
      installationBindingId: result.installationId,
      licenseId: result.licenseId,
      hostPublicKeySpkiB64: bound.publicKeySpkiB64,
      hostKeyFingerprintSha256Hex: bound.fingerprintSha256Hex,
      installationNonce: bound.installationNonce,
    });

    // Ensure trust row exists even if persistVerifiedCache upsert path already wrote it.
    await prisma.hostLicensingTrustState.upsert({
      where: { restaurantId: input.restaurantId },
      create: {
        restaurantId: input.restaurantId,
        lastTrustedUtc: new Date(),
        installationBindingId: result.installationId,
        licenseId: result.licenseId,
        hostPublicKeySpkiB64: bound.publicKeySpkiB64,
        hostKeyFingerprintSha256Hex: bound.fingerprintSha256Hex,
        installationNonce: bound.installationNonce,
        cachedEntitlement: result.entitlement as object,
        lastSuccessfulRefreshAt: new Date(),
      },
      update: {
        installationBindingId: result.installationId,
        licenseId: result.licenseId,
        hostPublicKeySpkiB64: bound.publicKeySpkiB64,
        hostKeyFingerprintSha256Hex: bound.fingerprintSha256Hex,
        installationNonce: bound.installationNonce,
      },
    });

    return { result, identity: bound };
  }

  private static mapRedeemError(err: unknown): AppError {
    if (err instanceof AppError) return err;
    if (err instanceof LicensingCloudError || isLicensingCloudError(err)) {
      const code =
        err.kind === 'network' || err.kind === 'timeout'
          ? ErrorCode.LICENSING_CLOUD_NETWORK
          : err.kind === 'auth'
            ? ErrorCode.LICENSING_CLOUD_AUTH
            : err.kind === 'malformed'
              ? ErrorCode.LICENSING_CLOUD_MALFORMED
              : ErrorCode.LICENSING_CLOUD_DENIED;
      return new AppError(err.message, err.kind === 'denied' ? 400 : 502, code);
    }
    return new AppError(
      err instanceof Error ? err.message : 'Activation failed',
      502,
      ErrorCode.LICENSING_CLOUD_NETWORK,
    );
  }
}
