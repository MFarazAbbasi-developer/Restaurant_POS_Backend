import type { Request, Response, NextFunction } from 'express';
import { LanTerminalService } from './lan-terminal.service.js';
import { LanPairingInvitationService } from './lan-pairing-invitation.service.js';
import { LanPairingService } from './lan-pairing.service.js';
import { LanHostStatusService } from './lan-host-status.service.js';
import { assertRemotePairingAllowed } from './lan-pairing-gate.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';

function clientRateKey(req: Request): string {
  return req.ip ?? 'unknown';
}

export class LanController {
  /** Host UI: LAN / TLS / pairing readiness (no secrets). */
  public static async getHostStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      await LanHostStatusService.assertStaffRestaurant(restaurantId);
      const data = await LanHostStatusService.getStatus({ restaurantId });
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /** Host UI: local terminal roster (fingerprint prefix only). */
  public static async listTerminals(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const data = await LanHostStatusService.listRoster({ restaurantId });
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /** Internal/test helper: record a cloud-registered terminal on the local roster. */
  public static async upsertTerminal(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const row = await LanTerminalService.upsertFromCloudRegistration({
        restaurantId,
        terminalId: req.body.terminalId,
        publicKeySpki: req.body.publicKeySpki,
        label: req.body.label,
      });
      res.status(200).json({
        success: true,
        data: {
          terminalId: row.terminalId,
          label: row.label,
          localStatus: row.localStatus,
          cloudSyncStatus: row.cloudSyncStatus,
          fingerprintPrefix: row.fingerprintSha256Hex.slice(0, 12),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public static async denyTerminal(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const result = await LanTerminalService.denyTerminalLocalFirst({
        restaurantId,
        terminalId: req.body.terminalId,
        managerPin: req.body.managerPin,
        ...(req.body.reason !== undefined ? { reason: req.body.reason } : {}),
        ...(req.body.installationId !== undefined
          ? { installationId: req.body.installationId }
          : {}),
        ...(req.ip !== undefined ? { ipAddress: req.ip } : {}),
      });
      res.status(200).json({
        success: true,
        data: {
          terminalId: result.terminal.terminalId,
          localStatus: result.terminal.localStatus,
          cloudSyncStatus: result.terminal.cloudSyncStatus,
          cloudSynced: result.cloudSynced,
          cloudSyncError: result.terminal.cloudSyncError,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public static async retryCloudSync(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const row = await LanTerminalService.retryCloudDeactivate({
        restaurantId,
        terminalId: req.body.terminalId,
        installationId: req.body.installationId,
        managerPin: req.body.managerPin,
      });
      res.status(200).json({
        success: true,
        data: {
          terminalId: row.terminalId,
          localStatus: row.localStatus,
          cloudSyncStatus: row.cloudSyncStatus,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /** Plane B probe — proves middleware without exposing POS mutations. */
  public static async lanPing(req: Request, res: Response): Promise<void> {
    res.status(200).json({
      success: true,
      data: {
        terminalId: req.lanAuth!.terminalId,
        fingerprintPrefix: req.lanAuth!.fingerprintPrefix,
        serverTime: new Date().toISOString(),
      },
    });
  }

  /**
   * Manager creates a short-lived invitation + OOB trust material for the host screen.
   * invitationToken is returned once here only — never logged.
   */
  public static async createPairingInvitation(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const material = await LanPairingInvitationService.createInvitation({
        restaurantId,
        managerPin: req.body.managerPin,
        createdByUserId: req.user!.id,
        ...(req.body.httpsBaseHint !== undefined
          ? { httpsBaseHint: req.body.httpsBaseHint }
          : {}),
        ...(req.ip !== undefined ? { ipAddress: req.ip } : {}),
      });
      res.status(201).json({ success: true, data: material });
    } catch (err) {
      next(err);
    }
  }

  public static async cancelPairingInvitation(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const result = await LanPairingInvitationService.cancelOpenInvitation({
        restaurantId,
        managerPin: req.body.managerPin,
        ...(req.body.invitationId !== undefined
          ? { invitationId: req.body.invitationId }
          : {}),
        ...(req.ip !== undefined ? { ipAddress: req.ip } : {}),
      });
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  public static async approvePairing(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const result = await LanPairingService.approve({
        restaurantId,
        invitationId: req.body.invitationId,
        managerPin: req.body.managerPin,
        ...(req.ip !== undefined ? { ipAddress: req.ip } : {}),
      });
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  public static async pairingHello(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      // Protocol may run on loopback for verification; remote non-loopback stays gated separately.
      const result = await LanPairingService.hello({
        protocolVersion: req.body.protocolVersion,
        invitationId: req.body.invitationId,
        rateKey: clientRateKey(req),
      });
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  public static async pairingComplete(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await LanPairingService.complete({
        protocolVersion: req.body.protocolVersion,
        invitationId: req.body.invitationId,
        invitationToken: req.body.invitationToken,
        clientPublicKey: req.body.clientPublicKey,
        clientProofSignature: req.body.clientProofSignature,
        ...(req.body.label !== undefined ? { label: req.body.label } : {}),
        rateKey: clientRateKey(req),
      });
      // Never include invitationToken in response.
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      // Ensure error messages never include the presented token.
      if (err instanceof AppError && typeof err.message === 'string') {
        if (req.body?.invitationToken && err.message.includes(req.body.invitationToken)) {
          next(
            new AppError('Invalid pairing invitation', 401, ErrorCode.LAN_PAIRING_INVALID),
          );
          return;
        }
      }
      next(err);
    }
  }

  /**
   * Authenticated pairing status / recovery (Phase 2D.9).
   * Bound to invitationId + client key; never registers seats; never returns
   * terminalId without a valid possession proof for the pending/redeemed client.
   */
  public static async pairingStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await LanPairingService.getStatus({
        protocolVersion: req.body.protocolVersion,
        invitationId: req.body.invitationId,
        clientPublicKey: req.body.clientPublicKey,
        clientProofSignature: req.body.clientProofSignature,
        rateKey: clientRateKey(req),
      });
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Stub for future remote cancel — remote binding remains disabled.
   * Host operators use staff JWT cancelPairingInvitation instead.
   */
  public static async pairingCancelRemote(
    _req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      assertRemotePairingAllowed();
      next(
        new AppError(
          'Remote pairing cancel is not exposed; use staff pairing cancel on the host',
          501,
          ErrorCode.LAN_PAIRING_DISABLED,
        ),
      );
    } catch (err) {
      next(err);
    }
  }
}
