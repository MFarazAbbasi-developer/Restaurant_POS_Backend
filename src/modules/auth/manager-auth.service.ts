import bcrypt from 'bcryptjs';
import { prisma } from '../../config/database.js';
import { ForbiddenError } from '../../common/errors/app-error.js';

export interface VerifyManagerPinParams {
  restaurantId: string;
  pin: string;
  requiredPermission: string;
}

export interface AuthorizedManagerContext {
  id: string;
  name: string;
  username: string;
  roles: string[];
}

export class ManagerAuthService {
  /**
   * Verifies a manager/authorized user's PIN within a restaurant for a sensitive action.
   * Finds active staff who hold the required permission and matches the PIN using bcrypt.
   */
  public static async verifyManagerPin(
    params: VerifyManagerPinParams,
  ): Promise<AuthorizedManagerContext> {
    const { restaurantId, pin, requiredPermission } = params;

    // Locate active users in the same restaurant who possess the required permission
    const candidateUsers = await prisma.user.findMany({
      where: {
        restaurantId,
        isActive: true,
        restaurant: {
          isActive: true,
        },
        userRoles: {
          some: {
            role: {
              rolePermissions: {
                some: {
                  permission: {
                    key: requiredPermission,
                  },
                },
              },
            },
          },
        },
      },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    // Check candidate PINs using bcrypt
    for (const user of candidateUsers) {
      const isMatch = await bcrypt.compare(pin, user.pinHash);
      if (isMatch) {
        return {
          id: user.id,
          name: user.name,
          username: user.username,
          roles: user.userRoles.map((ur) => ur.role.name),
        };
      }
    }

    // Generic error to avoid revealing employee identities or PIN matching states
    throw new ForbiddenError(
      'Manager authorization failed: invalid PIN or insufficient permissions',
    );
  }
}
