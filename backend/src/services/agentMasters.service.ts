import type { Request } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';
import { logger } from '../config/logger';
import { AuditLog, Company, LedgerMaster, MasterCreationRequest, ProcessingJob, sequelize, TallyResponse } from '../models';
import { ApiError } from '../utils/http';
import { validateExpense } from './accounting.service';
import { agentCompanyIds } from './agentQueue.service';

const LEDGER_TYPES = ['LEDGER', 'PARTY_LEDGER', 'BANK_LEDGER'] as const;
const STALE_CREATING_MS = 10 * 60_000;

export const ledgerSyncSchema = z.object({
  companyId: z.string().uuid(),
  ledgers: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(255),
        parent: z.string().trim().max(255).nullable().optional(),
        guid: z.string().max(100).nullable().optional(),
        masterId: z.union([z.string().regex(/^\d+$/), z.number().int()]).nullable().optional(),
        alterId: z.union([z.string().regex(/^\d+$/), z.number().int()]).nullable().optional(),
      }),
    )
    .max(50_000),
});

export const masterResultSchema = z.object({
  outcome: z.enum(['CREATED', 'EXISTS', 'FAILED']),
  error: z.string().max(2000).optional(),
  readback: z
    .object({
      name: z.string().max(255),
      parent: z.string().max(255).nullable().optional(),
      guid: z.string().max(100).nullable().optional(),
      masterId: z.union([z.string().regex(/^\d+$/), z.number().int()]).nullable().optional(),
      alterId: z.union([z.string().regex(/^\d+$/), z.number().int()]).nullable().optional(),
    })
    .optional(),
  tally: z
    .object({ httpStatus: z.number().int().nullable().optional(), created: z.number().int().optional(), altered: z.number().int().optional(), errors: z.number().int().optional(), lineError: z.string().max(2000).nullable().optional(), responseBody: z.string().max(100_000).optional() })
    .optional(),
});

const toNum = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? null : Number(v));

async function assertAgentCompany(req: Request, companyUuid: string) {
  const company = await Company.findOne({ where: { uuid: companyUuid } });
  if (!company) throw ApiError.notFound('Company not found');
  const allowed = await agentCompanyIds(req.agent!.id);
  if (!allowed.includes(company.id)) throw ApiError.forbidden('This company is not assigned to this agent');
  return company;
}

/** After new ledgers appear, jobs waiting for masters can move on. */
async function revalidateWaitingJobs(companyId: number) {
  const jobs = await ProcessingJob.findAll({ where: { companyId, status: 'MASTER_CREATION_REQUIRED', isPaused: false }, attributes: ['expenseId'], limit: 200 });
  let moved = 0;
  for (const j of jobs) {
    try {
      const r = await validateExpense(null, j.expenseId);
      if (r.status !== 'MASTER_CREATION_REQUIRED') moved++;
    } catch (err) {
      logger.warn('Revalidation after ledger change failed', { expenseId: j.expenseId, error: (err as Error).message });
    }
  }
  return moved;
}

/**
 * Replaces the company's ledger list with what Tally reports. Tally is the
 * source of truth: ledgers it no longer has are deactivated.
 */
export async function syncLedgers(req: Request, input: z.infer<typeof ledgerSyncSchema>) {
  const company = await assertAgentCompany(req, input.companyId);
  const now = new Date();
  const summary = { received: input.ledgers.length, created: 0, updated: 0, verified: 0, deactivated: 0, mastersVerified: 0, jobsUnblocked: 0 };

  await sequelize.transaction(async (transaction) => {
    const existing = await LedgerMaster.findAll({ where: { companyId: company.id }, transaction });
    const byName = new Map(existing.map((l) => [l.name.toLowerCase(), l]));
    const seen = new Set<string>();
    const toCreate: Record<string, unknown>[] = [];
    for (const l of input.ledgers) {
      const key = l.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const found = byName.get(key);
      const fields = { parentGroup: l.parent ?? null, tallyGuid: l.guid ?? null, tallyMasterId: toNum(l.masterId), tallyAlterId: toNum(l.alterId), source: 'TALLY_SYNC' as const, isActive: true, syncedAt: now, lastVerifiedAt: now };
      if (!found) {
        toCreate.push({ companyId: company.id, name: l.name, createdBy: null, openingBalance: null, ...fields });
        continue;
      }
      if (found.source !== 'TALLY_SYNC' || !found.isActive) summary.verified++;
      else summary.updated++;
      await found.update({ ...fields, name: l.name }, { transaction });
    }
    for (let i = 0; i < toCreate.length; i += 500) await LedgerMaster.bulkCreate(toCreate.slice(i, i + 500) as never, { transaction });
    summary.created = toCreate.length;

    const stale = existing.filter((l) => l.isActive && !seen.has(l.name.toLowerCase())).map((l) => l.id);
    if (stale.length) {
      await LedgerMaster.update({ isActive: false, syncedAt: now }, { where: { id: { [Op.in]: stale } }, transaction });
      summary.deactivated = stale.length;
    }

    await sequelize.query(
      `UPDATE ledger_mappings lm JOIN ledger_masters m ON m.company_id = lm.company_id AND m.name = lm.tally_ledger_name
       SET lm.ledger_master_id = m.id WHERE lm.company_id = :c AND (lm.ledger_master_id IS NULL OR lm.ledger_master_id <> m.id)`,
      { replacements: { c: company.id }, transaction },
    );
    const [res] = await sequelize.query(
      `UPDATE master_creation_requests r JOIN ledger_masters m ON m.company_id = r.company_id AND m.name = r.proposed_name AND m.is_active = 1
       SET r.status = 'VERIFIED', r.ledger_master_id = m.id WHERE r.company_id = :c AND r.status IN ('CREATED', 'CREATING')`,
      { replacements: { c: company.id }, transaction },
    );
    summary.mastersVerified = Number((res as { affectedRows?: number }).affectedRows ?? 0);
    await company.update({ ledgersSyncedAt: now }, { transaction });
    await AuditLog.create(
      { actorType: 'AGENT', userId: null, agentId: req.agent!.id, action: 'LEDGERS_SYNCED', entityType: 'company', entityUuid: company.uuid, companyId: company.id, applicationId: null, expenseId: null, jobId: null, previousStatus: null, newStatus: null, requestRef: null, responseRef: null, ipAddress: req.ip ?? null, userAgent: null, metadata: { ...summary } },
      { transaction },
    );
  });

  if (summary.created || summary.verified || summary.mastersVerified) summary.jobsUnblocked = await revalidateWaitingJobs(company.id);
  return summary;
}

/** Claims Finance-approved ledger requests (and stale CREATING ones) for this agent's companies. */
export async function claimMasterRequests(req: Request, onlyCompanies?: string[]) {
  let companyIds = await agentCompanyIds(req.agent!.id);
  if (onlyCompanies) {
    const allowed = await Company.findAll({ where: { uuid: { [Op.in]: onlyCompanies } }, attributes: ['id'] });
    const set = new Set(allowed.map((c) => c.id));
    companyIds = companyIds.filter((id) => set.has(id));
  }
  if (!companyIds.length) return { requests: [] };
  const claimed = await sequelize.transaction(async (transaction) => {
    const rows = await MasterCreationRequest.findAll({
      where: {
        companyId: { [Op.in]: companyIds },
        masterType: { [Op.in]: [...LEDGER_TYPES] },
        [Op.or]: [{ status: 'APPROVED' }, { status: 'CREATING', updatedAt: { [Op.lt]: new Date(Date.now() - STALE_CREATING_MS) } }],
      },
      order: [['reviewedAt', 'ASC']],
      limit: 5,
      lock: transaction.LOCK.UPDATE,
      skipLocked: true,
      transaction,
    });
    const out = [];
    for (const r of rows) {
      const company = (await Company.findByPk(r.companyId, { transaction }))!;
      // Bump updatedAt explicitly: a stale CREATING row is already CREATING, so a status-only update would be a no-op.
      await r.update({ status: 'CREATING', updatedAt: new Date() }, { transaction });
      out.push({ id: r.uuid, companyId: company.uuid, tallyCompanyName: company.tallyCompanyName, masterType: r.masterType, name: r.proposedName, parent: r.proposedParent, billWise: r.masterType === 'PARTY_LEDGER' });
    }
    return out;
  });
  return { requests: claimed };
}

export async function reportMasterResult(req: Request, uuid: string, input: z.infer<typeof masterResultSchema>) {
  const companyIds = await agentCompanyIds(req.agent!.id);
  const result = await sequelize.transaction(async (transaction) => {
    const r = await MasterCreationRequest.findOne({ where: { uuid }, lock: transaction.LOCK.UPDATE, transaction });
    if (!r || !companyIds.includes(r.companyId)) throw ApiError.notFound('Request not found for this agent');
    if (r.status !== 'CREATING') throw ApiError.conflict(`Request is ${r.status.toLowerCase()}, not creating`, 'INVALID_STATUS');

    let tallyResponseId: number | null = null;
    if (input.tally) {
      const t = await TallyResponse.create(
        { jobId: r.jobId, attemptId: null, companyId: r.companyId, agentId: req.agent!.id, operation: 'CREATE_LEDGER', requestHash: null, requestStorageRef: null, httpStatus: input.tally.httpStatus ?? null, createdCount: input.tally.created ?? null, alteredCount: input.tally.altered ?? null, errorCount: input.tally.errors ?? null, lineError: input.tally.lineError ?? null, responseBody: input.tally.responseBody?.slice(0, 65_536) ?? null },
        { transaction },
      );
      tallyResponseId = t.id;
    }
    const audit = (action: string, newStatus: string, metadata: Record<string, unknown>) =>
      AuditLog.create(
        { actorType: 'AGENT', userId: null, agentId: req.agent!.id, action, entityType: 'master_request', entityUuid: r.uuid, companyId: r.companyId, applicationId: null, expenseId: null, jobId: r.jobId, previousStatus: 'CREATING', newStatus, requestRef: r.proposedName, responseRef: null, ipAddress: req.ip ?? null, userAgent: null, metadata },
        { transaction },
      );

    const fail = async (message: string) => {
      await r.update({ status: 'FAILED', tallyResponseId, details: { ...((r.details as object) ?? {}), error: message } }, { transaction });
      await audit('MASTER_CREATION_FAILED', 'FAILED', { error: message });
      return { status: 'FAILED' as const, message };
    };

    if (input.outcome === 'FAILED') return fail(input.error ?? input.tally?.lineError ?? 'Tally did not create the ledger');
    const rb = input.readback;
    if (!rb) return fail('No read-back supplied');
    if (rb.name.trim().toLowerCase() !== r.proposedName.trim().toLowerCase()) return fail(`Read-back name "${rb.name}" does not match "${r.proposedName}"`);
    if ((rb.parent ?? '').trim().toLowerCase() !== (r.proposedParent ?? '').trim().toLowerCase()) {
      return fail(`Ledger exists under "${rb.parent}" instead of "${r.proposedParent}"; Finance must decide how to proceed`);
    }

    const now = new Date();
    let ledger = await LedgerMaster.findOne({ where: { companyId: r.companyId, name: r.proposedName }, transaction });
    const fields = { parentGroup: rb.parent ?? null, tallyGuid: rb.guid ?? null, tallyMasterId: toNum(rb.masterId), tallyAlterId: toNum(rb.alterId), source: 'TALLY_SYNC' as const, isActive: true, syncedAt: now, lastVerifiedAt: now };
    if (ledger) await ledger.update(fields, { transaction });
    else ledger = await LedgerMaster.create({ companyId: r.companyId, name: rb.name, createdBy: null, openingBalance: null, ...fields }, { transaction });
    await r.update({ status: 'VERIFIED', ledgerMasterId: ledger.id, tallyResponseId }, { transaction });
    await sequelize.query('UPDATE ledger_mappings SET ledger_master_id = :l WHERE company_id = :c AND tally_ledger_name = :n', { replacements: { l: ledger.id, c: r.companyId, n: r.proposedName }, transaction });
    await audit(input.outcome === 'CREATED' ? 'MASTER_CREATED_IN_TALLY' : 'MASTER_FOUND_IN_TALLY', 'VERIFIED', { name: rb.name, parent: rb.parent, masterId: rb.masterId });
    return { status: 'VERIFIED' as const, companyId: r.companyId };
  });
  if (result.status === 'VERIFIED') {
    const moved = await revalidateWaitingJobs(result.companyId);
    return { status: result.status, jobsUnblocked: moved };
  }
  return result;
}
