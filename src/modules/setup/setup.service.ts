import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ConflictError } from '../../common/errors/app-error.js';
import { AuthService } from '../auth/auth.service.js';
import { AuditService } from '../../common/services/audit.service.js';
import {
  DEFAULT_PERMISSIONS,
  ROLE_PERMISSIONS_MAP,
} from '../../common/rbac/permissions.catalog.js';
import type { CompleteSetupInput } from './setup.schema.js';

/** Stable PostgreSQL advisory-lock key reserved for first-run setup. */
const FIRST_RUN_SETUP_LOCK_KEY = 87421001;

export interface SetupStatusResult {
  setupRequired: boolean;
}

export interface CompleteSetupResult {
  restaurant: {
    id: string;
    name: string;
    slug: string;
    currency: string;
    timezone: string;
  };
  owner: {
    id: string;
    name: string;
    username: string;
  };
}

export class SetupService {
  /**
   * Reports whether the installation still needs first-run onboarding.
   */
  public static async getStatus(): Promise<SetupStatusResult> {
    const restaurantCount = await prisma.restaurant.count();
    return { setupRequired: restaurantCount === 0 };
  }

  /**
   * Creates the first restaurant, system roles, and OWNER admin account.
   * Concurrent callers are serialized with a transaction-scoped advisory lock.
   */
  public static async completeSetup(
    input: CompleteSetupInput,
    ipAddress?: string,
  ): Promise<CompleteSetupResult> {
    const pinHash = await AuthService.hashPin(input.owner.pin);
    const passwordHash = await AuthService.hashPassword(input.owner.password);

    try {
      const result = await prisma.$transaction(async (tx) => {
        // Serialize all first-run setup attempts for the lifetime of this transaction.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${FIRST_RUN_SETUP_LOCK_KEY})`;

        const existingCount = await tx.restaurant.count();
        if (existingCount > 0) {
          throw new ConflictError('Initial setup has already been completed');
        }

        // Ensure global permission catalog exists (idempotent upserts).
        for (const perm of DEFAULT_PERMISSIONS) {
          await tx.permission.upsert({
            where: { key: perm.key },
            create: { key: perm.key, description: perm.description },
            update: { description: perm.description },
          });
        }

        const allPermissions = await tx.permission.findMany({
          select: { id: true, key: true },
        });
        const permissionIdByKey = new Map(allPermissions.map((p) => [p.key, p.id]));

        const restaurant = await tx.restaurant.create({
          data: {
            name: input.restaurant.name,
            slug: input.restaurant.slug,
            legalName: input.restaurant.legalName ?? null,
            phone: input.restaurant.phone ?? null,
            address: input.restaurant.address ?? null,
            currency: input.restaurant.currency,
            timezone: input.restaurant.timezone,
            taxRate: input.restaurant.taxRate,
            isActive: true,
          },
        });

        const roleIdByName = new Map<string, string>();

        for (const [roleName, config] of Object.entries(ROLE_PERMISSIONS_MAP)) {
          const role = await tx.role.create({
            data: {
              restaurantId: restaurant.id,
              name: roleName,
              description: config.description,
              isSystem: true,
            },
          });
          roleIdByName.set(roleName, role.id);

          const permissionLinks = config.permissions
            .map((key) => permissionIdByKey.get(key))
            .filter((id): id is string => Boolean(id))
            .map((permissionId) => ({
              roleId: role.id,
              permissionId,
            }));

          if (permissionLinks.length > 0) {
            await tx.rolePermission.createMany({ data: permissionLinks });
          }
        }

        const ownerRoleId = roleIdByName.get('OWNER');
        if (!ownerRoleId) {
          throw new Error('OWNER system role was not created during setup');
        }

        const owner = await tx.user.create({
          data: {
            restaurantId: restaurant.id,
            name: input.owner.name,
            username: input.owner.username,
            phone: input.owner.phone ?? null,
            pinHash,
            passwordHash,
            isActive: true,
            userRoles: {
              create: [{ roleId: ownerRoleId }],
            },
          },
        });

        return {
          restaurant: {
            id: restaurant.id,
            name: restaurant.name,
            slug: restaurant.slug,
            currency: restaurant.currency,
            timezone: restaurant.timezone,
          },
          owner: {
            id: owner.id,
            name: owner.name,
            username: owner.username,
          },
        };
      });

      await AuditService.log({
        restaurantId: result.restaurant.id,
        userId: result.owner.id,
        action: 'INITIAL_SETUP_COMPLETED',
        entityType: 'RESTAURANT',
        entityId: result.restaurant.id,
        metadata: {
          restaurantSlug: result.restaurant.slug,
          ownerUsername: result.owner.username,
        },
        ipAddress: ipAddress ?? null,
      });

      return result;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictError('Initial setup has already been completed or slug is in use');
      }
      throw error;
    }
  }
}
