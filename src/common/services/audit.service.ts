import { prisma } from '../../config/database.js';
import { Prisma } from '@prisma/client';

export interface CreateAuditLogParams {
  restaurantId: string;
  userId?: string | null | undefined;
  action: string;
  entityType: string;
  entityId?: string | null | undefined;
  metadata?: Record<string, unknown> | null | undefined;
  ipAddress?: string | null | undefined;
}

const SENSITIVE_KEYS = new Set([
  'pin',
  'pinhash',
  'password',
  'passwordhash',
  'token',
  'tokenhash',
  'secret',
  'authorization',
]);

function sanitizeMetadata(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Prisma.Decimal.isDecimal(obj)) {
    return (obj as Prisma.Decimal).toNumber();
  }

  if (typeof obj === 'function') {
    return undefined;
  }

  if (obj instanceof Date) {
    return obj.toISOString();
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeMetadata);
  }

  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key === 'constructor') continue;
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeMetadata(value);
      } else if (typeof value !== 'function') {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  return obj;
}

export class AuditService {
  /**
   * Records an audit log entry in PostgreSQL while stripping sensitive credentials.
   */
  public static async log(params: CreateAuditLogParams): Promise<void> {
    const { restaurantId, userId, action, entityType, entityId, metadata, ipAddress } = params;

    const sanitizedMeta = metadata
      ? (sanitizeMetadata(metadata) as Prisma.InputJsonValue)
      : Prisma.JsonNull;

    await prisma.auditLog.create({
      data: {
        restaurantId,
        userId: userId ?? null,
        action,
        entityType,
        entityId: entityId ?? null,
        metadata: sanitizedMeta,
        ipAddress: ipAddress ?? null,
      },
    });
  }
}
