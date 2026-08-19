import { prisma } from '../../config/database.js';
import { AuthService } from '../auth/auth.service.js';
import { AuditService } from '../../common/services/audit.service.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../common/errors/app-error.js';
import type { CreateStaffInput, ListStaffQueryInput, UpdateStaffInput } from './staff.schema.js';
import type { AuthenticatedUserContext } from '../../common/types/express.js';
import type { Prisma } from '@prisma/client';

export interface SanitizedStaffMember {
  id: string;
  restaurantId: string;
  name: string;
  username: string;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles: Array<{
    id: string;
    name: string;
    description: string | null;
    isSystem: boolean;
  }>;
}

export class StaffService {
  /**
   * Sanitizes a user database record, removing all sensitive hashes and credentials.
   */
  private static formatStaffMember(
    user: Prisma.UserGetPayload<{
      include: {
        userRoles: {
          include: {
            role: true;
          };
        };
      };
    }>,
  ): SanitizedStaffMember {
    return {
      id: user.id,
      restaurantId: user.restaurantId,
      name: user.name,
      username: user.username,
      phone: user.phone,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      roles: user.userRoles.map((ur) => ({
        id: ur.role.id,
        name: ur.role.name,
        description: ur.role.description,
        isSystem: ur.role.isSystem,
      })),
    };
  }

  /**
   * Returns a paginated list of staff members for the restaurant.
   */
  public static async listStaff(restaurantId: string, query: ListStaffQueryInput) {
    const { page, limit, search, roleId, isActive, sortBy, sortOrder } = query;

    const where: Prisma.UserWhereInput = {
      restaurantId,
      ...(isActive !== undefined && { isActive }),
      ...(roleId !== undefined && {
        userRoles: {
          some: {
            roleId,
          },
        },
      }),
      ...(search !== undefined &&
        search.length > 0 && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { username: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
          ],
        }),
    };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
        },
        orderBy: {
          [sortBy]: sortOrder,
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: users.map((u) => this.formatStaffMember(u)),
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Retrieves a single staff member by ID within the restaurant.
   */
  public static async getStaffById(
    restaurantId: string,
    staffId: string,
  ): Promise<SanitizedStaffMember> {
    const user = await prisma.user.findFirst({
      where: {
        id: staffId,
        restaurantId,
      },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('Staff member not found');
    }

    return this.formatStaffMember(user);
  }

  /**
   * Lists all roles configured for the given restaurant.
   */
  public static async listRoles(restaurantId: string) {
    const roles = await prisma.role.findMany({
      where: { restaurantId },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissions: role.rolePermissions.map((rp) => rp.permission.key),
      createdAt: role.createdAt,
    }));
  }

  /**
   * Creates a new staff member with hashed PIN, optional password, and assigned roles.
   */
  public static async createStaff(
    restaurantId: string,
    input: CreateStaffInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ): Promise<SanitizedStaffMember> {
    // 1. Check for unique username within the restaurant
    const existing = await prisma.user.findUnique({
      where: {
        restaurantId_username: {
          restaurantId,
          username: input.username,
        },
      },
    });

    if (existing) {
      throw new ConflictError('Username already exists in this restaurant');
    }

    // 2. Verify all role IDs exist within the restaurant
    const roles = await prisma.role.findMany({
      where: {
        id: { in: input.roleIds },
        restaurantId,
      },
    });

    if (roles.length !== input.roleIds.length) {
      throw new BadRequestError('One or more specified roles do not exist in this restaurant');
    }

    // 3. Hash PIN and optional password using bcrypt
    const pinHash = await AuthService.hashPin(input.pin);
    const passwordHash = input.password ? await AuthService.hashPassword(input.password) : null;

    // 4. Create user and role mappings in a transaction
    const createdUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          restaurantId,
          name: input.name,
          username: input.username,
          phone: input.phone ?? null,
          pinHash,
          passwordHash,
          isActive: true,
          userRoles: {
            create: input.roleIds.map((roleId) => ({
              roleId,
            })),
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

      return user;
    });

    // 5. Record audit log (zero credentials logged)
    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'STAFF_CREATED',
      entityType: 'USER',
      entityId: createdUser.id,
      metadata: {
        username: createdUser.username,
        name: createdUser.name,
        phone: createdUser.phone,
        roles: roles.map((r) => r.name),
      },
      ipAddress: ipAddress ?? null,
    });

    return this.formatStaffMember(createdUser);
  }

  /**
   * Updates basic staff profile information (name, username, phone).
   */
  public static async updateStaff(
    restaurantId: string,
    staffId: string,
    input: UpdateStaffInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ): Promise<SanitizedStaffMember> {
    const existing = await prisma.user.findFirst({
      where: {
        id: staffId,
        restaurantId,
      },
    });

    if (!existing) {
      throw new NotFoundError('Staff member not found');
    }

    if (input.username && input.username !== existing.username) {
      const conflict = await prisma.user.findUnique({
        where: {
          restaurantId_username: {
            restaurantId,
            username: input.username,
          },
        },
      });

      if (conflict) {
        throw new ConflictError('Username already exists in this restaurant');
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: staffId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.username !== undefined && { username: input.username }),
        ...(input.phone !== undefined && { phone: input.phone }),
      },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'STAFF_UPDATED',
      entityType: 'USER',
      entityId: staffId,
      metadata: {
        updatedFields: Object.keys(input),
        changes: input,
      },
      ipAddress: ipAddress ?? null,
    });

    return this.formatStaffMember(updatedUser);
  }

  /**
   * Activates or deactivates a staff member.
   * Deactivation revokes all active sessions for the user.
   */
  public static async updateStaffStatus(
    restaurantId: string,
    staffId: string,
    isActive: boolean,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ): Promise<SanitizedStaffMember> {
    const existing = await prisma.user.findFirst({
      where: {
        id: staffId,
        restaurantId,
      },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundError('Staff member not found');
    }

    const isOwner = existing.userRoles.some((ur) => ur.role.name === 'OWNER');

    // Protect primary restaurant owner from deactivation
    if (!isActive && isOwner) {
      throw new ForbiddenError('Cannot deactivate the primary restaurant owner account');
    }

    const updatedUser = await prisma.user.update({
      where: { id: staffId },
      data: { isActive },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    // If deactivating user, revoke all active sessions immediately
    if (!isActive) {
      await prisma.session.updateMany({
        where: {
          userId: staffId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }

    const action = isActive ? 'STAFF_ACTIVATED' : 'STAFF_DEACTIVATED';

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action,
      entityType: 'USER',
      entityId: staffId,
      metadata: {
        previousStatus: existing.isActive,
        newStatus: isActive,
        revokedSessions: !isActive,
      },
      ipAddress: ipAddress ?? null,
    });

    return this.formatStaffMember(updatedUser);
  }

  /**
   * Resets/changes a staff member's PIN.
   */
  public static async updateStaffPin(
    restaurantId: string,
    staffId: string,
    pin: string,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ): Promise<SanitizedStaffMember> {
    const existing = await prisma.user.findFirst({
      where: {
        id: staffId,
        restaurantId,
      },
    });

    if (!existing) {
      throw new NotFoundError('Staff member not found');
    }

    const pinHash = await AuthService.hashPin(pin);

    const updatedUser = await prisma.user.update({
      where: { id: staffId },
      data: { pinHash },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    // Audit log (never log the PIN!)
    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'STAFF_PIN_CHANGED',
      entityType: 'USER',
      entityId: staffId,
      metadata: {
        updatedBy: actor.id,
      },
      ipAddress: ipAddress ?? null,
    });

    return this.formatStaffMember(updatedUser);
  }

  /**
   * Assigns or updates roles for a staff member.
   */
  public static async updateStaffRoles(
    restaurantId: string,
    staffId: string,
    roleIds: string[],
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ): Promise<SanitizedStaffMember> {
    const existing = await prisma.user.findFirst({
      where: {
        id: staffId,
        restaurantId,
      },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundError('Staff member not found');
    }

    // Rule: User cannot modify their own permissions unless they have the OWNER role
    const actorIsOwner = actor.roles.includes('OWNER');
    if (actor.id === staffId && !actorIsOwner) {
      throw new ForbiddenError('Users cannot modify their own role assignments');
    }

    const isTargetOwner = existing.userRoles.some((ur) => ur.role.name === 'OWNER');

    // Verify all role IDs exist in the restaurant
    const targetRoles = await prisma.role.findMany({
      where: {
        id: { in: roleIds },
        restaurantId,
      },
    });

    if (targetRoles.length !== roleIds.length) {
      throw new BadRequestError('One or more specified roles do not exist in this restaurant');
    }

    // Protect primary owner from losing OWNER role
    const hasOwnerInTarget = targetRoles.some((r) => r.name === 'OWNER');
    if (isTargetOwner && !hasOwnerInTarget) {
      throw new ForbiddenError(
        'Cannot remove OWNER role from the primary restaurant owner account',
      );
    }

    // Replace roles in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({
        where: { userId: staffId },
      });

      await tx.userRole.createMany({
        data: roleIds.map((roleId) => ({
          userId: staffId,
          roleId,
        })),
      });
    });

    const updatedUser = await prisma.user.findUnique({
      where: { id: staffId },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!updatedUser) {
      throw new NotFoundError('Staff member not found after role update');
    }

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'STAFF_ROLES_UPDATED',
      entityType: 'USER',
      entityId: staffId,
      metadata: {
        previousRoles: existing.userRoles.map((ur) => ur.role.name),
        newRoles: targetRoles.map((r) => r.name),
      },
      ipAddress: ipAddress ?? null,
    });

    return this.formatStaffMember(updatedUser);
  }
}
