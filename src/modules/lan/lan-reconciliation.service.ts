import { LanCloudSyncStatus, LanTerminalLocalStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import {
  getLicensingCloudClient,
  type CloudTerminalSummary,
  type LicensingCloudClient,
} from './licensing-cloud.client.js';
import { isLicensingCloudError } from './licensing-cloud.errors.js';

export type ReconciliationTerminalOutcome =
  | 'active'
  | 'denied_cloud_inactive'
  | 'denied_missing_on_cloud'
  | 'denied_fingerprint_mismatch'
  | 'denied_local_preserved'
  | 'unreconciled_conflict'
  | 'pending_sync_unchanged';

export type ReconciliationReport = {
  installationId: string;
  cloudOnline: boolean;
  outcomes: Array<{
    terminalId: string;
    outcome: ReconciliationTerminalOutcome;
    localStatus: LanTerminalLocalStatus;
    cloudSyncStatus: LanCloudSyncStatus;
  }>;
  errors: string[];
};

/**
 * Align local LAN roster to authenticated cloud terminal list (Phase 2D.4).
 *
 * Rules (2D.2a):
 * - Match cloud terminal IDs to local rows; fingerprint prefix must match local full key prefix.
 * - Never reconstruct a public key from the fingerprint prefix.
 * - Cloud non-ACTIVE or absent → not authorized locally (DENIED).
 * - Local DENIED stays denied even if cloud still ACTIVE or sync fails.
 * - Unknown / conflicting entries fail closed until reconciled or re-paired.
 * - Never silently restore access from a stale local backup.
 */
export class LanReconciliationService {
  public static async reconcileFromCloud(input: {
    restaurantId: string;
    installationId: string;
    client?: LicensingCloudClient;
  }): Promise<ReconciliationReport> {
    const client = input.client ?? getLicensingCloudClient();
    if (!client) {
      throw new AppError(
        'Licensing cloud client not configured',
        503,
        ErrorCode.SERVICE_UNAVAILABLE,
      );
    }

    let cloudList;
    try {
      cloudList = await client.listTerminals({ installationId: input.installationId });
    } catch (err) {
      if (isLicensingCloudError(err) && (err.kind === 'network' || err.kind === 'timeout')) {
        return {
          installationId: input.installationId,
          cloudOnline: false,
          outcomes: [],
          errors: [err.message],
        };
      }
      throw err;
    }

    const cloudById = new Map<string, CloudTerminalSummary>();
    for (const t of cloudList.terminals) {
      cloudById.set(t.terminalId, t);
    }

    const localRows = await prisma.lanTerminal.findMany({
      where: { restaurantId: input.restaurantId },
    });

    const outcomes: ReconciliationReport['outcomes'] = [];
    const now = new Date();

    for (const row of localRows) {
      // Local-first denial is never restored by cloud reconciliation.
      if (row.localStatus === LanTerminalLocalStatus.DENIED) {
        outcomes.push({
          terminalId: row.terminalId,
          outcome:
            row.cloudSyncStatus === LanCloudSyncStatus.PENDING_DEACTIVATE ||
            row.cloudSyncStatus === LanCloudSyncStatus.SYNC_FAILED
              ? 'pending_sync_unchanged'
              : 'denied_local_preserved',
          localStatus: row.localStatus,
          cloudSyncStatus: row.cloudSyncStatus,
        });
        continue;
      }

      const cloud = cloudById.get(row.terminalId);
      if (!cloud) {
        const updated = await prisma.lanTerminal.update({
          where: { id: row.id },
          data: {
            localStatus: LanTerminalLocalStatus.DENIED,
            deniedAt: now,
            deniedReason: 'cloud_absent_on_reconcile',
            cloudSyncStatus: LanCloudSyncStatus.IN_SYNC,
            lastCloudSyncAt: now,
            cloudSyncError: null,
          },
        });
        outcomes.push({
          terminalId: row.terminalId,
          outcome: 'denied_missing_on_cloud',
          localStatus: updated.localStatus,
          cloudSyncStatus: updated.cloudSyncStatus,
        });
        continue;
      }

      if (cloud.status !== 'ACTIVE') {
        const updated = await prisma.lanTerminal.update({
          where: { id: row.id },
          data: {
            localStatus: LanTerminalLocalStatus.DENIED,
            deniedAt: now,
            deniedReason: `cloud_status_${cloud.status}`,
            cloudSyncStatus: LanCloudSyncStatus.IN_SYNC,
            lastCloudSyncAt: now,
            cloudSyncError: null,
          },
        });
        outcomes.push({
          terminalId: row.terminalId,
          outcome: 'denied_cloud_inactive',
          localStatus: updated.localStatus,
          cloudSyncStatus: updated.cloudSyncStatus,
        });
        continue;
      }

      const localPrefix = row.fingerprintSha256Hex.slice(0, 12);
      const cloudPrefix = cloud.deviceFingerprintPrefix;
      if (!cloudPrefix || cloudPrefix !== localPrefix) {
        // Conflict: fail closed — do not invent keys from prefix.
        const updated = await prisma.lanTerminal.update({
          where: { id: row.id },
          data: {
            localStatus: LanTerminalLocalStatus.DENIED,
            deniedAt: now,
            deniedReason: 'fingerprint_prefix_mismatch',
            cloudSyncStatus: LanCloudSyncStatus.SYNC_FAILED,
            cloudSyncError: 'Cloud fingerprint prefix does not match local full key',
            lastCloudSyncAt: now,
          },
        });
        outcomes.push({
          terminalId: row.terminalId,
          outcome: 'denied_fingerprint_mismatch',
          localStatus: updated.localStatus,
          cloudSyncStatus: updated.cloudSyncStatus,
        });
        continue;
      }

      const updated = await prisma.lanTerminal.update({
        where: { id: row.id },
        data: {
          localStatus: LanTerminalLocalStatus.ACTIVE,
          cloudSyncStatus: LanCloudSyncStatus.IN_SYNC,
          lastCloudSyncAt: now,
          cloudSyncError: null,
          ...(cloud.label !== undefined && cloud.label !== null ? { label: cloud.label } : {}),
        },
      });
      outcomes.push({
        terminalId: row.terminalId,
        outcome: 'active',
        localStatus: updated.localStatus,
        cloudSyncStatus: updated.cloudSyncStatus,
      });
    }

    // Cloud ACTIVE terminals with no local full key → unreconciled (fail closed; require re-pair).
    for (const cloud of cloudList.terminals) {
      if (cloud.status !== 'ACTIVE') continue;
      const local = localRows.find((r) => r.terminalId === cloud.terminalId);
      if (!local) {
        outcomes.push({
          terminalId: cloud.terminalId,
          outcome: 'unreconciled_conflict',
          localStatus: LanTerminalLocalStatus.DENIED,
          cloudSyncStatus: LanCloudSyncStatus.SYNC_FAILED,
        });
      }
    }

    return {
      installationId: input.installationId,
      cloudOnline: true,
      outcomes,
      errors: [],
    };
  }

  /**
   * Retry pending cloud deactivations without restoring local denial.
   */
  public static async retryPendingCloudDeactivates(input: {
    restaurantId: string;
    installationId: string;
    client?: LicensingCloudClient;
  }): Promise<{ retried: number; succeeded: number; failed: number }> {
    const client = input.client ?? getLicensingCloudClient();
    if (!client) {
      throw new AppError(
        'Licensing cloud client not configured',
        503,
        ErrorCode.SERVICE_UNAVAILABLE,
      );
    }

    const pending = await prisma.lanTerminal.findMany({
      where: {
        restaurantId: input.restaurantId,
        localStatus: LanTerminalLocalStatus.DENIED,
        cloudSyncStatus: {
          in: [LanCloudSyncStatus.PENDING_DEACTIVATE, LanCloudSyncStatus.SYNC_FAILED],
        },
      },
    });

    let succeeded = 0;
    let failed = 0;
    for (const row of pending) {
      try {
        await client.deactivateTerminal({
          installationId: input.installationId,
          terminalId: row.terminalId,
          ...(row.deniedReason ? { reason: row.deniedReason } : {}),
        });
        await prisma.lanTerminal.update({
          where: { id: row.id },
          data: {
            // Keep DENIED — never restore access on successful cloud sync.
            localStatus: LanTerminalLocalStatus.DENIED,
            cloudSyncStatus: LanCloudSyncStatus.IN_SYNC,
            lastCloudSyncAt: new Date(),
            cloudSyncError: null,
          },
        });
        succeeded += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'cloud deactivate failed';
        await prisma.lanTerminal.update({
          where: { id: row.id },
          data: {
            localStatus: LanTerminalLocalStatus.DENIED,
            cloudSyncStatus: LanCloudSyncStatus.SYNC_FAILED,
            cloudSyncError: message.slice(0, 500),
          },
        });
        failed += 1;
      }
    }

    return { retried: pending.length, succeeded, failed };
  }

  /** Plane B gate helper: ACTIVE + reconciled local row required. */
  public static async assertLocallyAuthorized(input: {
    restaurantId: string;
    terminalId: string;
  }) {
    const row = await prisma.lanTerminal.findUnique({
      where: {
        restaurantId_terminalId: {
          restaurantId: input.restaurantId,
          terminalId: input.terminalId,
        },
      },
    });
    if (!row || row.localStatus !== LanTerminalLocalStatus.ACTIVE) {
      throw new AppError(
        'Terminal is not authorized on the local roster',
        403,
        ErrorCode.LAN_TERMINAL_DENIED,
      );
    }
    if (
      row.cloudSyncStatus === LanCloudSyncStatus.SYNC_FAILED &&
      row.deniedReason === 'fingerprint_prefix_mismatch'
    ) {
      throw new AppError(
        'Terminal roster conflict; re-pair required',
        403,
        ErrorCode.LAN_ROSTER_UNRECONCILED,
      );
    }
    return row;
  }
}
