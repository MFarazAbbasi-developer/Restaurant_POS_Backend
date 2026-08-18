import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../errors/app-error.js';

/**
 * Reusable RBAC middleware that enforces specific permission key requirements.
 * Checks effective permissions dynamically without hardcoding role names in application routes.
 */
export const requirePermission = (permission: string) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication is required'));
    }

    const hasPermission =
      req.user.permissions.includes(permission) || req.user.roles.includes('OWNER');

    if (!hasPermission) {
      return next(
        new ForbiddenError(`Forbidden: Insufficient permissions (requires '${permission}')`),
      );
    }

    next();
  };
};
