import type { Request, Response, NextFunction } from 'express';
import { AuthService } from '../../modules/auth/auth.service.js';
import { prisma } from '../../config/database.js';
import { UnauthorizedError } from '../errors/app-error.js';

export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authentication token is required');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedError('Authentication token is required');
    }

    // Verify JWT access token signature and expiration
    const payload = AuthService.verifyAccessToken(token);

    // Validate user, restaurant, and roles/permissions
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        restaurant: true,
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user || !user.isActive || !user.restaurant.isActive) {
      throw new UnauthorizedError('User account or restaurant is inactive');
    }

    // If a sessionId was in the token, verify session has not been revoked
    if (payload.sessionId) {
      const session = await prisma.session.findUnique({
        where: { id: payload.sessionId },
      });

      if (!session || session.revokedAt || session.expiresAt < new Date()) {
        throw new UnauthorizedError('Session has been revoked or expired');
      }
    }

    const roles = user.userRoles.map((ur) => ur.role.name);
    const permissions = Array.from(
      new Set(
        user.userRoles.flatMap((ur) => ur.role.rolePermissions.map((rp) => rp.permission.key)),
      ),
    );

    // Attach verified user context to request
    req.user = {
      id: user.id,
      restaurantId: user.restaurantId,
      username: user.username,
      name: user.name,
      sessionId: payload.sessionId,
      roles,
      permissions,
    };

    next();
  } catch (error) {
    next(error);
  }
};
