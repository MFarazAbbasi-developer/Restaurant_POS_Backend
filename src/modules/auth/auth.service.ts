import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { UnauthorizedError } from '../../common/errors/app-error.js';
import type { LoginInput } from './auth.schema.js';
import type { AuthenticatedUserContext } from '../../common/types/express.js';

export interface JwtTokenPayload {
  sub: string;
  restaurantId: string;
  sessionId?: string | undefined;
  type: 'access';
  iat?: number | undefined;
  exp?: number | undefined;
}

export interface AuthTokensResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    restaurantId: string;
    name: string;
    username: string;
    roles: string[];
    permissions: string[];
  };
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class AuthService {
  /**
   * Hashes a raw PIN using bcrypt with configured salt rounds
   */
  public static async hashPin(pin: string): Promise<string> {
    return bcrypt.hash(pin, env.BCRYPT_SALT_ROUNDS);
  }

  /**
   * Compares a raw PIN against a stored bcrypt hash
   */
  public static async verifyPin(pin: string, hash: string): Promise<boolean> {
    return bcrypt.compare(pin, hash);
  }

  /**
   * Hashes a raw password using bcrypt with configured salt rounds
   */
  public static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);
  }

  /**
   * Compares a raw password against a stored bcrypt hash
   */
  public static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Hashes a raw refresh token using SHA-256 for secure, indexed DB lookup
   */
  public static hashRefreshToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Generates a cryptographically secure random refresh token string (80 hex chars)
   */
  public static generateRawRefreshToken(): string {
    return crypto.randomBytes(40).toString('hex');
  }

  /**
   * Generates a signed JWT access token containing standard claims
   */
  public static generateAccessToken(payload: Omit<JwtTokenPayload, 'type'>): string {
    return jwt.sign(
      {
        sub: payload.sub,
        restaurantId: payload.restaurantId,
        sessionId: payload.sessionId,
        type: 'access',
      },
      env.JWT_ACCESS_SECRET,
      {
        expiresIn: env.JWT_ACCESS_EXPIRES_IN,
      } as jwt.SignOptions,
    );
  }

  /**
   * Verifies and decodes a signed JWT access token
   */
  public static verifyAccessToken(token: string): JwtTokenPayload {
    try {
      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtTokenPayload;
      if (decoded.type !== 'access') {
        throw new UnauthorizedError('Invalid token type');
      }
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Access token has expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('Invalid access token');
      }
      throw error;
    }
  }

  /**
   * Authenticate user via username + PIN (or optional password)
   */
  public static async login(input: LoginInput, ipAddress?: string): Promise<AuthTokensResult> {
    // 1. Locate user by username and optional restaurantId
    const user = input.restaurantId
      ? await prisma.user.findUnique({
          where: {
            restaurantId_username: {
              restaurantId: input.restaurantId,
              username: input.username,
            },
          },
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
        })
      : await prisma.user.findFirst({
          where: {
            username: input.username,
          },
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

    // 2. Generic authentication failure if user does not exist
    if (!user) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // 3. Verify user and restaurant are active
    if (!user.isActive || !user.restaurant.isActive) {
      throw new UnauthorizedError('Invalid credentials');
    }

    // 4. Verify credentials (PIN or password)
    let isCredentialValid = false;

    if (input.pin) {
      isCredentialValid = await this.verifyPin(input.pin, user.pinHash);
    } else if (input.password && user.passwordHash) {
      isCredentialValid = await this.verifyPassword(input.password, user.passwordHash);
    }

    if (!isCredentialValid) {
      // Audit log failed login attempt
      await prisma.auditLog.create({
        data: {
          restaurantId: user.restaurantId,
          userId: user.id,
          action: 'LOGIN_FAILED',
          entityType: 'AUTH',
          metadata: {
            reason: 'INVALID_CREDENTIALS',
            username: input.username,
            authMethod: input.pin ? 'PIN' : 'PASSWORD',
          },
          ipAddress: ipAddress ?? null,
        },
      });

      throw new UnauthorizedError('Invalid credentials');
    }

    // 5. Aggregate roles and permissions
    const roles = user.userRoles.map((ur) => ur.role.name);
    const permissions = Array.from(
      new Set(
        user.userRoles.flatMap((ur) => ur.role.rolePermissions.map((rp) => rp.permission.key)),
      ),
    );

    // 6. Create Refresh Token & Session
    const rawRefreshToken = this.generateRawRefreshToken();
    const tokenHash = this.hashRefreshToken(rawRefreshToken);
    const expiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    // 7. Generate JWT Access Token
    const accessToken = this.generateAccessToken({
      sub: user.id,
      restaurantId: user.restaurantId,
      sessionId: session.id,
    });

    // 8. Update lastLoginAt
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // 9. Record successful login audit log
    await prisma.auditLog.create({
      data: {
        restaurantId: user.restaurantId,
        userId: user.id,
        action: 'LOGIN_SUCCESS',
        entityType: 'USER',
        entityId: user.id,
        metadata: {
          sessionId: session.id,
          authMethod: input.pin ? 'PIN' : 'PASSWORD',
          roles,
        },
        ipAddress: ipAddress ?? null,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 900, // 15 minutes in seconds
      user: {
        id: user.id,
        restaurantId: user.restaurantId,
        name: user.name,
        username: user.username,
        roles,
        permissions,
      },
    };
  }

  /**
   * Refresh access token and rotate refresh token session
   */
  public static async refresh(rawRefreshToken: string, ipAddress?: string): Promise<RefreshResult> {
    const tokenHash = this.hashRefreshToken(rawRefreshToken);

    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            restaurant: true,
          },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    // Check if session was already revoked
    if (session.revokedAt) {
      throw new UnauthorizedError('Refresh token has been revoked');
    }

    // Check expiration
    if (session.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token has expired');
    }

    // Verify user and restaurant are active
    if (!session.user.isActive || !session.user.restaurant.isActive) {
      throw new UnauthorizedError('Account or restaurant is inactive');
    }

    // Revoke old session token (Rotation)
    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    // Generate new refresh token and session
    const newRawRefreshToken = this.generateRawRefreshToken();
    const newTokenHash = this.hashRefreshToken(newRawRefreshToken);
    const newExpiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

    const newSession = await prisma.session.create({
      data: {
        userId: session.userId,
        tokenHash: newTokenHash,
        expiresAt: newExpiresAt,
      },
    });

    // Generate new Access Token
    const accessToken = this.generateAccessToken({
      sub: session.user.id,
      restaurantId: session.user.restaurantId,
      sessionId: newSession.id,
    });

    // Record audit log for token refresh
    await prisma.auditLog.create({
      data: {
        restaurantId: session.user.restaurantId,
        userId: session.user.id,
        action: 'TOKEN_REFRESH',
        entityType: 'SESSION',
        entityId: newSession.id,
        metadata: {
          previousSessionId: session.id,
          newSessionId: newSession.id,
        },
        ipAddress: ipAddress ?? null,
      },
    });

    return {
      accessToken,
      refreshToken: newRawRefreshToken,
      expiresIn: 900,
    };
  }

  /**
   * Revoke a single active session during logout
   */
  public static async logout(
    userContext: AuthenticatedUserContext,
    rawRefreshToken?: string,
    ipAddress?: string,
  ): Promise<void> {
    if (rawRefreshToken) {
      const tokenHash = this.hashRefreshToken(rawRefreshToken);
      await prisma.session.updateMany({
        where: {
          tokenHash,
          userId: userContext.id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    } else if (userContext.sessionId) {
      await prisma.session.updateMany({
        where: {
          id: userContext.sessionId,
          userId: userContext.id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        restaurantId: userContext.restaurantId,
        userId: userContext.id,
        action: 'LOGOUT',
        entityType: 'SESSION',
        entityId: userContext.sessionId ?? null,
        metadata: {
          sessionId: userContext.sessionId,
        },
        ipAddress: ipAddress ?? null,
      },
    });
  }

  /**
   * Revoke all active sessions for a user (logout-all)
   */
  public static async logoutAll(
    userContext: AuthenticatedUserContext,
    ipAddress?: string,
  ): Promise<{ revokedCount: number }> {
    const result = await prisma.session.updateMany({
      where: {
        userId: userContext.id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        restaurantId: userContext.restaurantId,
        userId: userContext.id,
        action: 'LOGOUT_ALL',
        entityType: 'USER',
        entityId: userContext.id,
        metadata: {
          revokedSessionsCount: result.count,
        },
        ipAddress: ipAddress ?? null,
      },
    });

    return { revokedCount: result.count };
  }

  /**
   * Retrieve current sanitized authenticated user profile with roles and distinct permissions
   */
  public static async getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
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

    const roles = user.userRoles.map((ur) => ({
      id: ur.role.id,
      name: ur.role.name,
      description: ur.role.description,
      isSystem: ur.role.isSystem,
    }));

    const permissions = Array.from(
      new Set(
        user.userRoles.flatMap((ur) => ur.role.rolePermissions.map((rp) => rp.permission.key)),
      ),
    );

    return {
      id: user.id,
      name: user.name,
      username: user.username,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      restaurant: {
        id: user.restaurant.id,
        name: user.restaurant.name,
        slug: user.restaurant.slug,
        phone: user.restaurant.phone,
        address: user.restaurant.address,
        currency: user.restaurant.currency,
        timezone: user.restaurant.timezone,
        taxRate: user.restaurant.taxRate,
        taxInclusive: user.restaurant.taxInclusive,
        serviceChargeRate: user.restaurant.serviceChargeRate,
        serviceChargeEnabled: user.restaurant.serviceChargeEnabled,
        isActive: user.restaurant.isActive,
      },
      roles,
      permissions,
    };
  }
}
