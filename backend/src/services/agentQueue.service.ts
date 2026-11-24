import type { NextFunction, Request, Response } from 'express';
import { QueryTypes, type Transaction } from 'sequelize';
import { z } from 'zod';
import { retryDelaySeconds } from '../domain/jobStatus';
import { verifyReadback, voucherHash } from '../domain/readback';
import type { VoucherDraft } from '../domain/voucherEngine';
import { IntegrationAgent, JobAttempt, ProcessingJob, sequelize, TallyResponse, TallyServer } from '../models';
import { sha256, timingSafeEqualStr } from '../utils/crypto';
import { ApiError } from '../utils/http';
import { validateExpense } from './accounting.service';
import { recordPostedVoucher, transitionJob } from './queue.service';
import { getSetting } from './settings.service';

/** Agents authenticate with X-Agent-Key + Authorization: Bearer <secret>; only the secret's hash is stored. */
export async function authenticateAgent(req: Request, _res: Response, next: NextFunction) {
  const key = req.header('x-agent-key');
  const auth = req.header('authorization');
  const secret = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!key || !secret) throw ApiError.unauthorized('Agent credentials required', 'AGENT_AUTH_MISSING');
  const agent = await IntegrationAgent.unscoped().findOne({ where: { agentKey: key } });
  if (!agent || !timingSafeEqualStr(sha256(secret), agent.secretHash)) throw ApiError.unauthorized('Invalid agent credentials', 'AGENT_AUTH_INVALID');
  if (agent.revokedAt || !agent.isActive) throw new ApiError(403, 'AGENT_REVOKED', 'This agent has been revoked');
  req.agent = agent;
  next();
}

export const heartbeatSchema = z.object({
  hostname: z.string().max(255).optional(),
  osInfo: z.string().max(255).optional(),
  agentVersion: z.string().max(32).optional(),
  servers: z
    .array(
      z.object({
        serverId: z.string().uuid(),
        status: z.enum(['ONLINE', 'OFFLINE', 'ERROR']),
        error: z.string().max(1000).nullable().optional(),
        // Companies currently loaded in TallyPrime on this server.
        companies: z.array(z.string().max(255)).max(500).optional(),
      }),
    )
    .max(50)
    .optional(),
});

export const claimSchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).default(1),
  // Optional allow-list (company UUIDs, comma separated) set by the agent's ALLOWED_COMPANIES.
  companies: z
    .string()
    .max(4000)
    .optional()
    .transform((s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : undefined))
    .pipe(z.array(z.string().uuid()).max(100).optional()),
});
export const submittingSchema = z.object({ attemptId: z.string().uuid() });

const amount = z.union([z.string().max(30), z.number()]).nullable().optional();
export const resultSchema = z.object({
  attemptId: z.string().uuid(),
  outcome: z.enum(['POSTED', 'REJECTED', 'NOT_SUBMITTED', 'AMBIGUOUS']),
  errorCode: z.string().max(64).optional(),
  errorMessage: z.string().max(2000).optional(),
  tally: z
    .object({
      httpStatus: z.number().int().min(0).max(999).nullable().optional(),
      created: z.number().int().min(0).optional(),
      altered: z.number().int().min(0).optional(),
      errors: z.number().int().min(0).optional(),
      lineError: z.string().max(2000).nullable().optional(),
      requestHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
      responseBody: z.string().max(200_000).optional(),
    })
    .optional(),
  readback: z
    .object({
      reference: z.string().max(200),
      voucherDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      voucherType: z.string().max(150),
      voucherNumber: z.string().max(100).nullable().optional(),
      masterId: z.union([z.string().regex(/^\d+$/), z.number().int()]).nullable().optional(),
      alterId: z.union([z.string().regex(/^\d+$/), z.number().int()]).nullable().optional(),
      guid: z.string().max(100).nullable().optional(),
      entries: z.array(z.object({ ledger: z.string().max(255), debit: amount, credit: amount })).max(500),
    })
    .optional(),
});

async function touchAgent(agent: IntegrationAgent, req: Request, extra: Partial<Pick<IntegrationAgent, 'hostname' | 'osInfo' | 'agentVersion'>> = {}) {
  await agent.update({ ...extra, status: 'ONLINE', lastHeartbeatAt: new Date(), lastIp: req.ip ?? null });
}

/** Company ids this agent may act on (company override, else the company's server agent). */
export async function agentCompanyIds(agentId: number, transaction?: Transaction) {
  const rows = await select<{ id: number }>(
    `SELECT c.id FROM companies c JOIN tally_servers s ON s.id = c.tally_server_id
     WHERE c.deleted_at IS NULL AND c.is_active = 1 AND s.is_active = 1
       AND (c.integration_agent_id = :a OR (c.integration_agent_id IS NULL AND s.integration_agent_id = :a))`,
    { a: agentId },
    transaction,
  );
  return rows.map((r) => Number(r.id));
}

async function assignment(agentId: number) {
  const servers = await select<{ id: number; uuid: string; name: string; host: string; port: number; protocol: string; tally_release: string | null }>(
    'SELECT id, uuid, name, host, port, protocol, tally_release FROM tally_servers WHERE integration_agent_id = :a AND is_active = 1 ORDER BY name',
    { a: agentId },
  );
  const companies = await select<{ uuid: string; name: string; code: string; tally_company_name: string; server_uuid: string }>(
    `SELECT c.uuid, c.name, c.code, c.tally_company_name, s.uuid AS server_uuid FROM companies c JOIN tally_servers s ON s.id = c.tally_server_id
     WHERE c.deleted_at IS NULL AND c.is_active = 1 AND s.is_active = 1
       AND (c.integration_agent_id = :a OR (c.integration_agent_id IS NULL AND s.integration_agent_id = :a)) ORDER BY c.name`,
    { a: agentId },
  );
  return {
    servers: servers.map((s) => ({ id: s.uuid, name: s.name, host: s.host, port: Number(s.port), protocol: s.protocol, release: s.tally_release })),
    companies: companies.map((c) => ({ id: c.uuid, name: c.name, code: c.code, tallyCompanyName: c.tally_company_name, serverId: c.server_uuid })),
  };
}

function select<T extends object>(sql: string, replacements: Record<string, unknown>, transaction?: Transaction) {
  return sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT, transaction });
}

export async function registerAgent(req: Request, input: z.infer<typeof heartbeatSchema>) {
  const agent = req.agent!;
  await touchAgent(agent, req, { hostname: input.hostname ?? agent.hostname, osInfo: input.osInfo ?? agent.osInfo, agentVersion: input.agentVersion ?? agent.agentVersion });
  return {
    agent: { id: agent.uuid, name: agent.name, maxConcurrency: agent.maxConcurrency },
    ...(await assignment(agent.id)),
    config: { heartbeatSeconds: 30, pollSeconds: 10, ledgerSyncMinutes: 30, lockTtlSeconds: await getSetting<number>('queue.lock_ttl_seconds') },
  };
}

export async function agentHeartbeat(req: Request, input: z.infer<typeof heartbeatSchema>) {
  const agent = req.agent!;
  await touchAgent(agent, req, { hostname: input.hostname ?? agent.hostname, osInfo: input.osInfo ?? agent.osInfo, agentVersion: input.agentVersion ?? agent.agentVersion });
  let updated = 0;
  for (const s of input.servers ?? []) {
    const server = await TallyServer.findOne({ where: { uuid: s.serverId, integrationAgentId: agent.id } });
    if (!server) continue;
    await server.update({
      status: s.status,
      lastHealthCheckAt: new Date(),
      lastSuccessAt: s.status === 'ONLINE' ? new Date() : server.lastSuccessAt,
      lastError: s.status === 'ONLINE' ? null : (s.error ?? null),
      ...(s.companies ? { discoveredCompanies: s.companies, discoveredAt: new Date() } : {}),
    });
    updated++;
  }
  return { ok: true, serversUpdated: updated, serverTime: new Date().toISOString() };
}

const draftOf = (job: ProcessingJob) => (job.voucherPayload ? ((typeof job.voucherPayload === 'string' ? JSON.parse(job.voucherPayload) : job.voucherPayload) as VoucherDraft) : null);

/**
 * Claims postable jobs for this agent with row locks. At most one PROCESSING
 * job per company when serialization is on, and never beyond the agent's concurrency.
 */
export async function claimJobs(req: Request, limit: number, onlyCompanies?: string[]) {
  const agent = req.agent!;
  await touchAgent(agent, req);
  const [serialize, lockTtl] = await Promise.all([getSetting<boolean>('queue.serialize_per_company'), getSetting<number>('queue.lock_ttl_seconds')]);
  const invalidated: number[] = [];

  const claimed = await sequelize.transaction(async (transaction) => {
    const [{ n: inFlight }] = await select<{ n: number }>("SELECT COUNT(*) AS n FROM processing_jobs WHERE locked_by_agent_id = :a AND status = 'PROCESSING'", { a: agent.id }, transaction);
    const capacity = Math.min(limit, Math.max(0, agent.maxConcurrency - Number(inFlight)));
    if (capacity === 0) return [];

    const candidates = await select<{ id: number; company_id: number }>(
      `SELECT j.id, j.company_id FROM processing_jobs j JOIN companies c ON c.id = j.company_id JOIN tally_servers s ON s.id = c.tally_server_id
       WHERE (j.status = 'READY_TO_POST' OR (j.status = 'RETRY_PENDING' AND (j.next_retry_at IS NULL OR j.next_retry_at <= UTC_TIMESTAMP(3))))
         AND j.is_paused = 0 AND c.is_active = 1 AND c.deleted_at IS NULL AND s.is_active = 1
         AND (c.integration_agent_id = :a OR (c.integration_agent_id IS NULL AND s.integration_agent_id = :a))
         ${onlyCompanies ? 'AND c.uuid IN (:only)' : ''}
       ORDER BY j.priority ASC, j.created_at ASC LIMIT :scan FOR UPDATE OF j SKIP LOCKED`,
      { a: agent.id, scan: capacity * 10, only: onlyCompanies?.length ? onlyCompanies : ['00000000-0000-0000-0000-000000000000'] },
      transaction,
    );

    const out: Record<string, unknown>[] = [];
    const companiesTaken = new Set<number>();
    for (const cand of candidates) {
      if (out.length >= capacity) break;
      if (serialize) {
        if (companiesTaken.has(cand.company_id)) continue;
        // Lock the company row so concurrent claims cannot both start a posting for it.
        await select('SELECT id FROM companies WHERE id = :c FOR UPDATE', { c: cand.company_id }, transaction);
        const [{ n }] = await select<{ n: number }>("SELECT COUNT(*) AS n FROM processing_jobs WHERE company_id = :c AND status = 'PROCESSING'", { c: cand.company_id }, transaction);
        if (Number(n) > 0) continue;
      }
      const job = (await ProcessingJob.findByPk(cand.id, { transaction }))!;
      const draft = draftOf(job);
      if (!draft || draft.outcome !== 'OK' || !draft.balanced || (draft.approvalRequired && job.approvedVoucherHash !== voucherHash(draft))) {
        // Approval no longer matches the voucher: send it back through validation.
        invalidated.push(job.expenseId);
        continue;
      }
      const now = new Date();
      const fromStatus = job.status;
      const lastNo = (await JobAttempt.max<number, JobAttempt>('attemptNo', { where: { jobId: job.id }, transaction })) ?? 0;
      await transitionJob(job, 'PROCESSING', {
        actor: { type: 'AGENT', agentId: agent.id },
        action: 'POSTING_ATTEMPTED',
        transaction,
        req,
        fields: { lockedByAgentId: agent.id, lockedAt: now, lockExpiresAt: new Date(now.getTime() + lockTtl * 1000), heartbeatAt: now, attempts: job.attempts + 1, lastAttemptAt: now, submissionStartedAt: null, nextRetryAt: null },
        metadata: { agent: agent.name, attempt: job.attempts + 1 },
      });
      const attempt = await JobAttempt.create(
        { jobId: job.id, attemptNo: lastNo + 1, agentId: agent.id, triggeredBy: null, operation: 'POST_VOUCHER', fromStatus, toStatus: null, outcome: 'IN_PROGRESS', errorCode: null, errorMessage: null, finishedAt: null, durationMs: null },
        { transaction },
      );
      companiesTaken.add(cand.company_id);
      const [company] = await select<{ uuid: string; tally_company_name: string; server_uuid: string; host: string; port: number; protocol: string }>(
        'SELECT c.uuid, c.tally_company_name, s.uuid AS server_uuid, s.host, s.port, s.protocol FROM companies c JOIN tally_servers s ON s.id = c.tally_server_id WHERE c.id = :c',
        { c: job.companyId },
        transaction,
      );
      out.push({
        jobId: job.uuid,
        attemptId: attempt.uuid,
        attemptNo: attempt.attemptNo,
        lockExpiresAt: job.lockExpiresAt!.toISOString(),
        idempotencyKey: job.idempotencyKey,
        company: { id: company!.uuid, tallyCompanyName: company!.tally_company_name },
        server: { id: company!.server_uuid, host: company!.host, port: Number(company!.port), protocol: company!.protocol },
        voucher: {
          kind: draft.voucherKind,
          voucherType: draft.voucherType,
          voucherDate: draft.voucherDate,
          voucherNumber: draft.voucherNumber,
          reference: draft.reference,
          narration: draft.narration,
          partyLedger: draft.partyLedger,
          entries: draft.entries,
          total: draft.totalDebit,
        },
        instructions: 'Confirm the reference does not already exist in this company, call /submitting, import once, then read the voucher back by reference and report the result.',
      });
    }
    return out;
  });

  for (const expenseId of invalidated) await validateExpense(null, expenseId).catch(() => undefined);
  return { jobs: claimed };
}

async function lockedAgentJob(req: Request, jobUuid: string, attemptUuid: string, transaction: Transaction) {
  const job = await ProcessingJob.findOne({ where: { uuid: jobUuid }, lock: transaction.LOCK.UPDATE, transaction });
  if (!job || job.lockedByAgentId !== req.agent!.id) throw ApiError.notFound('Job is not locked by this agent');
  if (job.status !== 'PROCESSING') throw ApiError.conflict(`Job is ${job.status.toLowerCase()}, not processing`, 'NOT_PROCESSING');
  const attempt = await JobAttempt.findOne({ where: { uuid: attemptUuid, jobId: job.id }, transaction });
  if (!attempt || attempt.outcome !== 'IN_PROGRESS') throw ApiError.conflict('Attempt is not in progress', 'ATTEMPT_CLOSED');
  return { job, attempt };
}

/** Must be called immediately before the agent sends the import request to Tally. */
export async function markSubmitting(req: Request, jobUuid: string, attemptUuid: string) {
  return sequelize.transaction(async (transaction) => {
    const { job } = await lockedAgentJob(req, jobUuid, attemptUuid, transaction);
    if (job.submissionStartedAt) throw ApiError.conflict('Submission already started for this attempt', 'ALREADY_SUBMITTING');
    const lockTtl = await getSetting<number>('queue.lock_ttl_seconds');
    await job.update({ submissionStartedAt: new Date(), heartbeatAt: new Date(), lockExpiresAt: new Date(Date.now() + lockTtl * 1000) }, { transaction });
    return { ok: true, submissionStartedAt: job.submissionStartedAt!.toISOString() };
  });
}

export async function jobHeartbeat(req: Request, jobUuid: string, attemptUuid: string) {
  return sequelize.transaction(async (transaction) => {
    const { job } = await lockedAgentJob(req, jobUuid, attemptUuid, transaction);
    const lockTtl = await getSetting<number>('queue.lock_ttl_seconds');
    await job.update({ heartbeatAt: new Date(), lockExpiresAt: new Date(Date.now() + lockTtl * 1000) }, { transaction });
    return { ok: true, lockExpiresAt: job.lockExpiresAt!.toISOString() };
  });
}

const RELEASE = { lockedByAgentId: null, lockedAt: null, lockExpiresAt: null, heartbeatAt: null };

/**
 * Settles an in-progress attempt. Shared by agent results and stale-lock recovery.
 * Anything that may have reached Tally without a verified read-back goes to reconciliation.
 */
export async function settleAttempt(
  job: ProcessingJob,
  attempt: JobAttempt,
  outcome: 'POSTED' | 'REJECTED' | 'NOT_SUBMITTED' | 'AMBIGUOUS',
  opts: { actor: { type: 'AGENT'; agentId: number } | { type: 'SYSTEM' }; transaction: Transaction; errorCode?: string; errorMessage?: string; readback?: z.infer<typeof resultSchema>['readback']; tallyResponseId?: number | null; req?: Request },
) {
  const { transaction } = opts;
  const draft = draftOf(job)!;
  const finish = async (o: JobAttempt['outcome'], to: string, errorCode?: string | null, errorMessage?: string | null) =>
    attempt.update({ outcome: o, toStatus: to as never, errorCode: errorCode ?? null, errorMessage: errorMessage?.slice(0, 2000) ?? null, finishedAt: new Date(), durationMs: Date.now() - attempt.startedAt.getTime() }, { transaction });

  // "Not submitted" after the agent declared submission is a contradiction: treat as ambiguous.
  if (outcome === 'NOT_SUBMITTED' && job.submissionStartedAt) outcome = 'AMBIGUOUS';
  if (!draft) outcome = outcome === 'NOT_SUBMITTED' ? 'NOT_SUBMITTED' : 'AMBIGUOUS';

  if (outcome === 'POSTED') {
    const check = opts.readback ? verifyReadback(draft, opts.readback) : { ok: false, mismatches: ['No read-back supplied'] };
    if (check.ok) {
      const rb = opts.readback!;
      await recordPostedVoucher(job, draft, { voucherNumber: rb.voucherNumber ?? null, voucherDate: rb.voucherDate, masterId: rb.masterId, alterId: rb.alterId, guid: rb.guid, readback: rb, tallyResponseId: opts.tallyResponseId }, transaction);
      await finish('SUCCESS', 'POSTED');
      await transitionJob(job, 'POSTED', { actor: opts.actor, action: 'POSTING_SUCCESSFUL', transaction, req: opts.req, fields: { ...RELEASE, lastErrorCode: null, lastErrorMessage: null }, metadata: { voucherNumber: rb.voucherNumber, masterId: rb.masterId } });
      return 'POSTED';
    }
    const msg = `Read-back verification failed: ${check.mismatches.join('; ')}`;
    await finish('AMBIGUOUS', 'RECONCILIATION_REQUIRED', 'READBACK_MISMATCH', msg);
    await transitionJob(job, 'RECONCILIATION_REQUIRED', { actor: opts.actor, action: 'POSTING_VERIFICATION_FAILED', transaction, req: opts.req, fields: { ...RELEASE, lastErrorCode: 'READBACK_MISMATCH', lastErrorMessage: msg.slice(0, 2000) }, metadata: { mismatches: check.mismatches } });
    return 'RECONCILIATION_REQUIRED';
  }

  if (outcome === 'AMBIGUOUS') {
    const msg = opts.errorMessage ?? 'Outcome unknown after submission; the voucher may exist in Tally';
    await finish('AMBIGUOUS', 'RECONCILIATION_REQUIRED', opts.errorCode ?? 'OUTCOME_UNKNOWN', msg);
    await transitionJob(job, 'RECONCILIATION_REQUIRED', { actor: opts.actor, action: 'POSTING_OUTCOME_UNKNOWN', transaction, req: opts.req, fields: { ...RELEASE, lastErrorCode: opts.errorCode ?? 'OUTCOME_UNKNOWN', lastErrorMessage: msg.slice(0, 2000) } });
    return 'RECONCILIATION_REQUIRED';
  }

  if (outcome === 'REJECTED') {
    const msg = opts.errorMessage ?? 'Tally rejected the voucher';
    await finish('FAILED', 'FAILED', opts.errorCode ?? 'TALLY_REJECTED', msg);
    await transitionJob(job, 'FAILED', { actor: opts.actor, action: 'POSTING_FAILED', transaction, req: opts.req, fields: { ...RELEASE, submissionStartedAt: null, lastErrorCode: opts.errorCode ?? 'TALLY_REJECTED', lastErrorMessage: msg.slice(0, 2000) } });
    return 'FAILED';
  }

  // NOT_SUBMITTED: nothing reached Tally, so retrying is safe.
  const msg = opts.errorMessage ?? 'The request was not sent to Tally';
  const code = opts.errorCode ?? 'NOT_SUBMITTED';
  if (job.attempts >= job.maxAttempts) {
    await finish(opts.actor.type === 'SYSTEM' ? 'TIMEOUT' : 'FAILED', 'FAILED', code, msg);
    await transitionJob(job, 'FAILED', { actor: opts.actor, action: 'POSTING_FAILED', transaction, req: opts.req, fields: { ...RELEASE, submissionStartedAt: null, isDeadLetter: true, lastErrorCode: code, lastErrorMessage: `${msg} (attempts exhausted)`.slice(0, 2000) }, metadata: { deadLetter: true } });
    return 'FAILED';
  }
  const [base, max] = await Promise.all([getSetting<number>('queue.retry_base_seconds'), getSetting<number>('queue.retry_max_seconds')]);
  const delay = retryDelaySeconds(job.attempts, base, max);
  await finish(opts.actor.type === 'SYSTEM' ? 'TIMEOUT' : 'FAILED', 'RETRY_PENDING', code, msg);
  await transitionJob(job, 'RETRY_PENDING', { actor: opts.actor, action: 'RETRY_SCHEDULED', transaction, req: opts.req, fields: { ...RELEASE, submissionStartedAt: null, nextRetryAt: new Date(Date.now() + delay * 1000), lastErrorCode: code, lastErrorMessage: msg.slice(0, 2000) }, metadata: { delaySeconds: delay } });
  return 'RETRY_PENDING';
}

export async function reportResult(req: Request, jobUuid: string, input: z.infer<typeof resultSchema>) {
  return sequelize.transaction(async (transaction) => {
    const { job, attempt } = await lockedAgentJob(req, jobUuid, input.attemptId, transaction);
    if ((input.outcome === 'POSTED' || input.outcome === 'REJECTED') && !job.submissionStartedAt) {
      throw ApiError.conflict('Call /submitting before importing into Tally', 'SUBMISSION_NOT_DECLARED');
    }
    let tallyResponseId: number | null = null;
    if (input.tally) {
      const t = await TallyResponse.create(
        {
          jobId: job.id,
          attemptId: attempt.id,
          companyId: job.companyId,
          agentId: req.agent!.id,
          operation: 'CREATE_VOUCHER',
          requestHash: input.tally.requestHash ?? null,
          requestStorageRef: null,
          httpStatus: input.tally.httpStatus ?? null,
          createdCount: input.tally.created ?? null,
          alteredCount: input.tally.altered ?? null,
          errorCount: input.tally.errors ?? null,
          lineError: input.tally.lineError ?? null,
          responseBody: input.tally.responseBody?.slice(0, 65_536) ?? null,
        },
        { transaction },
      );
      tallyResponseId = t.id;
    }
    const status = await settleAttempt(job, attempt, input.outcome, {
      actor: { type: 'AGENT', agentId: req.agent!.id },
      transaction,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage ?? input.tally?.lineError ?? undefined,
      readback: input.readback,
      tallyResponseId,
      req,
    });
    return { jobId: job.uuid, status };
  });
}
