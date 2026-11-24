import type { Request } from 'express';
import type { Transaction } from 'sequelize';
import { logger, redact } from '../config/logger';
import { AuditLog } from '../models';
import type { ActorType } from '../models/system';

export interface AuditEntry {
  action: string;
  actorType?: ActorType;
  userId?: number | null;
  agentId?: number | null;
  entityType?: string;
  entityUuid?: string;
  companyId?: number | null;
  applicationId?: number | null;
  expenseId?: number | null;
  jobId?: number | null;
  previousStatus?: string | null;
  newStatus?: string | null;
  requestRef?: string | null;
  responseRef?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Appends an immutable audit record. Metadata is redacted so secrets never
 * land in the audit trail. Pass a transaction to make the audit atomic with
 * the change it describes.
 */
export async function audit(entry: AuditEntry, req?: Request, transaction?: Transaction) {
  try {
    await AuditLog.create(
      {
        actorType: entry.actorType ?? (entry.userId ? 'USER' : 'SYSTEM'),
        userId: entry.userId ?? null,
        agentId: entry.agentId ?? null,
        action: entry.action,
        entityType: entry.entityType ?? null,
        entityUuid: entry.entityUuid ?? null,
        companyId: entry.companyId ?? null,
        applicationId: entry.applicationId ?? null,
        expenseId: entry.expenseId ?? null,
        jobId: entry.jobId ?? null,
        previousStatus: entry.previousStatus ?? null,
        newStatus: entry.newStatus ?? null,
        requestRef: entry.requestRef ?? req?.requestId ?? null,
        responseRef: entry.responseRef ?? null,
        ipAddress: req?.ip ?? null,
        userAgent: req?.header('user-agent')?.slice(0, 500) ?? null,
        metadata: entry.metadata ? redact(entry.metadata) : null,
      },
      { transaction },
    );
  } catch (err) {
    if (transaction) throw err;
    logger.error('Failed to write audit log', { action: entry.action, error: (err as Error).message });
  }
}
