import { LanPairingInvitationStatus, LanTerminalLocalStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { HostIdentityService } from './host-identity/host-identity.service.js';
import { TlsCertificateService } from './tls/tls-certificate.service.js';
import {
  getLanRuntime,
  resolveAuthoritativeRestaurantId,
} from './lan-runtime.js';
import {
  evaluateRemoteExposureGate,
  isLanPairingProtocolReady,
  isRemoteLanPairingEnabled,
  type RemoteExposureGateSnapshot,
} from './lan-pairing-gate.js';
import { sha256HexOfDer } from './crypto/host-attestation.js';

/**
 * Host-facing LAN status for the pairing UI (Phase 2D.8 / 2D.9).
 * Never includes invitation tokens, private keys, or full unrestricted history.
 */

export type LanHostStatusSnapshot = {
  restaurantId: string | null;
  setupComplete: boolean;
  lanRuntimeEnabled: boolean;
  hostActivated: boolean;
  pairingProtocolReady: boolean;
  /** False until feature latch + operator env + TLS/host prerequisites. */
  remoteLanPairingEnabled: boolean;
  remoteExposureGate: RemoteExposureGateSnapshot;
  httpsLoopbackOnly: true;
  httpsBaseHint: string | null;
  httpBaseHint: string;
  host: {
    fingerprintSha256Hex: string | null;
    fingerprintPrefix: string | null;
    publicKeySpkiB64: string | null;
    installationId: string | null;
    licenseId: string | null;
  };
  tls: {
    provisioned: boolean;
    fingerprintSha256Hex: string | null;
    fingerprintPrefix: string | null;
    notBefore: string | null;
    notAfter: string | null;
    previousFingerprintPrefix: string | null;
  };
  seats: {
    /** From cached entitlement when present; null if unknown. */
    terminalLimit: number | null;
    hostCountsAsSeat: true;
    localActiveAdditionalTerminals: number;
    localDeniedTerminals: number;
    /** Honest: null when cloud list not fetched for this snapshot. */
    cloudSeatsUsed: number | null;
    cloudSeatsAvailable: number | null;
  };
  pendingApprovals: Array<{
    invitationId: string;
    expiresAt: string;
    clientFingerprintPrefix: string | null;
    label: string | null;
    status: 'AWAITING_APPROVAL';
  }>;
  openInvitation: {
    invitationId: string;
    expiresAt: string;
    status: 'OPEN' | 'AWAITING_APPROVAL';
    /** Never includes invitationToken. */
    hasPendingClient: boolean;
    clientFingerprintPrefix: string | null;
    label: string | null;
  } | null;
  disabledReason: string | null;
  honestyNote: string;
};

export type LanTerminalRosterRow = {
  terminalId: string;
  label: string | null;
  fingerprintPrefix: string;
  localStatus: LanTerminalLocalStatus;
  cloudSyncStatus: string;
  deniedAt: string | null;
  deniedReason: string | null;
  cloudSyncError: string | null;
  lastCloudSyncAt: string | null;
  createdAt: string;
};

function httpsPort(): number {
  return env.HTTPS_PORT ?? env.PORT + 1;
}

export class LanHostStatusService {
  public static async getStatus(input: {
    restaurantId: string;
  }): Promise<LanHostStatusSnapshot> {
    const runtime = getLanRuntime();
    const identity = HostIdentityService.getPublicMeta();
    const tlsMeta = TlsCertificateService.getPublicMeta();
    let tlsFp: string | null = null;
    try {
      tlsFp = sha256HexOfDer(TlsCertificateService.getCertificateDer());
    } catch {
      tlsFp = null;
    }

    const [activeCount, deniedCount, pending, open, trust] = await Promise.all([
      prisma.lanTerminal.count({
        where: {
          restaurantId: input.restaurantId,
          localStatus: LanTerminalLocalStatus.ACTIVE,
        },
      }),
      prisma.lanTerminal.count({
        where: {
          restaurantId: input.restaurantId,
          localStatus: LanTerminalLocalStatus.DENIED,
        },
      }),
      prisma.lanPairingInvitation.findMany({
        where: {
          restaurantId: input.restaurantId,
          status: LanPairingInvitationStatus.AWAITING_APPROVAL,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          expiresAt: true,
          pendingClientFingerprintSha256Hex: true,
          pendingClientLabel: true,
        },
      }),
      prisma.lanPairingInvitation.findFirst({
        where: {
          restaurantId: input.restaurantId,
          status: {
            in: [
              LanPairingInvitationStatus.OPEN,
              LanPairingInvitationStatus.AWAITING_APPROVAL,
            ],
          },
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          expiresAt: true,
          status: true,
          pendingClientFingerprintSha256Hex: true,
          pendingClientLabel: true,
        },
      }),
      prisma.hostLicensingTrustState.findUnique({
        where: { restaurantId: input.restaurantId },
        select: { cachedEntitlement: true },
      }),
    ]);

    let terminalLimit: number | null = null;
    const cached = trust?.cachedEntitlement as
      | { claims?: { terminalLimit?: number } }
      | null;
    if (
      cached?.claims &&
      typeof cached.claims.terminalLimit === 'number' &&
      Number.isFinite(cached.claims.terminalLimit)
    ) {
      terminalLimit = cached.claims.terminalLimit;
    }

    const host = env.HOST || '127.0.0.1';
    const httpsHint =
      tlsFp && isLanPairingProtocolReady()
        ? `https://${host}:${httpsPort()}`
        : null;

    return {
      restaurantId: input.restaurantId,
      setupComplete: runtime.setupComplete,
      lanRuntimeEnabled: runtime.lanEnabled,
      hostActivated: Boolean(identity?.activated),
      pairingProtocolReady: isLanPairingProtocolReady(),
      remoteLanPairingEnabled: isRemoteLanPairingEnabled(),
      remoteExposureGate: evaluateRemoteExposureGate(),
      httpsLoopbackOnly: true as const,
      httpsBaseHint: httpsHint,
      httpBaseHint: `http://${host}:${env.PORT}`,
      host: {
        fingerprintSha256Hex: identity?.fingerprintSha256Hex ?? null,
        fingerprintPrefix: identity
          ? identity.fingerprintSha256Hex.slice(0, 12)
          : null,
        publicKeySpkiB64: identity?.publicKeySpkiB64 ?? null,
        installationId: identity?.installationId ?? null,
        licenseId: identity?.licenseId ?? null,
      },
      tls: {
        provisioned: Boolean(tlsFp),
        fingerprintSha256Hex: tlsFp,
        fingerprintPrefix: tlsFp ? tlsFp.slice(0, 12) : null,
        notBefore: tlsMeta?.notBefore ?? null,
        notAfter: tlsMeta?.notAfter ?? null,
        previousFingerprintPrefix: tlsMeta?.previousFingerprintSha256Hex
          ? tlsMeta.previousFingerprintSha256Hex.slice(0, 12)
          : null,
      },
      seats: {
        terminalLimit,
        hostCountsAsSeat: true,
        localActiveAdditionalTerminals: activeCount,
        localDeniedTerminals: deniedCount,
        cloudSeatsUsed: null,
        cloudSeatsAvailable:
          terminalLimit !== null
            ? Math.max(0, terminalLimit - 1 - activeCount)
            : null,
      },
      pendingApprovals: pending.map((p) => ({
        invitationId: p.id,
        expiresAt: p.expiresAt.toISOString(),
        clientFingerprintPrefix: p.pendingClientFingerprintSha256Hex
          ? p.pendingClientFingerprintSha256Hex.slice(0, 12)
          : null,
        label: p.pendingClientLabel,
        status: 'AWAITING_APPROVAL' as const,
      })),
      openInvitation: open
        ? {
            invitationId: open.id,
            expiresAt: open.expiresAt.toISOString(),
            status: open.status as 'OPEN' | 'AWAITING_APPROVAL',
            hasPendingClient: Boolean(open.pendingClientFingerprintSha256Hex),
            clientFingerprintPrefix: open.pendingClientFingerprintSha256Hex
              ? open.pendingClientFingerprintSha256Hex.slice(0, 12)
              : null,
            label: open.pendingClientLabel,
          }
        : null,
      disabledReason: runtime.disabledReason,
      honestyNote:
        'Statuses reflect local host runtime only. "Secure" LAN is not claimed until ' +
        'clients verify the TLS pin out-of-band and remote binding remains disabled. ' +
        'HTTPS is loopback-only.',
    };
  }

  public static async listRoster(input: {
    restaurantId: string;
  }): Promise<LanTerminalRosterRow[]> {
    const rows = await prisma.lanTerminal.findMany({
      where: { restaurantId: input.restaurantId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      terminalId: r.terminalId,
      label: r.label,
      fingerprintPrefix: r.fingerprintSha256Hex.slice(0, 12),
      localStatus: r.localStatus,
      cloudSyncStatus: r.cloudSyncStatus,
      deniedAt: r.deniedAt?.toISOString() ?? null,
      deniedReason: r.deniedReason,
      cloudSyncError: r.cloudSyncError,
      lastCloudSyncAt: r.lastCloudSyncAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Resolve restaurant for staff JWT user against authoritative LAN binding. */
  public static async assertStaffRestaurant(restaurantId: string): Promise<void> {
    const resolved = await resolveAuthoritativeRestaurantId();
    if (resolved.ok && resolved.restaurantId !== restaurantId) {
      // Staff JWT restaurant is source for local UI; mismatch is informational only.
      // Do not throw — single-restaurant hosts are the supported case.
    }
  }
}
