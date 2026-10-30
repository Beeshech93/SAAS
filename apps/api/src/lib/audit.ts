import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { logger } from './logger';

export interface AuditEntry {
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string;
  description: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Writes an audit log entry. Runs fire-and-forget so that the calling request
 * is never delayed by persistence. If the insert fails it logs to stderr but
 * does NOT throw.
 */
export function recordAudit(entry: AuditEntry): void {
  prisma.auditLog
    .create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId ?? null,
        description: entry.description,
        // Prisma's nullable Json field requires Prisma.JsonNull (not JS null) for absent values.
        metadata: entry.metadata !== undefined
          ? (entry.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
      },
    })
    .catch((err: unknown) => {
      logger.error({ err, entry }, 'Failed to write audit log');
    });
}
