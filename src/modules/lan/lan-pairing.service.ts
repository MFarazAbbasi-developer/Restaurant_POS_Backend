import { LanPairingInvitationStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { AuditService } from '../../common/services/audit.service.js';
import { ManagerAuthService } from '../auth/manager-auth.service.js';
import {
  createHostAttestationOrThrow,
  assertLanPairingProtocolReady,
} from './lan-pairing-gate.js';
import { HostIdentityService } from './host-identity/host-identity.service.js';
import { LanPairingInvitationService } from './lan-pairing-invitation.service.js';
import { LanTerminalService } from './lan-terminal.service.js';
import { LanReconciliationService } from './lan-reconciliation.service.js';
import {
  getLicensingCloudClient,
  type CloudRegisterTerminalResult,
} from './licensing-cloud.client.js';
import {
  isLicensingCloudError,
  isUnsafeBlindRetry,
  LicensingCloudError,
} from './licensing-cloud.errors.js';
import { normalizeAndFingerprintTerminalPublicKey } from './crypto/terminal-device-key.js';
import {
  LAN_PAIRING_STATUS_LOOKUP_TTL_MS,
  verifyPairingClientProof,
  verifyPairingStatusProof,
} from './crypto/pairing-client-proof.js';
import { LAN_PAIRING_PROTOCOL_VERSION } from './crypto/pairing-invitation-token.js';
import type { SignedHostAttestation } from './crypto/host-attestation.js';

/**
 * Secure LAN pairing orchestration (Phase 2D.7).
 *
 * Flow:
 * 1. Manager creates invitation (host screen shows token + TLS/host pins OOB)
 * 2. Client verifies TLS pin from OOB, then calls hello → host attestation
 * 3. Client submits complete (token + public key + proof) → AWAITING_APPROVAL
 * 4. Manager approves → cloud register (idempotent) → local roster ACTIVE
 *
 * Invitation token alone is never treated as proof the host is trusted.
 */

export type PairingHelloResult = {
  protocolVersion: typeof LAN_PAIRING_PROTOCOL_VERSION;
  invitationId: string;
  attestation: SignedHostAttestation;
  hostPublicKeySpkiB64: string;
  hostFingerprintSha256Hex: string;
  tlsCertificateFingerprintSha256Hex: string;
  restaurantId: string;
  installationBindingId: string;
  licenseId: string;
  serverTime: string;
};

export type PairingCompletePendingResult = {
  status: 'AWAITING_APPROVAL';
  invitationId: string;
  clientFingerprintPrefix: string;
  label: string | null;
  expiresAt: string;
};

export type PairingApproveResult = {
  status: 'REDEEMED';
  terminalId: string;
  clientFingerprintPrefix: string;
  label: string | null;
  cloudSynced: true;
  idempotent: boolean;
};

export type PairingStatusResult =
  | {
      status: 'AWAITING_APPROVAL';
      invitationId: string;
      clientFingerprintPrefix: string;
      label: string | null;
      expiresAt: string;
      terminalId: null;
    }
  | {
      status: 'REDEEMED';
      invitationId: string;
      clientFingerprintPrefix: string;
      label: string | null;
      terminalId: string;
      redeemedAt: string;
      installationBindingId: string;
      restaurantId: string;
    }
  | {
      status: 'CANCELLED' | 'EXPIRED' | 'REJECTED';
      invitationId: string;
      clientFingerprintPrefix: string;
      terminalId: null;
      reason: string;
    };

/** Simple in-process rate limit for pairing endpoints (per invitation / IP key). */
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
/** Status polls are frequent (restart recovery); still bounded. */
const RATE_MAX_STATUS = 90;

export function resetPairingRateLimitsForTests(): void {
  rateBuckets.clear();
}

function assertRateLimit(key: string, max = RATE_MAX): void {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return;
  }
  bucket.count += 1;
  if (bucket.count > max) {
    throw new AppError(
      'Pairing rate limit exceeded',
      429,
      ErrorCode.LAN_PAIRING_RATE_LIMITED,
    );
  }
}

export class LanPairingService {
  public static async hello(input: {
    protocolVersion: number;
    invitationId: string;
    rateKey?: string;
  }): Promise<PairingHelloResult> {
    assertLanPairingProtocolReady();
    assertRateLimit(`hello:${input.rateKey ?? input.invitationId}`);

    if (input.protocolVersion !== LAN_PAIRING_PROTOCOL_VERSION) {
      throw new AppError(
        'Unsupported pairing protocol version',
        400,
        ErrorCode.LAN_PAIRING_PROTOCOL,
      );
    }

    const row = await LanPairingInvitationService.getUsableInvitationOrThrow(
      input.invitationId,
    );
    if (row.status !== LanPairingInvitationStatus.OPEN) {
      throw new AppError(
        'Pairing invitation is not open for hello',
        409,
        ErrorCode.LAN_PAIRING_INVALID,
      );
    }
    if (row.attemptCount >= row.maxAttempts) {
      throw new AppError(
        'Pairing invitation locked after too many failed attempts',
        429,
        ErrorCode.LAN_PAIRING_RATE_LIMITED,
      );
    }

    LanPairingInvitationService.assertBindingsMatchCurrentHost(row);

    const identity = HostIdentityService.getPublicMeta()!;
    const attestation = createHostAttestationOrThrow({ invitationId: row.id });

    return {
      protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
      invitationId: row.id,
      attestation,
      hostPublicKeySpkiB64: identity.publicKeySpkiB64,
      hostFingerprintSha256Hex: identity.fingerprintSha256Hex,
      tlsCertificateFingerprintSha256Hex: row.tlsCertificateFingerprintSha256Hex,
      restaurantId: row.restaurantId,
      installationBindingId: row.installationBindingId,
      licenseId: row.licenseId,
      serverTime: new Date().toISOString(),
    };
  }

  /**
   * Client presents invitation secret + key + proof.
   * Does NOT register with cloud yet — waits for manager approval on the host.
   */
  public static async complete(input: {
    protocolVersion: number;
    invitationId: string;
    invitationToken: string;
    clientPublicKey: string;
    clientProofSignature: string;
    label?: string;
    rateKey?: string;
  }): Promise<PairingCompletePendingResult> {
    assertLanPairingProtocolReady();
    assertRateLimit(`complete:${input.rateKey ?? input.invitationId}`);

    if (input.protocolVersion !== LAN_PAIRING_PROTOCOL_VERSION) {
      throw new AppError(
        'Unsupported pairing protocol version',
        400,
        ErrorCode.LAN_PAIRING_PROTOCOL,
      );
    }

    // Never echo invitationToken in errors / logs.
    const row = await LanPairingInvitationService.getUsableInvitationOrThrow(
      input.invitationId,
    );

    if (row.attemptCount >= row.maxAttempts) {
      throw new AppError(
        'Pairing invitation locked after too many failed attempts',
        429,
        ErrorCode.LAN_PAIRING_RATE_LIMITED,
      );
    }

    if (
      row.status !== LanPairingInvitationStatus.OPEN &&
      row.status !== LanPairingInvitationStatus.AWAITING_APPROVAL
    ) {
      throw new AppError(
        'Pairing invitation is not redeemable',
        409,
        ErrorCode.LAN_PAIRING_INVALID,
      );
    }

    try {
      LanPairingInvitationService.assertBindingsMatchCurrentHost(row);
      LanPairingInvitationService.assertTokenMatchesOrThrow(
        input.invitationToken,
        row.tokenHashSha256Hex,
      );
    } catch (err) {
      if (
        err instanceof AppError &&
        (err.errorCode === ErrorCode.LAN_PAIRING_INVALID ||
          err.errorCode === ErrorCode.LAN_TLS_PIN_MISMATCH)
      ) {
        try {
          await LanPairingInvitationService.recordFailedAttempt(row.id);
        } catch (rateErr) {
          throw rateErr;
        }
      }
      throw err;
    }

    let identity;
    try {
      identity = normalizeAndFingerprintTerminalPublicKey(input.clientPublicKey);
    } catch {
      await LanPairingInvitationService.recordFailedAttempt(row.id).catch(() => undefined);
      throw new AppError('Invalid client public key', 400, ErrorCode.LAN_PAIRING_INVALID);
    }

    const host = HostIdentityService.getPublicMeta()!;
    const proofOk = verifyPairingClientProof({
      claims: {
        invitationId: row.id,
        clientPublicKeySpkiB64: identity.publicKeySpkiB64,
        clientFingerprintSha256Hex: identity.fingerprintSha256Hex,
        hostFingerprintSha256Hex: host.fingerprintSha256Hex,
        tlsCertificateFingerprintSha256Hex: row.tlsCertificateFingerprintSha256Hex,
      },
      signatureBase64Url: input.clientProofSignature,
    });
    if (!proofOk) {
      await LanPairingInvitationService.recordFailedAttempt(row.id);
      throw new AppError(
        'Client pairing proof invalid',
        401,
        ErrorCode.LAN_PAIRING_INVALID,
      );
    }

    // Refuse reusing a different key on the same invitation after pending.
    if (
      row.status === LanPairingInvitationStatus.AWAITING_APPROVAL &&
      row.pendingClientFingerprintSha256Hex &&
      row.pendingClientFingerprintSha256Hex !== identity.fingerprintSha256Hex
    ) {
      throw new AppError(
        'Pairing invitation already has a pending client identity',
        409,
        ErrorCode.CONFLICT,
      );
    }

    const updated = await prisma.lanPairingInvitation.update({
      where: { id: row.id },
      data: {
        status: LanPairingInvitationStatus.AWAITING_APPROVAL,
        pendingClientPublicKeySpkiB64: identity.publicKeySpkiB64,
        pendingClientFingerprintSha256Hex: identity.fingerprintSha256Hex,
        pendingClientLabel: input.label ?? null,
        attemptCount: 0,
      },
    });

    return {
      status: 'AWAITING_APPROVAL',
      invitationId: updated.id,
      clientFingerprintPrefix: identity.fingerprintSha256Hex.slice(0, 12),
      label: updated.pendingClientLabel,
      expiresAt: updated.expiresAt.toISOString(),
    };
  }

  /**
   * Authenticated status poll / recovery (Phase 2D.9).
   * Bound to invitationId + client key fingerprint + possession proof.
   * Never registers seats. Never returns terminalId to wrong-key callers.
   * Does not require the invitation token (already consumed at complete).
   */
  public static async getStatus(input: {
    protocolVersion: number;
    invitationId: string;
    clientPublicKey: string;
    clientProofSignature: string;
    rateKey?: string;
  }): Promise<PairingStatusResult> {
    assertLanPairingProtocolReady();
    assertRateLimit(`status:${input.rateKey ?? input.invitationId}`, RATE_MAX_STATUS);

    if (input.protocolVersion !== LAN_PAIRING_PROTOCOL_VERSION) {
      throw new AppError(
        'Unsupported pairing protocol version',
        400,
        ErrorCode.LAN_PAIRING_PROTOCOL,
      );
    }

    const row = await prisma.lanPairingInvitation.findUnique({
      where: { id: input.invitationId },
    });
    if (!row) {
      throw new AppError('Pairing invitation not found', 404, ErrorCode.LAN_PAIRING_INVALID);
    }

    let identity;
    try {
      identity = normalizeAndFingerprintTerminalPublicKey(input.clientPublicKey);
    } catch {
      throw new AppError('Invalid client public key', 400, ErrorCode.LAN_PAIRING_INVALID);
    }

    // Constant-ish: always verify proof before revealing any pairing outcome.
    const proofOk = verifyPairingStatusProof({
      claims: {
        invitationId: row.id,
        clientFingerprintSha256Hex: identity.fingerprintSha256Hex,
      },
      clientPublicKeySpkiB64: identity.publicKeySpkiB64,
      signatureBase64Url: input.clientProofSignature,
    });
    if (!proofOk) {
      await LanPairingInvitationService.recordFailedAttempt(row.id).catch(() => undefined);
      throw new AppError(
        'Client pairing status proof invalid',
        401,
        ErrorCode.LAN_PAIRING_INVALID,
      );
    }

    // Bind to the client that completed pairing — wrong key never sees terminalId.
    if (
      !row.pendingClientFingerprintSha256Hex ||
      row.pendingClientFingerprintSha256Hex !== identity.fingerprintSha256Hex
    ) {
      throw new AppError(
        'Pairing session does not match this client identity',
        403,
        ErrorCode.LAN_PAIRING_INVALID,
      );
    }

    const fpPrefix = identity.fingerprintSha256Hex.slice(0, 12);

    if (row.status === LanPairingInvitationStatus.AWAITING_APPROVAL) {
      if (row.expiresAt.getTime() <= Date.now()) {
        await prisma.lanPairingInvitation.update({
          where: { id: row.id },
          data: { status: LanPairingInvitationStatus.EXPIRED },
        });
        return {
          status: 'EXPIRED',
          invitationId: row.id,
          clientFingerprintPrefix: fpPrefix,
          terminalId: null,
          reason: 'invitation_expired_before_approval',
        };
      }
      return {
        status: 'AWAITING_APPROVAL',
        invitationId: row.id,
        clientFingerprintPrefix: fpPrefix,
        label: row.pendingClientLabel,
        expiresAt: row.expiresAt.toISOString(),
        terminalId: null,
      };
    }

    if (row.status === LanPairingInvitationStatus.REDEEMED) {
      if (!row.redeemedTerminalId || !row.redeemedAt) {
        throw new AppError(
          'Redeemed invitation missing terminal binding',
          500,
          ErrorCode.INTERNAL_SERVER_ERROR,
        );
      }
      const visibleUntil =
        row.redeemedAt.getTime() + LAN_PAIRING_STATUS_LOOKUP_TTL_MS;
      if (Date.now() > visibleUntil) {
        return {
          status: 'EXPIRED',
          invitationId: row.id,
          clientFingerprintPrefix: fpPrefix,
          terminalId: null,
          reason: 'status_lookup_window_expired',
        };
      }

      // Confirm local roster still has this terminal (deny after approve).
      const roster = await prisma.lanTerminal.findUnique({
        where: {
          restaurantId_terminalId: {
            restaurantId: row.restaurantId,
            terminalId: row.redeemedTerminalId,
          },
        },
      });
      if (!roster) {
        return {
          status: 'REJECTED',
          invitationId: row.id,
          clientFingerprintPrefix: fpPrefix,
          terminalId: null,
          reason: 'terminal_missing_from_local_roster',
        };
      }
      if (roster.fingerprintSha256Hex !== identity.fingerprintSha256Hex) {
        throw new AppError(
          'Pairing session does not match this client identity',
          403,
          ErrorCode.LAN_PAIRING_INVALID,
        );
      }
      if (roster.localStatus !== 'ACTIVE') {
        return {
          status: 'REJECTED',
          invitationId: row.id,
          clientFingerprintPrefix: fpPrefix,
          terminalId: null,
          reason: 'terminal_denied_locally',
        };
      }

      return {
        status: 'REDEEMED',
        invitationId: row.id,
        clientFingerprintPrefix: fpPrefix,
        label: row.pendingClientLabel,
        terminalId: row.redeemedTerminalId,
        redeemedAt: row.redeemedAt.toISOString(),
        installationBindingId: row.installationBindingId,
        restaurantId: row.restaurantId,
      };
    }

    if (row.status === LanPairingInvitationStatus.CANCELLED) {
      return {
        status: 'CANCELLED',
        invitationId: row.id,
        clientFingerprintPrefix: fpPrefix,
        terminalId: null,
        reason: 'invitation_cancelled',
      };
    }

    if (row.status === LanPairingInvitationStatus.EXPIRED) {
      return {
        status: 'EXPIRED',
        invitationId: row.id,
        clientFingerprintPrefix: fpPrefix,
        terminalId: null,
        reason: 'invitation_expired',
      };
    }

    // OPEN without pending client — not a recoverable session for this key
    return {
      status: 'REJECTED',
      invitationId: row.id,
      clientFingerprintPrefix: fpPrefix,
      terminalId: null,
      reason: 'invitation_not_submitted',
    };
  }

  /**
   * Manager approves the pending client on the host screen, then registers with cloud.
   * Online-required: pairing succeeds only after cloud registration + local roster write.
   */
  public static async approve(input: {
    restaurantId: string;
    invitationId: string;
    managerPin: string;
    ipAddress?: string;
  }): Promise<PairingApproveResult> {
    assertLanPairingProtocolReady();

    const manager = await ManagerAuthService.verifyManagerPin({
      restaurantId: input.restaurantId,
      pin: input.managerPin,
      requiredPermission: 'terminals.pair',
    });

    const row = await LanPairingInvitationService.getUsableInvitationOrThrow(
      input.invitationId,
    );
    if (row.restaurantId !== input.restaurantId) {
      throw new AppError('Invitation restaurant mismatch', 403, ErrorCode.LAN_RESTAURANT_MISMATCH);
    }

    // Lost approve response: already REDEEMED — return existing terminal; never register again.
    if (
      row.status === LanPairingInvitationStatus.REDEEMED &&
      row.redeemedTerminalId &&
      row.pendingClientFingerprintSha256Hex
    ) {
      return {
        status: 'REDEEMED',
        terminalId: row.redeemedTerminalId,
        clientFingerprintPrefix: row.pendingClientFingerprintSha256Hex.slice(0, 12),
        label: row.pendingClientLabel,
        cloudSynced: true,
        idempotent: true,
      };
    }

    if (row.status !== LanPairingInvitationStatus.AWAITING_APPROVAL) {
      throw new AppError(
        'Pairing invitation is not awaiting approval',
        409,
        ErrorCode.LAN_PAIRING_INVALID,
      );
    }
    if (!row.pendingClientPublicKeySpkiB64 || !row.pendingClientFingerprintSha256Hex) {
      throw new AppError(
        'Pairing invitation has no pending client identity',
        409,
        ErrorCode.LAN_PAIRING_INVALID,
      );
    }

    LanPairingInvitationService.assertBindingsMatchCurrentHost(row);

    const identity = HostIdentityService.getPublicMeta()!;
    const installationId = identity.installationId!;
    const clientKey = row.pendingClientPublicKeySpkiB64;
    const clientFp = row.pendingClientFingerprintSha256Hex;
    const label = row.pendingClientLabel ?? undefined;

    const cloud = getLicensingCloudClient();
    if (!cloud) {
      throw new AppError(
        'Licensing cloud client not configured; pairing requires online registration',
        503,
        ErrorCode.SERVICE_UNAVAILABLE,
      );
    }

    let registerResult: CloudRegisterTerminalResult;
    try {
      registerResult = await cloud.registerTerminal({
        installationId,
        terminalPublicKey: clientKey,
        ...(label ? { label } : {}),
      });
    } catch (err) {
      // Lost response: register is idempotent for the same ACTIVE key — safe to retry once.
      if (isUnsafeBlindRetry(err) || (isLicensingCloudError(err) && err.kind === 'timeout')) {
        try {
          registerResult = await cloud.registerTerminal({
            installationId,
            terminalPublicKey: clientKey,
            ...(label ? { label } : {}),
          });
        } catch (retryErr) {
          // Recover via list: match fingerprint prefix to a cloud ACTIVE terminal.
          const recovered = await this.recoverRegisterFromList({
            restaurantId: input.restaurantId,
            installationId,
            clientPublicKey: clientKey,
            clientFingerprintSha256Hex: clientFp,
            ...(label ? { label } : {}),
          });
          if (recovered) {
            registerResult = recovered;
          } else {
            throw this.mapCloudError(retryErr);
          }
        }
      } else if (isLicensingCloudError(err) && (err.kind === 'network' || err.kind === 'timeout')) {
        throw new AppError(
          'Licensing cloud unavailable; pairing requires online registration',
          502,
          ErrorCode.LICENSING_CLOUD_NETWORK,
        );
      } else {
        throw this.mapCloudError(err);
      }
    }

    const terminalId = registerResult.terminal.terminalId;

    // Persist local roster only after successful cloud registration (or recovered idempotent).
    await LanTerminalService.upsertFromCloudRegistration({
      restaurantId: input.restaurantId,
      terminalId,
      publicKeySpki: clientKey,
      ...(label ? { label } : {}),
    });

    await prisma.lanPairingInvitation.update({
      where: { id: row.id },
      data: {
        status: LanPairingInvitationStatus.REDEEMED,
        redeemedAt: new Date(),
        redeemedTerminalId: terminalId,
      },
    });

    await AuditService.log({
      restaurantId: input.restaurantId,
      userId: manager.id,
      action: 'lan.pairing.approved',
      entityType: 'LanTerminal',
      entityId: terminalId,
      metadata: {
        invitationId: row.id,
        fingerprintPrefix: clientFp.slice(0, 12),
        idempotent: registerResult.idempotent,
        // never: public key full material, invitation token
      },
      ...(input.ipAddress !== undefined ? { ipAddress: input.ipAddress } : {}),
    });

    return {
      status: 'REDEEMED',
      terminalId,
      clientFingerprintPrefix: clientFp.slice(0, 12),
      label: label ?? null,
      cloudSynced: true,
      idempotent: registerResult.idempotent,
    };
  }

  /**
   * After a lost register response: list cloud terminals and match by fingerprint prefix.
   * Never invents keys from the prefix — uses the pending pairing SPKI we already hold.
   */
  private static async recoverRegisterFromList(input: {
    restaurantId: string;
    installationId: string;
    clientPublicKey: string;
    clientFingerprintSha256Hex: string;
    label?: string;
  }): Promise<CloudRegisterTerminalResult | null> {
    const cloud = getLicensingCloudClient();
    if (!cloud) return null;

    let list;
    try {
      list = await cloud.listTerminals({ installationId: input.installationId });
    } catch {
      return null;
    }

    const prefix = input.clientFingerprintSha256Hex.slice(0, 12);
    const match = list.terminals.find(
      (t) =>
        t.status === 'ACTIVE' &&
        t.deviceFingerprintPrefix === prefix,
    );
    if (!match) return null;

    return {
      idempotent: true,
      terminal: match,
      seats: list.seats,
    };
  }

  /** Optional: run reconciliation after pairing to ensure no unrecognized ACTIVE. */
  public static async reconcileAfterPairing(input: {
    restaurantId: string;
    installationId: string;
  }) {
    return LanReconciliationService.reconcileFromCloud(input);
  }

  private static mapCloudError(err: unknown): AppError {
    if (err instanceof AppError) return err;
    if (err instanceof LicensingCloudError || isLicensingCloudError(err)) {
      if (err.remoteCode === 'TERMINAL_SEAT_LIMIT_EXCEEDED') {
        return new AppError(err.message, 409, ErrorCode.LICENSING_CLOUD_DENIED);
      }
      const code =
        err.kind === 'network' || err.kind === 'timeout'
          ? ErrorCode.LICENSING_CLOUD_NETWORK
          : err.kind === 'auth'
            ? ErrorCode.LICENSING_CLOUD_AUTH
            : err.kind === 'malformed'
              ? ErrorCode.LICENSING_CLOUD_MALFORMED
              : ErrorCode.LICENSING_CLOUD_DENIED;
      return new AppError(err.message, err.kind === 'denied' || err.kind === 'conflict' ? 409 : 502, code);
    }
    return new AppError(
      err instanceof Error ? err.message : 'Cloud registration failed',
      502,
      ErrorCode.LICENSING_CLOUD_NETWORK,
    );
  }
}
