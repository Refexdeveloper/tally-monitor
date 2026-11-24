import type { Request } from 'express';
import type { Transaction } from 'sequelize';
import { z } from 'zod';
import { assertTransition, type JobStatus } from '../domain/jobStatus';
import { voucherHash } from '../domain/readback';
import type { VoucherDraft } from '../domain/voucherEngine';
import { Application, AuditLog, ExpenseTransaction, JobAttempt, PostedVoucher, ProcessingJob, sequelize, WebhookReceipt } from '../models';
import { ApiError } from '../utils/http';
import { companyScope } from './access';
import { validateExpense } from './accounting.service';
import type { AuthContext } from './auth/authContext';
import { assertCompanyAccess, iso, num, select } from './common';

export const reasonSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(1000) });
export const approveSchema = z.object({ notes: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(1000).nullable().optional()) });
export const bulkApproveSchema = z.object({ jobIds: z.array(z.string().uuid()).min(1).max(100), notes: z.string().trim().max(1000).optional() });
export const reconcileSchema = z.discriminatedUnion('resolution', [
  z.object({
    resolution: z.literal('FOUND'),
    notes: z.string().trim().min(5, 'Describe how the voucher was verified in Tally').max(1000),
    voucherNumber: z.string().trim().min(1).max(100),
    voucherDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    tallyMasterId: z.string().regex(/^\d+$/).optional(),
    tallyAlterId: z.string().regex(/^\d+$/).optional(),
  }),
  z.object({ resolution: z.literal('NOT_FOUND'), notes: z.string().trim().min(5, 'Describe how absence in Tally was confirmed').max(1000) }),
]);

type Actor = { type: 'USER'; ctx: AuthContext } | { type: 'SYSTEM' } | { type: 'AGENT'; agentId: number };

/** Applies a state-machine transition to a locked job, mirrors it on the expense and audits it. */
export async function transitionJob(
  job: ProcessingJob,
  to: JobStatus,
  opts: { actor: Actor; action: string; fields?: Partial<ProcessingJob['_creationAttributes']>; metadata?: Record<string, unknown>; transaction: Transaction; req?: Request },
) {
  const from = job.status;
  assertTransition(from, to);
  await job.update({ ...(opts.fields ?? {}), status: to } as never, { transaction: opts.transaction });
  await ExpenseTransaction.update({ processingStatus: to }, { where: { id: job.expenseId }, transaction: opts.transaction });
  const expense = await ExpenseTransaction.findByPk(job.expenseId, { attributes: ['requestNumber', 'sourceTransactionId'], transaction: opts.transaction });
  await AuditLog.create(
    {
      actorType: opts.actor.type,
      userId: opts.actor.type === 'USER' ? opts.actor.ctx.user.id : null,
      agentId: opts.actor.type === 'AGENT' ? opts.actor.agentId : null,
      action: opts.action,
      entityType: 'job',
      entityUuid: job.uuid,
      companyId: job.companyId,
      applicationId: job.applicationId,
      expenseId: job.expenseId,
      jobId: job.id,
      previousStatus: from,
      newStatus: to,
      requestRef: expense?.requestNumber ?? expense?.sourceTransactionId ?? null,
      responseRef: null,
      ipAddress: opts.req?.ip ?? null,
      userAgent: opts.req?.header('user-agent')?.slice(0, 500) ?? null,
      metadata: opts.metadata ?? null,
    },
    { transaction: opts.transaction },
  );
}

async function lockedJob(ctx: AuthContext, uuid: string, transaction: Transaction) {
  const job = await ProcessingJob.findOne({ where: { uuid }, lock: transaction.LOCK.UPDATE, transaction });
  if (!job) throw ApiError.notFound('Job not found');
  assertCompanyAccess(ctx, job.companyId);
  return job;
}

const draftOf = (job: ProcessingJob) => (job.voucherPayload ? ((typeof job.voucherPayload === 'string' ? JSON.parse(job.voucherPayload) : job.voucherPayload) as VoucherDraft) : null);

async function assertNotSelfApproval(ctx: AuthContext, job: ProcessingJob, transaction: Transaction) {
  const imported = await WebhookReceipt.count({ where: { expenseId: job.expenseId, source: 'MANUAL', status: 'ACCEPTED', triggeredBy: ctx.user.id }, transaction });
  if (imported) throw ApiError.forbidden('You imported this transaction yourself; another approver must approve it (separation of duties)');
}

export async function approveJob(ctx: AuthContext, uuid: string, notes: string | null | undefined, req: Request) {
  return sequelize.transaction(async (transaction) => {
    const job = await lockedJob(ctx, uuid, transaction);
    if (job.status !== 'AWAITING_APPROVAL') throw ApiError.conflict(`Only jobs awaiting approval can be approved (this one is ${job.status.toLowerCase().replace(/_/g, ' ')})`, 'INVALID_STATUS');
    if (job.isPaused) throw ApiError.conflict('Resume the job before approving it', 'JOB_PAUSED');
    const draft = draftOf(job);
    if (!draft || draft.outcome !== 'OK' || !draft.balanced) throw ApiError.conflict('The voucher draft is missing or not balanced; revalidate before approving', 'DRAFT_INVALID');
    await assertNotSelfApproval(ctx, job, transaction);
    await transitionJob(job, 'READY_TO_POST', {
      actor: { type: 'USER', ctx },
      action: 'APPROVAL_GRANTED',
      transaction,
      req,
      fields: { approvedBy: ctx.user.id, approvedAt: new Date(), approvedVoucherHash: voucherHash(draft), approvalNotes: notes ?? null },
      metadata: { total: draft.totalDebit, voucherType: draft.voucherType, notes },
    });
    return { id: job.uuid, status: job.status };
  });
}

export async function bulkApprove(ctx: AuthContext, ids: string[], notes: string | undefined, req: Request) {
  const results: { id: string; ok: boolean; status?: string; error?: string }[] = [];
  for (const id of ids) {
    try {
      const r = await approveJob(ctx, id, notes, req);
      results.push({ id, ok: true, status: r.status });
    } catch (err) {
      results.push({ id, ok: false, error: err instanceof ApiError ? err.message : 'Failed' });
    }
  }
  return { approved: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
}

export async function rejectJob(ctx: AuthContext, uuid: string, reason: string, req: Request) {
  return sequelize.transaction(async (transaction) => {
    const job = await lockedJob(ctx, uuid, transaction);
    if (job.status !== 'AWAITING_APPROVAL') throw ApiError.conflict('Only jobs awaiting approval can be rejected', 'INVALID_STATUS');
    await transitionJob(job, 'CANCELLED', { actor: { type: 'USER', ctx }, action: 'APPROVAL_REJECTED', transaction, req, fields: { rejectedBy: ctx.user.id, rejectedAt: new Date(), rejectionReason: reason }, metadata: { reason } });
    return { id: job.uuid, status: job.status };
  });
}

export async function cancelJob(ctx: AuthContext, uuid: string, reason: string, req: Request) {
  return sequelize.transaction(async (transaction) => {
    const job = await lockedJob(ctx, uuid, transaction);
    if (job.status === 'PROCESSING' || job.status === 'RECONCILIATION_REQUIRED') {
      throw ApiError.conflict('A job that may already be in Tally cannot be cancelled; reconcile it first', 'INVALID_STATUS_TRANSITION');
    }
    await transitionJob(job, 'CANCELLED', { actor: { type: 'USER', ctx }, action: 'JOB_CANCELLED', transaction, req, fields: { cancelledBy: ctx.user.id, cancelledAt: new Date(), cancellationReason: reason, nextRetryAt: null }, metadata: { reason } });
    return { id: job.uuid, status: job.status };
  });
}

export async function retryJob(ctx: AuthContext, uuid: string, req: Request) {
  return sequelize.transaction(async (transaction) => {
    const job = await lockedJob(ctx, uuid, transaction);
    if (job.status === 'RECONCILIATION_REQUIRED') throw ApiError.conflict('This posting may already exist in Tally. Reconcile it instead of retrying.', 'RECONCILIATION_REQUIRED');
    // A manual retry grants one more attempt beyond the automatic limit.
    const fields = { nextRetryAt: new Date(), isDeadLetter: false, maxAttempts: Math.max(job.maxAttempts, job.attempts + 1), lastErrorCode: job.lastErrorCode };
    if (job.status === 'RETRY_PENDING') {
      await job.update(fields, { transaction });
      await AuditLog.create(
        { actorType: 'USER', userId: ctx.user.id, agentId: null, action: 'RETRY_INITIATED', entityType: 'job', entityUuid: job.uuid, companyId: job.companyId, applicationId: job.applicationId, expenseId: job.expenseId, jobId: job.id, previousStatus: job.status, newStatus: job.status, requestRef: null, responseRef: null, ipAddress: req.ip ?? null, userAgent: null, metadata: { immediate: true } },
        { transaction },
      );
    } else if (job.status === 'FAILED') {
      await transitionJob(job, 'RETRY_PENDING', { actor: { type: 'USER', ctx }, action: 'RETRY_INITIATED', transaction, req, fields });
    } else {
      throw ApiError.conflict('Only failed or retry-pending jobs can be retried', 'INVALID_STATUS');
    }
    return { id: job.uuid, status: job.status, nextRetryAt: job.nextRetryAt };
  });
}

export async function setPaused(ctx: AuthContext, uuid: string, paused: boolean, req: Request) {
  return sequelize.transaction(async (transaction) => {
    const job = await lockedJob(ctx, uuid, transaction);
    if (['PROCESSING', 'POSTED', 'CANCELLED'].includes(job.status)) throw ApiError.conflict(`A ${job.status.toLowerCase()} job cannot be ${paused ? 'paused' : 'resumed'}`, 'INVALID_STATUS');
    if (job.isPaused === paused) return { id: job.uuid, isPaused: paused };
    await job.update({ isPaused: paused, pausedBy: paused ? ctx.user.id : null, pausedAt: paused ? new Date() : null }, { transaction });
    await AuditLog.create(
      { actorType: 'USER', userId: ctx.user.id, agentId: null, action: paused ? 'JOB_PAUSED' : 'JOB_RESUMED', entityType: 'job', entityUuid: job.uuid, companyId: job.companyId, applicationId: job.applicationId, expenseId: job.expenseId, jobId: job.id, previousStatus: job.status, newStatus: job.status, requestRef: null, responseRef: null, ipAddress: req.ip ?? null, userAgent: null, metadata: null },
      { transaction },
    );
    return { id: job.uuid, isPaused: paused };
  });
}

export async function revalidateJob(ctx: AuthContext, uuid: string, req: Request) {
  const job = await ProcessingJob.findOne({ where: { uuid } });
  if (!job) throw ApiError.notFound('Job not found');
  assertCompanyAccess(ctx, job.companyId);
  return validateExpense(ctx, job.expenseId, req);
}

/** Creates the posted-voucher record for a verified posting. */
export async function recordPostedVoucher(
  job: ProcessingJob,
  draft: VoucherDraft,
  details: { voucherNumber: string | null; voucherDate: string; masterId?: string | number | null; alterId?: string | number | null; guid?: string | null; readback: unknown; tallyResponseId?: number | null },
  transaction: Transaction,
) {
  const expense = (await ExpenseTransaction.findByPk(job.expenseId, { transaction }))!;
  await PostedVoucher.create(
    {
      jobId: job.id,
      expenseId: job.expenseId,
      companyId: job.companyId,
      voucherKind: (draft.voucherKind ?? 'JOURNAL') as PostedVoucher['voucherKind'],
      tallyVoucherTypeName: draft.voucherType ?? 'Journal',
      voucherNumber: details.voucherNumber,
      voucherDate: details.voucherDate,
      reference: draft.reference,
      tallyMasterId: details.masterId === undefined || details.masterId === null ? null : Number(details.masterId),
      tallyAlterId: details.alterId === undefined || details.alterId === null ? null : Number(details.alterId),
      tallyGuid: details.guid ?? null,
      totalAmount: draft.totalDebit,
      currency: expense.currency,
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date(),
      readback: details.readback,
      tallyResponseId: details.tallyResponseId ?? null,
    },
    { transaction },
  );
  await Application.update({ lastSuccessAt: new Date() }, { where: { id: job.applicationId }, transaction });
}

export async function reconcileJob(ctx: AuthContext, uuid: string, input: z.infer<typeof reconcileSchema>, req: Request) {
  return sequelize.transaction(async (transaction) => {
    const job = await lockedJob(ctx, uuid, transaction);
    if (job.status !== 'RECONCILIATION_REQUIRED') throw ApiError.conflict('Only jobs requiring reconciliation can be reconciled', 'INVALID_STATUS');
    const draft = draftOf(job);
    if (!draft) throw ApiError.conflict('The job has no voucher draft', 'DRAFT_INVALID');
    const attemptNo = (await JobAttempt.max<number, JobAttempt>('attemptNo', { where: { jobId: job.id }, transaction })) ?? 0;
    await JobAttempt.create(
      { jobId: job.id, attemptNo: attemptNo + 1, agentId: null, triggeredBy: ctx.user.id, operation: 'RECONCILE', fromStatus: job.status, toStatus: input.resolution === 'FOUND' ? 'POSTED' : 'RETRY_PENDING', outcome: 'SUCCESS', errorCode: null, errorMessage: input.notes, finishedAt: new Date(), durationMs: 0 },
      { transaction },
    );
    if (input.resolution === 'FOUND') {
      const existing = await PostedVoucher.findOne({ where: { jobId: job.id }, transaction });
      if (existing) await existing.update({ verificationStatus: 'VERIFIED', verifiedAt: new Date(), voucherNumber: input.voucherNumber, voucherDate: input.voucherDate, readback: { method: 'MANUAL_RECONCILIATION', by: ctx.user.fullName, notes: input.notes } }, { transaction });
      else
        await recordPostedVoucher(
          job,
          draft,
          { voucherNumber: input.voucherNumber, voucherDate: input.voucherDate, masterId: input.tallyMasterId, alterId: input.tallyAlterId, readback: { method: 'MANUAL_RECONCILIATION', by: ctx.user.fullName, notes: input.notes } },
          transaction,
        );
      await transitionJob(job, 'POSTED', { actor: { type: 'USER', ctx }, action: 'RECONCILED_AS_POSTED', transaction, req, fields: { lockedByAgentId: null, lockedAt: null, lockExpiresAt: null, lastErrorCode: null, lastErrorMessage: null }, metadata: { notes: input.notes, voucherNumber: input.voucherNumber } });
    } else {
      await transitionJob(job, 'RETRY_PENDING', {
        actor: { type: 'USER', ctx },
        action: 'RECONCILED_AS_ABSENT',
        transaction,
        req,
        fields: { lockedByAgentId: null, lockedAt: null, lockExpiresAt: null, submissionStartedAt: null, nextRetryAt: new Date(), isDeadLetter: false, maxAttempts: Math.max(job.maxAttempts, job.attempts + 1) },
        metadata: { notes: input.notes },
      });
    }
    return { id: job.uuid, status: job.status };
  });
}

// --- Reads ---------------------------------------------------------------------

export async function queueSummary(ctx: AuthContext) {
  const scope = companyScope(ctx, 'j.company_id');
  const rows = await select(`SELECT j.status, COUNT(*) AS n, SUM(j.is_paused) AS paused, SUM(j.is_dead_letter) AS dead FROM processing_jobs j WHERE ${scope.sql} GROUP BY j.status`, scope.replacements);
  const byStatus = Object.fromEntries(rows.map((r) => [String(r.status), num(r.n)]));
  return {
    byStatus,
    paused: rows.reduce((a, r) => a + num(r.paused), 0),
    deadLetter: rows.reduce((a, r) => a + num(r.dead), 0),
    total: rows.reduce((a, r) => a + num(r.n), 0),
  };
}

export async function getJob(ctx: AuthContext, uuid: string) {
  const scope = companyScope(ctx, 'j.company_id');
  const [j] = await select(
    `SELECT j.*, e.uuid AS expense_uuid, e.request_number, e.source_transaction_id, e.amount, e.currency, e.expense_date, e.employee_name, e.vendor_name,
            e.expense_category, e.original_payload, e.normalized_payload,
            c.uuid AS company_uuid, c.name AS company_name, c.tally_company_name, a.uuid AS app_uuid, a.name AS app_name,
            vc.uuid AS cfg_uuid, vc.tally_voucher_type_name, ag.name AS agent_name, ua.full_name AS approved_by_name, ur.full_name AS rejected_by_name,
            uc.full_name AS cancelled_by_name, up.full_name AS paused_by_name
     FROM processing_jobs j JOIN expense_transactions e ON e.id = j.expense_id JOIN companies c ON c.id = j.company_id JOIN applications a ON a.id = j.application_id
     LEFT JOIN voucher_configurations vc ON vc.id = j.voucher_configuration_id LEFT JOIN integration_agents ag ON ag.id = j.locked_by_agent_id
     LEFT JOIN users ua ON ua.id = j.approved_by LEFT JOIN users ur ON ur.id = j.rejected_by LEFT JOIN users uc ON uc.id = j.cancelled_by LEFT JOIN users up ON up.id = j.paused_by
     WHERE j.uuid = :uuid AND ${scope.sql}`,
    { uuid, ...scope.replacements },
  );
  if (!j) throw ApiError.notFound('Job not found');
  const [attempts, responses, timeline] = await Promise.all([
    select(
      `SELECT a.uuid, a.attempt_no, a.operation, a.from_status, a.to_status, a.outcome, a.error_code, a.error_message, a.started_at, a.finished_at, a.duration_ms,
              ag.name AS agent_name, u.full_name AS user_name
       FROM job_attempts a LEFT JOIN integration_agents ag ON ag.id = a.agent_id LEFT JOIN users u ON u.id = a.triggered_by WHERE a.job_id = :id ORDER BY a.attempt_no`,
      { id: j.id },
    ),
    select(
      `SELECT t.uuid, t.operation, t.http_status, t.created_count, t.altered_count, t.error_count, t.line_error, t.response_body, t.request_hash, t.created_at, a.attempt_no
       FROM tally_responses t LEFT JOIN job_attempts a ON a.id = t.attempt_id WHERE t.job_id = :id ORDER BY t.created_at DESC LIMIT 30`,
      { id: j.id },
    ),
    select(
      `SELECT al.uuid, al.action, al.actor_type, al.previous_status, al.new_status, al.metadata, al.created_at, u.full_name AS user_name, ag.name AS agent_name
       FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id LEFT JOIN integration_agents ag ON ag.id = al.agent_id WHERE al.job_id = :id ORDER BY al.created_at, al.id`,
      { id: j.id },
    ),
  ]);
  const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);
  const draft = parse(j.voucher_payload) as VoucherDraft | null;
  const hashMatches = j.approved_voucher_hash ? (draft ? voucherHash(draft) === j.approved_voucher_hash : false) : null;
  return {
    id: j.uuid as string,
    status: j.status as JobStatus,
    priority: num(j.priority),
    isPaused: Boolean(j.is_paused),
    pausedBy: j.paused_by_name,
    pausedAt: iso(j.paused_at),
    isDeadLetter: Boolean(j.is_dead_letter),
    attempts: num(j.attempts),
    maxAttempts: num(j.max_attempts),
    nextRetryAt: iso(j.next_retry_at),
    lastAttemptAt: iso(j.last_attempt_at),
    lock: j.locked_by_agent_id ? { agent: j.agent_name, lockedAt: iso(j.locked_at), expiresAt: iso(j.lock_expires_at), heartbeatAt: iso(j.heartbeat_at), submissionStartedAt: iso(j.submission_started_at) } : null,
    submissionStartedAt: iso(j.submission_started_at),
    errorCode: j.last_error_code,
    errorMessage: j.last_error_message,
    idempotencyKey: j.idempotency_key,
    approval: j.approved_at ? { by: j.approved_by_name, at: iso(j.approved_at), notes: j.approval_notes, hashMatches } : null,
    rejection: j.rejected_at ? { by: j.rejected_by_name, at: iso(j.rejected_at), reason: j.rejection_reason } : null,
    cancellation: j.cancelled_at ? { by: j.cancelled_by_name, at: iso(j.cancelled_at), reason: j.cancellation_reason } : null,
    voucherDraft: draft,
    voucherConfiguration: j.cfg_uuid ? { id: j.cfg_uuid, name: j.tally_voucher_type_name } : null,
    expense: {
      id: j.expense_uuid,
      requestNumber: j.request_number,
      sourceTransactionId: j.source_transaction_id,
      amount: String(j.amount),
      currency: j.currency,
      expenseDate: j.expense_date,
      party: j.employee_name ?? j.vendor_name,
      category: j.expense_category,
      originalPayload: parse(j.original_payload),
      normalizedPayload: parse(j.normalized_payload),
    },
    company: { id: j.company_uuid, name: j.company_name, tallyCompanyName: j.tally_company_name },
    application: { id: j.app_uuid, name: j.app_name },
    createdAt: iso(j.created_at),
    updatedAt: iso(j.updated_at),
    attemptsHistory: attempts.map((a) => ({
      id: a.uuid,
      attemptNo: num(a.attempt_no),
      operation: a.operation,
      fromStatus: a.from_status,
      toStatus: a.to_status,
      outcome: a.outcome,
      errorCode: a.error_code,
      errorMessage: a.error_message,
      startedAt: iso(a.started_at),
      finishedAt: iso(a.finished_at),
      durationMs: a.duration_ms === null ? null : num(a.duration_ms),
      by: a.agent_name ?? a.user_name ?? 'system',
    })),
    tallyResponses: responses.map((t) => ({
      id: t.uuid,
      attemptNo: t.attempt_no === null ? null : num(t.attempt_no),
      operation: t.operation,
      httpStatus: t.http_status === null ? null : num(t.http_status),
      created: num(t.created_count),
      altered: num(t.altered_count),
      errors: num(t.error_count),
      lineError: t.line_error,
      responseBody: t.response_body,
      requestHash: t.request_hash,
      createdAt: iso(t.created_at),
    })),
    timeline: timeline.map((t) => ({ id: t.uuid, action: t.action, actorType: t.actor_type, previousStatus: t.previous_status, newStatus: t.new_status, by: t.user_name ?? t.agent_name ?? t.actor_type, metadata: parse(t.metadata), createdAt: iso(t.created_at) })),
  };
}