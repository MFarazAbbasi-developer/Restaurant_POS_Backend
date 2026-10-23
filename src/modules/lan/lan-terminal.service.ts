import {
  LanCloudSyncStatus,
  LanTerminalLocalStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError, NotFoundError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { AuditService } from '../../common/services/audit.service.js';
import { ManagerAuthService } from '../auth/manager-auth.service.js';
import { normalizeAndFingerprintTerminalPublicKey } from './crypto/terminal-device-key.js';
import { getLicensingCloudClient } from './licensing-cloud.client.js';

/**
 * Host-local LAN terminal roster (Phase 2D.3).
 * Cloud registration / pairing UI are deferred — upsert is for tests and future pairing.
 */

export class LanTerminalService {
  /**
   * Persist a cloud-registered terminal after successful licensing-api register/replace.
   * Captures full SPKI from the host's pairing context (never from list prefixes).
   */
  public static async upsertFromCloudRegistration(input: {
    restaurantId: string;
    terminalId: string;
    publicKeySpki: string;
    label?: string;
  }) {
    const identity = normalizeAndFingerprintTerminalPublicKey(input.publicKeySpki);
    const now = new Date();
    const label = input.label ?? null;
    return prisma.lanTerminal.upsert({
      where: {
        restaurantId_terminalId: {
          restaurantId: input.restaurantId,
          terminalId: input.terminalId,
        },
      },
      create: {
        restaurantId: input.restaurantId,
        terminalId: input.terminalId,
        publicKeySpkiB64: identity.publicKeySpkiB64,
        fingerprintSha256Hex: identity.fingerprintSha256Hex,
        label,
        localStatus: LanTerminalLocalStatus.ACTIVE,
        cloudSyncStatus: LanCloudSyncStatus.IN_SYNC,
        lastCloudSyncAt: now,
      },
      update: {
        publicKeySpkiB64: identity.publicKeySpkiB64,
        fingerprintSha256Hex: identity.fingerprintSha256Hex,
        ...(input.label !== undefined ? { label: input.label } : {}),
        localStatus: LanTerminalLocalStatus.ACTIVE,
        cloudSyncStatus: LanCloudSyncStatus.IN_SYNC,
        deniedAt: null,
        deniedReason: null,
        deniedByUserId: null,
        cloudSyncError: null,
        lastCloudSyncAt: now,
      },
    });
  }

  /**
   * Local-first revocation: commit DENIED, then attempt cloud deactivate.
   * Cloud failure leaves local deny in force and records pending/failed sync.
   */
  public static async denyTerminalLocalFirst(input: {
    restaurantId: string;
    terminalId: string;
    managerPin: string;
    reason?: string;
    installationId?: string;
    ipAddress?: string;
  }) {
    const manager = await ManagerAuthService.verifyManagerPin({
      restaurantId: input.restaurantId,
      pin: input.managerPin,
      requiredPermission: 'terminals.revoke',
    });

    const now = new Date();

    const denied = await prisma.$transaction(async (tx) => {
      const row = await tx.lanTerminal.findUnique({
        where: {
          restaurantId_terminalId: {
            restaurantId: input.restaurantId,
            terminalId: input.terminalId,
          },
        },
      });
      if (!row) {
        throw new NotFoundError('LAN terminal not found on local roster');
      }

      return tx.lanTerminal.update({
        where: { id: row.id },
        data: {
          localStatus: LanTerminalLocalStatus.DENIED,
          deniedAt: now,
          deniedReason: input.reason ?? 'manager_revoke',
          deniedByUserId: manager.id,
          cloudSyncStatus: LanCloudSyncStatus.PENDING_DEACTIVATE,
          cloudSyncError: null,
        },
      });
    });

    await AuditService.log({
      restaurantId: input.restaurantId,
      userId: manager.id,
      action: 'lan.terminal.deny_local',
      entityType: 'LanTerminal',
      entityId: denied.terminalId,
      metadata: {
        fingerprintPrefix: denied.fingerprintSha256Hex.slice(0, 12),
        reason: input.reason ?? 'manager_revoke',
        // no public key, no PIN
      },
      ...(input.ipAddress !== undefined ? { ipAddress: input.ipAddress } : {}),
    });

    const cloud = getLicensingCloudClient();
    if (!cloud || !input.installationId) {
      const updated = await prisma.lanTerminal.update({
        where: { id: denied.id },
        data: {
          cloudSyncStatus: LanCloudSyncStatus.SYNC_FAILED,
          cloudSyncError: cloud
            ? 'installationId required for cloud deactivate'
            : 'licensing cloud client not configured',
        },
      });
      await AuditService.log({
        restaurantId: input.restaurantId,
        userId: manager.id,
        action: 'lan.terminal.cloud_sync_pending',
        entityType: 'LanTerminal',
        entityId: denied.terminalId,
        metadata: { cloudSyncStatus: updated.cloudSyncStatus, error: updated.cloudSyncError },
        ...(input.ipAddress !== undefined ? { ipAddress: input.ipAddress } : {}),
      });
      return {
        terminal: updated,
        cloudSynced: false as const,
        manager,
      };
    }

    try {
      await cloud.deactivateTerminal({
        installationId: input.installationId,
        terminalId: input.terminalId,
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
      });
      const synced = await prisma.lanTerminal.update({
        where: { id: denied.id },
        data: {
          cloudSyncStatus: LanCloudSyncStatus.IN_SYNC,
          lastCloudSyncAt: new Date(),
          cloudSyncError: null,
        },
      });
      await AuditService.log({
        restaurantId: input.restaurantId,
        userId: manager.id,
        action: 'lan.terminal.cloud_deactivate_ok',
        entityType: 'LanTerminal',
        entityId: denied.terminalId,
        metadata: { fingerprintPrefix: denied.fingerprintSha256Hex.slice(0, 12) },
        ...(input.ipAddress !== undefined ? { ipAddress: input.ipAddress } : {}),
      });
      return { terminal: synced, cloudSynced: true as const, manager };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'cloud deactivate failed';
      const failed = await prisma.lanTerminal.update({
        where: { id: denied.id },
        data: {
          cloudSyncStatus: LanCloudSyncStatus.SYNC_FAILED,
          cloudSyncError: message.slice(0, 500),
        },
      });
      await AuditService.log({
        restaurantId: input.restaurantId,
        userId: manager.id,
        action: 'lan.terminal.cloud_sync_failed',
        entityType: 'LanTerminal',
        entityId: denied.terminalId,
        metadata: { error: message.slice(0, 200) },
        ...(input.ipAddress !== undefined ? { ipAddress: input.ipAddress } : {}),
      });
      // Local deny remains — do not throw away local denial.
      throw new AppError(
        'Terminal denied locally; cloud deactivation failed and will retry',
        502,
        ErrorCode.LAN_CLOUD_SYNC_FAILED,
        true,
        { terminalId: denied.terminalId, cloudSyncStatus: failed.cloudSyncStatus },
      );
    }
  }

  /** Retry cloud deactivate for terminals in PENDING_DEACTIVATE / SYNC_FAILED. */
  public static async retryCloudDeactivate(input: {
    restaurantId: string;
    terminalId: string;
    installationId: string;
    managerPin: string;
  }) {
    await ManagerAuthService.verifyManagerPin({
      restaurantId: input.restaurantId,
      pin: input.managerPin,
      requiredPermission: 'terminals.revoke',
    });

    const row = await prisma.lanTerminal.findUnique({
      where: {
        restaurantId_terminalId: {
          restaurantId: input.restaurantId,
          terminalId: input.terminalId,
        },
      },
    });
    if (!row) throw new NotFoundError('LAN terminal not found on local roster');
    if (row.localStatus !== LanTerminalLocalStatus.DENIED) {
      throw new AppError('Terminal is not locally denied', 409, ErrorCode.CONFLICT);
    }

    const cloud = getLicensingCloudClient();
    if (!cloud) {
      throw new AppError(
        'Licensing cloud client not configured',
        503,
        ErrorCode.SERVICE_UNAVAILABLE,
      );
    }

    try {
      await cloud.deactivateTerminal({
        installationId: input.installationId,
        terminalId: input.terminalId,
        ...(row.deniedReason ? { reason: row.deniedReason } : {}),
      });
      return prisma.lanTerminal.update({
        where: { id: row.id },
        data: {
          cloudSyncStatus: LanCloudSyncStatus.IN_SYNC,
          lastCloudSyncAt: new Date(),
          cloudSyncError: null,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'cloud deactivate failed';
      await prisma.lanTerminal.update({
        where: { id: row.id },
        data: {
          cloudSyncStatus: LanCloudSyncStatus.SYNC_FAILED,
          cloudSyncError: message.slice(0, 500),
        },
      });
      throw new AppError(
        'Cloud deactivation retry failed; local denial unchanged',
        502,
        ErrorCode.LAN_CLOUD_SYNC_FAILED,
      );
    }
  }

  public static async getActiveByTerminalId(restaurantId: string, terminalId: string) {
    return prisma.lanTerminal.findFirst({
      where: {
        restaurantId,
        terminalId,
        localStatus: LanTerminalLocalStatus.ACTIVE,
      },
    });
  }

  public static async findByTerminalId(restaurantId: string, terminalId: string) {
    return prisma.lanTerminal.findUnique({
      where: {
        restaurantId_terminalId: { restaurantId, terminalId },
      },
    });
  }

  public static isUniqueConflict(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
    );
  }
}
