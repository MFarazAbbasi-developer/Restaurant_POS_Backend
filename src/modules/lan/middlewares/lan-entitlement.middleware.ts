import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../../common/errors/app-error.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';
import { LanEntitlementService } from '../lan-entitlement.service.js';
import { getLanRuntime } from '../lan-runtime.js';

/**
 * Revalidate durable cached entitlement before protected LAN POS handlers.
 * Does not invent offline paidThrough/Karachi grace.
 */
export function requireLanEntitlement(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  void (async () => {
    try {
      const restaurantId = req.lanAuth?.restaurantId ?? getLanRuntime().restaurantId;
      if (!restaurantId) {
        throw new AppError('LAN restaurant scope missing', 403, ErrorCode.LAN_DISABLED);
      }
      // assertCachedUsable verifies + advances the durable clock watermark.
      await LanEntitlementService.assertCachedUsable(restaurantId);
      next();
    } catch (err) {
      next(err);
    }
  })();
}
