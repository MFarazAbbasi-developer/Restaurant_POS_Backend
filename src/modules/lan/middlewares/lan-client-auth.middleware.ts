import type { Request, Response, NextFunction } from 'express';
import { Prisma, LanCloudSyncStatus, LanTerminalLocalStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../../config/database.js';
import { AppError } from '../../../common/errors/app-error.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';
import {
  buildLanClientRequestCanonicalString,
  loadTerminalPublicKeySpkiBase64Url,
  sha256Hex,
  verifyLanClientRequestSignature,
} from '../crypto/lan-client-request.js';
import { getLanEnv } from '../lan-env.js';
import { getLanRuntime } from '../lan-runtime.js';

export interface LanClientAuthContext {
  restaurantId: string;
  terminalId: string;
  lanTerminalRowId: string;
  fingerprintPrefix: string;
}

declare global {
  namespace Express {
    interface Request {
      lanAuth?: LanClientAuthContext;
      lanRestaurantId?: string;
      /** Exact raw body bytes when captured for Plane B signature verification. */
      rawBody?: Buffer;
    }
  }
}

function header(req: Request, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v) && v[0]) return String(v[0]).trim();
  return undefined;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Resolve restaurant scope for Plane B.
 * Prefer in-process LanRuntime (authoritative). Test override: req.lanRestaurantId
 * or LAN_DEFAULT_RESTAURANT_ID (never treated as production binding source).
 */
export function resolveLanRestaurantId(req: Request): string | undefined {
  if (req.lanRestaurantId) return req.lanRestaurantId;
  const runtime = getLanRuntime();
  if (runtime.restaurantId) return runtime.restaurantId;
  return getLanEnv().LAN_DEFAULT_RESTAURANT_ID;
}

/**
 * Plane B: FARMAX-LAN-CLIENT-REQUEST-V1.
 * Not applied to staff JWT local routes — mount only on `/lan/v1/...` routers.
 *
 * Order: restaurant scope → headers → skew → roster ACTIVE → signature → durable nonce.
 */
export function requireLanClientSignature(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const lanEnv = getLanEnv();
      const restaurantId = resolveLanRestaurantId(req);
      if (!restaurantId) {
        throw new AppError(
          'LAN restaurant scope is not configured',
          500,
          ErrorCode.INTERNAL_SERVER_ERROR,
        );
      }

      const terminalId = header(req, 'x-farmax-terminal-id');
      const timestamp = header(req, 'x-farmax-timestamp');
      const nonce = header(req, 'x-farmax-nonce');
      const signature = header(req, 'x-farmax-signature');

      if (!terminalId || !timestamp || !nonce || !signature) {
        throw new AppError(
          'LAN client authentication headers required',
          401,
          ErrorCode.LAN_AUTH_INVALID,
        );
      }
      if (!UUID_RE.test(nonce) || !UUID_RE.test(terminalId)) {
        throw new AppError('Invalid LAN nonce or terminal id', 401, ErrorCode.LAN_AUTH_INVALID);
      }

      const ts = new Date(timestamp);
      if (Number.isNaN(ts.getTime())) {
        throw new AppError('Invalid LAN request timestamp', 401, ErrorCode.LAN_AUTH_TIMESTAMP);
      }
      const skew = Math.abs(Date.now() - ts.getTime());
      if (skew > lanEnv.LAN_CLIENT_MAX_SKEW_MS) {
        throw new AppError(
          'LAN request timestamp outside allowed skew',
          401,
          ErrorCode.LAN_AUTH_TIMESTAMP,
        );
      }

      const row = await prisma.lanTerminal.findUnique({
        where: {
          restaurantId_terminalId: { restaurantId, terminalId },
        },
      });
      if (!row) {
        throw new AppError('Invalid LAN client signature', 401, ErrorCode.LAN_AUTH_INVALID);
      }
      if (row.localStatus !== LanTerminalLocalStatus.ACTIVE) {
        throw new AppError('LAN terminal is denied', 403, ErrorCode.LAN_TERMINAL_DENIED);
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

      const bodyBuf = req.rawBody ?? Buffer.alloc(0);
      const canonicalPath = (req.originalUrl ?? req.url).split('?')[0] || req.path;
      const qIdx = (req.originalUrl ?? '').indexOf('?');
      const canonicalQuery = qIdx >= 0 ? (req.originalUrl ?? '').slice(qIdx + 1) : '';

      const canonical = buildLanClientRequestCanonicalString({
        method: req.method,
        path: canonicalPath,
        query: canonicalQuery,
        terminalId,
        timestamp,
        nonce,
        bodySha256Hex: sha256Hex(bodyBuf),
      });

      const publicKey = loadTerminalPublicKeySpkiBase64Url(row.publicKeySpkiB64);
      if (!verifyLanClientRequestSignature(canonical, signature, publicKey)) {
        throw new AppError('Invalid LAN client signature', 401, ErrorCode.LAN_AUTH_INVALID);
      }

      const expiresAt = new Date(Date.now() + lanEnv.LAN_CLIENT_MAX_SKEW_MS * 2);
      try {
        await prisma.lanTerminalRequestNonce.create({
          data: {
            id: randomUUID(),
            restaurantId,
            terminalId,
            nonce,
            expiresAt,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new AppError('Replayed LAN request nonce', 401, ErrorCode.LAN_AUTH_REPLAY);
        }
        throw err;
      }

      await prisma.lanTerminalRequestNonce.deleteMany({
        where: { restaurantId, terminalId, expiresAt: { lt: new Date() } },
      });

      req.lanAuth = {
        restaurantId,
        terminalId,
        lanTerminalRowId: row.id,
        fingerprintPrefix: row.fingerprintSha256Hex.slice(0, 12),
      };
      next();
    } catch (err) {
      next(err);
    }
  })();
}

/** Gate: LAN runtime must be enabled before protected POS handlers run. */
export function requireLanRuntimeEnabled(
  _req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
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
    next();
  } catch (err) {
    next(err);
  }
}

/** Bind runtime restaurant onto the request before Plane B verification. */
export function bindLanRestaurantFromRuntime(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const snap = getLanRuntime();
  if (snap.restaurantId) {
    req.lanRestaurantId = snap.restaurantId;
  }
  next();
}
