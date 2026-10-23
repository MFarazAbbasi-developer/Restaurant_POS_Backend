import { LanPairingInvitationStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { AuditService } from '../../common/services/audit.service.js';
import { ManagerAuthService } from '../auth/manager-auth.service.js';
import { HostIdentityService } from './host-identity/host-identity.service.js';
import { TlsCertificateService } from './tls/tls-certificate.service.js';
import { sha256HexOfDer } from './crypto/host-attestation.js';
import {
  generatePairingInvitationToken,
  hashPairingInvitationToken,
  verifyPairingInvitationToken,
  LAN_PAIRING_INVITATION_MAX_ATTEMPTS,
  LAN_PAIRING_INVITATION_TTL_MS,
  LAN_PAIRING_PROTOCOL_VERSION,
  assertInvitationTokenEntropy,
} from './crypto/pairing-invitation-token.js';
import { assertLanPairingProtocolReady } from './lan-pairing-gate.js';

/**
 * One-time pairing invitation lifecycle (Phase 2D.7).
 * Token plaintext is returned once to the host screen and never persisted.
 */

export type HostScreenPairingMaterial = {
  protocolVersion: typeof LAN_PAIRING_PROTOCOL_VERSION;
  invitationId: string;
  /** Shown once on host screen / QR — never logged. */
  invitationToken: string;
  expiresAt: string;
  httpsBaseHint: string;
  hostFingerprintSha256Hex: string;
  hostPublicKeySpkiB64: string;
  tlsCertificateFingerprintSha256Hex: string;
  restaurantId: string;
  installationBindingId: string;
  licenseId: string;
  note: string;
};

function activeStatuses(): LanPairingInvitationStatus[] {
  return [LanPairingInvitationStatus.OPEN, LanPairingInvitationStatus.AWAITING_APPROVAL];
}

export class LanPairingInvitationService {
  /**
   * Manager-authenticated invitation creation.
   * Cancels any previous OPEN / AWAITING_APPROVAL invitation for the restaurant.
   */
  public static async createInvitation(input: {
    restaurantId: string;
    managerPin: string;
    createdByUserId?: string;
    httpsBaseHint?: string;
    ttlMs?: number;
    ipAddress?: string;
  }): Promise<HostScreenPairingMaterial> {
    assertLanPairingProtocolReady();

    const manager = await ManagerAuthService.verifyManagerPin({
      restaurantId: input.restaurantId,
      pin: input.managerPin,
      requiredPermission: 'terminals.pair',
    });

    const identity = HostIdentityService.getPublicMeta();
    if (!identity?.activated || !identity.installationId || !identity.licenseId) {
      throw new AppError(
        'Host must be activated before creating a pairing invitation',
        403,
        ErrorCode.HOST_IDENTITY_UNAVAILABLE,
      );
    }
    if (identity.restaurantId && identity.restaurantId !== input.restaurantId) {
      throw new AppError(
        'Host identity is bound to a different restaurant',
        403,
        ErrorCode.LAN_RESTAURANT_MISMATCH,
      );
    }

    const tlsMeta = TlsCertificateService.getPublicMeta();
    const tlsDer = TlsCertificateService.getCertificateDer();
    const tlsFp = sha256HexOfDer(tlsDer);
    if (!tlsMeta || tlsMeta.fingerprintSha256Hex !== tlsFp) {
      throw new AppError(
        'TLS certificate fingerprint unavailable or mismatched',
        503,
        ErrorCode.LAN_TLS_REQUIRED,
      );
    }

    const token = generatePairingInvitationToken();
    assertInvitationTokenEntropy(token);
    const tokenHash = hashPairingInvitationToken(token);
    const ttl = input.ttlMs ?? LAN_PAIRING_INVITATION_TTL_MS;
    const expiresAt = new Date(Date.now() + ttl);
    const now = new Date();

    const invitation = await prisma.$transaction(async (tx) => {
      await tx.lanPairingInvitation.updateMany({
        where: {
          restaurantId: input.restaurantId,
          status: { in: activeStatuses() },
        },
        data: {
          status: LanPairingInvitationStatus.CANCELLED,
          cancelledAt: now,
        },
      });

      return tx.lanPairingInvitation.create({
        data: {
          restaurantId: input.restaurantId,
          tokenHashSha256Hex: tokenHash,
          status: LanPairingInvitationStatus.OPEN,
          protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
          hostFingerprintSha256Hex: identity.fingerprintSha256Hex,
          tlsCertificateFingerprintSha256Hex: tlsFp,
          installationBindingId: identity.installationId!,
          licenseId: identity.licenseId!,
          expiresAt,
          maxAttempts: LAN_PAIRING_INVITATION_MAX_ATTEMPTS,
          createdByUserId: input.createdByUserId ?? manager.id,
        },
      });
    });

    await AuditService.log({
      restaurantId: input.restaurantId,
      userId: manager.id,
      action: 'lan.pairing.invitation_created',
      entityType: 'LanPairingInvitation',
      entityId: invitation.id,
      metadata: {
        expiresAt: expiresAt.toISOString(),
        hostFingerprintPrefix: identity.fingerprintSha256Hex.slice(0, 12),
        tlsFingerprintPrefix: tlsFp.slice(0, 12),
        // never: invitationToken, tokenHash
      },
      ...(input.ipAddress !== undefined ? { ipAddress: input.ipAddress } : {}),
    });

    return {
      protocolVersion: LAN_PAIRING_PROTOCOL_VERSION,
      invitationId: invitation.id,
      invitationToken: token,
      expiresAt: expiresAt.toISOString(),
      httpsBaseHint: input.httpsBaseHint ?? 'https://127.0.0.1/',
      hostFingerprintSha256Hex: identity.fingerprintSha256Hex,
      hostPublicKeySpkiB64: identity.publicKeySpkiB64,
      tlsCertificateFingerprintSha256Hex: tlsFp,
      restaurantId: input.restaurantId,
      installationBindingId: identity.installationId!,
      licenseId: identity.licenseId!,
      note:
        'Show invitationToken + fingerprints on the host screen only. ' +
        'Clients must verify the TLS pin from this out-of-band material before trusting HTTPS. ' +
        'Do not log or put the invitation token in URLs.',
    };
  }

  public static async cancelOpenInvitation(input: {
    restaurantId: string;
    managerPin: string;
    invitationId?: string;
    ipAddress?: string;
  }) {
    assertLanPairingProtocolReady();

    const manager = await ManagerAuthService.verifyManagerPin({
      restaurantId: input.restaurantId,
      pin: input.managerPin,
      requiredPermission: 'terminals.pair',
    });

    const where: Prisma.LanPairingInvitationWhereInput = {
      restaurantId: input.restaurantId,
      status: { in: activeStatuses() },
      ...(input.invitationId ? { id: input.invitationId } : {}),
    };

    const now = new Date();
    const result = await prisma.lanPairingInvitation.updateMany({
      where,
      data: {
        status: LanPairingInvitationStatus.CANCELLED,
        cancelledAt: now,
      },
    });

    await AuditService.log({
      restaurantId: input.restaurantId,
      userId: manager.id,
      action: 'lan.pairing.invitation_cancelled',
      entityType: 'LanPairingInvitation',
      entityId: input.invitationId ?? 'bulk',
      metadata: { cancelledCount: result.count },
      ...(input.ipAddress !== undefined ? { ipAddress: input.ipAddress } : {}),
    });

    return { cancelledCount: result.count };
  }

  /**
   * Invalidate invitations whose TLS or host binding no longer matches active material
   * (e.g. after certificate rotation).
   */
  public static async invalidateForRotatedTrust(input: {
    restaurantId?: string;
  }): Promise<number> {
    const identity = HostIdentityService.getPublicMeta();
    let currentTlsFp: string | null = null;
    try {
      currentTlsFp = sha256HexOfDer(TlsCertificateService.getCertificateDer());
    } catch {
      currentTlsFp = null;
    }

    const now = new Date();
    const open = await prisma.lanPairingInvitation.findMany({
      where: {
        status: { in: activeStatuses() },
        ...(input.restaurantId ? { restaurantId: input.restaurantId } : {}),
      },
    });

    let invalidated = 0;
    for (const row of open) {
      const tlsMismatch =
        !currentTlsFp || row.tlsCertificateFingerprintSha256Hex !== currentTlsFp;
      const hostMismatch =
        !identity || row.hostFingerprintSha256Hex !== identity.fingerprintSha256Hex;
      if (tlsMismatch || hostMismatch) {
        await prisma.lanPairingInvitation.update({
          where: { id: row.id },
          data: {
            status: LanPairingInvitationStatus.CANCELLED,
            cancelledAt: now,
          },
        });
        invalidated += 1;
      }
    }
    return invalidated;
  }

  /** Load invitation and mark expired if past TTL. Never returns token plaintext. */
  public static async getUsableInvitationOrThrow(invitationId: string) {
    const row = await prisma.lanPairingInvitation.findUnique({
      where: { id: invitationId },
    });
    if (!row) {
      throw new AppError('Pairing invitation not found', 404, ErrorCode.LAN_PAIRING_INVALID);
    }

    if (
      (row.status === LanPairingInvitationStatus.OPEN ||
        row.status === LanPairingInvitationStatus.AWAITING_APPROVAL) &&
      row.expiresAt.getTime() <= Date.now()
    ) {
      await prisma.lanPairingInvitation.update({
        where: { id: row.id },
        data: { status: LanPairingInvitationStatus.EXPIRED },
      });
      throw new AppError('Pairing invitation has expired', 410, ErrorCode.LAN_PAIRING_EXPIRED);
    }

    return row;
  }

  public static async recordFailedAttempt(invitationId: string): Promise<void> {
    const row = await prisma.lanPairingInvitation.findUnique({ where: { id: invitationId } });
    if (!row) return;
    const next = row.attemptCount + 1;
    const data: Prisma.LanPairingInvitationUpdateInput = {
      attemptCount: next,
    };
    if (next >= row.maxAttempts && activeStatuses().includes(row.status)) {
      data.status = LanPairingInvitationStatus.CANCELLED;
      data.cancelledAt = new Date();
    }
    await prisma.lanPairingInvitation.update({ where: { id: invitationId }, data });
    if (next >= row.maxAttempts) {
      throw new AppError(
        'Pairing invitation locked after too many failed attempts',
        429,
        ErrorCode.LAN_PAIRING_RATE_LIMITED,
      );
    }
  }

  public static assertTokenMatchesOrThrow(
    presentedToken: string,
    storedHashSha256Hex: string,
  ): void {
    if (!verifyPairingInvitationToken(presentedToken, storedHashSha256Hex)) {
      throw new AppError('Invalid pairing invitation', 401, ErrorCode.LAN_PAIRING_INVALID);
    }
  }

  public static assertBindingsMatchCurrentHost(row: {
    hostFingerprintSha256Hex: string;
    tlsCertificateFingerprintSha256Hex: string;
    installationBindingId: string;
    licenseId: string;
    restaurantId: string;
    protocolVersion: number;
  }): void {
    if (row.protocolVersion !== LAN_PAIRING_PROTOCOL_VERSION) {
      throw new AppError(
        'Unsupported pairing protocol version',
        400,
        ErrorCode.LAN_PAIRING_PROTOCOL,
      );
    }

    const identity = HostIdentityService.getPublicMeta();
    if (!identity?.activated) {
      throw new AppError(
        'Host identity is not activated',
        503,
        ErrorCode.HOST_IDENTITY_UNAVAILABLE,
      );
    }
    if (row.hostFingerprintSha256Hex !== identity.fingerprintSha256Hex) {
      throw new AppError(
        'Invitation host binding no longer matches active host identity',
        403,
        ErrorCode.LAN_PAIRING_INVALID,
      );
    }
    if (
      identity.installationId &&
      row.installationBindingId !== identity.installationId
    ) {
      throw new AppError(
        'Invitation installation binding mismatch',
        403,
        ErrorCode.LAN_RESTAURANT_MISMATCH,
      );
    }
    if (identity.licenseId && row.licenseId !== identity.licenseId) {
      throw new AppError(
        'Invitation license binding mismatch',
        403,
        ErrorCode.LAN_RESTAURANT_MISMATCH,
      );
    }
    if (identity.restaurantId && identity.restaurantId !== row.restaurantId) {
      throw new AppError(
        'Invitation restaurant binding mismatch',
        403,
        ErrorCode.LAN_RESTAURANT_MISMATCH,
      );
    }

    let tlsFp: string;
    try {
      tlsFp = sha256HexOfDer(TlsCertificateService.getCertificateDer());
    } catch {
      throw new AppError(
        'TLS certificate required for pairing',
        503,
        ErrorCode.LAN_TLS_REQUIRED,
      );
    }
    if (row.tlsCertificateFingerprintSha256Hex !== tlsFp) {
      throw new AppError(
        'Invitation TLS pin no longer matches active certificate; re-issue pairing',
        403,
        ErrorCode.LAN_TLS_PIN_MISMATCH,
      );
    }
  }
}
