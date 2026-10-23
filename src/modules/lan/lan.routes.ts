import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { requirePermission } from '../../common/middlewares/permission.middleware.js';
import { validateRequest } from '../../common/middlewares/validate.middleware.js';
import { LanController } from './lan.controller.js';
import {
  requireLanClientSignature,
  bindLanRestaurantFromRuntime,
} from './middlewares/lan-client-auth.middleware.js';
import {
  approveLanPairingBodySchema,
  cancelLanPairingInvitationBodySchema,
  createLanPairingInvitationBodySchema,
  denyLanTerminalBodySchema,
  pairingCompleteBodySchema,
  pairingHelloBodySchema,
  pairingStatusBodySchema,
  retryLanTerminalSyncBodySchema,
  upsertLanTerminalBodySchema,
} from './lan.schema.js';
import { assertLanPairingProtocolReady } from './lan-pairing-gate.js';
import { lanPosRouter } from './lan-pos.routes.js';

function requirePairingProtocolReady(
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    assertLanPairingProtocolReady();
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * LAN foundation routes (Phase 2D.3 / 2D.5 / 2D.7).
 * - Staff JWT: roster upsert/deny + pairing invitation create/cancel/approve (host screen).
 * - Plane B ping: signature probe only.
 * - Plane B POS: `/lan/v1/pos/*` central boundary.
 * - Pairing hello/complete/status: protocol handlers (require activated host + TLS).
 * - Remote non-loopback exposure remains disabled (see lan-pairing-gate).
 */

export const lanStaffRouter = Router();

lanStaffRouter.use(authenticate);

lanStaffRouter.get(
  '/status',
  requirePermission('terminals.pair'),
  LanController.getHostStatus,
);

lanStaffRouter.get(
  '/terminals',
  requirePermission('terminals.pair'),
  LanController.listTerminals,
);

lanStaffRouter.post(
  '/terminals',
  requirePermission('terminals.revoke'),
  validateRequest({ body: upsertLanTerminalBodySchema }),
  LanController.upsertTerminal,
);

lanStaffRouter.post(
  '/terminals/deny',
  requirePermission('terminals.revoke'),
  validateRequest({ body: denyLanTerminalBodySchema }),
  LanController.denyTerminal,
);

lanStaffRouter.post(
  '/terminals/retry-cloud-sync',
  requirePermission('terminals.revoke'),
  validateRequest({ body: retryLanTerminalSyncBodySchema }),
  LanController.retryCloudSync,
);

lanStaffRouter.post(
  '/pairing/invitations',
  requirePermission('terminals.pair'),
  validateRequest({ body: createLanPairingInvitationBodySchema }),
  LanController.createPairingInvitation,
);

lanStaffRouter.post(
  '/pairing/invitations/cancel',
  requirePermission('terminals.pair'),
  validateRequest({ body: cancelLanPairingInvitationBodySchema }),
  LanController.cancelPairingInvitation,
);

lanStaffRouter.post(
  '/pairing/approve',
  requirePermission('terminals.pair'),
  validateRequest({ body: approveLanPairingBodySchema }),
  LanController.approvePairing,
);

export const lanClientRouter = Router();

/** Lightweight Plane B probe — roster + signature only; not a pairing surface. */
lanClientRouter.get(
  '/ping',
  bindLanRestaurantFromRuntime,
  requireLanClientSignature,
  LanController.lanPing,
);

/** Central remote POS boundary (Plane B + entitlement + existing auth/RBAC). */
lanClientRouter.use('/pos', lanPosRouter);

/**
 * Pairing protocol (Phase 2D.7).
 * Enabled when host is activated + TLS provisioned. Does not enable non-loopback bind.
 * Invitation token alone is not host trust — clients must verify OOB TLS pin first.
 */
lanClientRouter.post(
  '/pairing/hello',
  requirePairingProtocolReady,
  validateRequest({ body: pairingHelloBodySchema }),
  LanController.pairingHello,
);

lanClientRouter.post(
  '/pairing/complete',
  requirePairingProtocolReady,
  validateRequest({ body: pairingCompleteBodySchema }),
  LanController.pairingComplete,
);

/**
 * Status / recovery poll (Phase 2D.9). Possession proof + fingerprint bind.
 * Does not consume seats. Does not require invitation token.
 */
lanClientRouter.post(
  '/pairing/status',
  requirePairingProtocolReady,
  validateRequest({ body: pairingStatusBodySchema }),
  LanController.pairingStatus,
);

/** Remote cancel stays gated; operators cancel via staff JWT on the host. */
lanClientRouter.post('/pairing/cancel', LanController.pairingCancelRemote);
