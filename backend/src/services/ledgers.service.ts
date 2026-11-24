import type { Request } from 'express';
import { Op, type Transaction } from 'sequelize';
import { z } from 'zod';
import { Application, ApplicationCompany, Company, LedgerMapping, LedgerMaster, MasterCreationRequest, sequelize } from '../models';
import { ApiError } from '../utils/http';
import { audit } from './audit.service';
import type { AuthContext } from './auth/authContext';
import { assertCompanyAccess, hasCompanyAccess, iso, likePattern, num, orderBy, pageMeta, resolveCompany, select, withUniqueMessages, type ListQuery } from './common';

const companyParam = z.string().uuid('Select a company');
const name = (max: number) => z.string().trim().min(1).max(max);

export const ledgerListSchema = z.object({ companyId: companyParam, status: z.enum(['active', 'inactive', 'all']).default('active'), source: z.enum(['TALLY_SYNC', 'MANUAL_IMPORT', 'MASTER_REQUEST', 'all']).default('all') });
export const ledgerImportSchema = z.object({ companyId: companyParam, text: z.string().max(500_000) });
export const ledgerUpdateSchema = z.object({ isActive: z.boolean().optional(), parentGroup: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(255).nullable().optional()) });
export const companyQuerySchema = z.object({ companyId: companyParam });

export const mappingInputSchema = z.object({
  companyId: companyParam,
  applicationId: z.string().uuid().nullable().optional(),
  sourceCategory: name(150),
  tallyLedgerName: name(255),
  costCentre: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(255).nullable().optional()),
  isActive: z.boolean().optional(),
});
export const mappingUpdateSchema = mappingInputSchema.omit({ companyId: true }).partial();
export const mappingListSchema = z.object({ companyId: companyParam, applicationId: z.string().uuid().optional() });

export const MASTER_TYPES = ['LEDGER', 'GROUP', 'COST_CENTRE', 'COST_CATEGORY', 'STOCK_ITEM', 'PARTY_LEDGER', 'BANK_LEDGER'] as const;
export const masterRequestInputSchema = z.object({
  companyId: companyParam,
  masterType: z.enum(MASTER_TYPES).default('LEDGER'),
  proposedName: name(255),
  proposedParent: name(255),
  sourceValue: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(255).nullable().optional()),
  notes: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(1000).nullable().optional()),
});
export const masterRequestUpdateSchema = z.object({ proposedName: name(255).optional(), proposedParent: name(255).optional() });
export const masterReviewSchema = z.object({ notes: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(1000).nullable().optional()) });
export const masterListSchema = z.object({ companyId: z.string().uuid().optional(), status: z.enum(['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CREATING', 'CREATED', 'VERIFIED', 'FAILED', 'open', 'all']).default('open') });

const OPEN_MASTER = ['PENDING_REVIEW', 'APPROVED', 'CREATING'] as const;

// --- Ledger masters ------------------------------------------------------------

export async function listLedgers(ctx: AuthContext, q: ListQuery & z.infer<typeof ledgerListSchema>) {
  const company = await resolveCompany(ctx, q.companyId);
  const where = ['m.company_id = :companyId'];
  const repl: Record<string, unknown> = { companyId: company.id };
  if (q.status !== 'all') where.push(`m.is_active = ${q.status === 'active' ? 1 : 0}`);
  if (q.source !== 'all') {
    where.push('m.source = :source');
    repl.source = q.source;
  }
  if (q.search) {
    where.push('(m.name LIKE :s OR m.parent_group LIKE :s)');
    repl.s = likePattern(q.search);
  }
  const whereSql = where.join(' AND ');
  const sort = orderBy(q, { name: 'm.name', parentGroup: 'm.parent_group', updatedAt: 'm.updated_at' }, 'name');
  const [rows, count] = await Promise.all([
    select(
      `SELECT m.uuid, m.name, m.parent_group, m.source, m.is_active, m.synced_at, m.last_verified_at, m.tally_master_id, m.updated_at,
              (SELECT COUNT(*) FROM ledger_mappings lm WHERE lm.company_id = m.company_id AND lm.tally_ledger_name = m.name AND lm.is_active = 1) AS mappings
       FROM ledger_masters m WHERE ${whereSql} ORDER BY ${sort} LIMIT :limit OFFSET :offset`,
      { ...repl, limit: q.pageSize, offset: (q.page - 1) * q.pageSize },
    ),
    select(`SELECT COUNT(*) AS n FROM ledger_masters m WHERE ${whereSql}`, repl),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.uuid,
      name: r.name,
      parentGroup: r.parent_group,
      source: r.source,
      isActive: Boolean(r.is_active),
      syncedAt: iso(r.synced_at),
      lastVerifiedAt: iso(r.last_verified_at),
      tallyMasterId: r.tally_master_id === null ? null : String(r.tally_master_id),
      mappings: num(r.mappings),
      updatedAt: iso(r.updated_at),
    })),
    meta: pageMeta(q, num(count[0]?.n)),
  };
}

/** Parses "Name<TAB or comma>Parent group" lines, e.g. pasted from a Tally ledger list export. */
export function parseLedgerList(text: string) {
  const rows: { name: string; parentGroup: string | null }[] = [];
  const skipped: { line: number; text: string; reason: string }[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const parts = (line.includes('\t') ? line.split('\t') : line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)).map((p) => p.trim().replace(/^"|"$/g, '').trim());
    const ledgerName = parts[0] ?? '';
    const isHeader = i === 0 && /^(ledger|name|particulars)/i.test(ledgerName) && /group|under|parent/i.test(parts[1] ?? '');
    if (isHeader) continue;
    const reason = !ledgerName ? 'Empty ledger name' : ledgerName.length > 255 ? 'Name longer than 255 characters' : seen.has(ledgerName.toLowerCase()) ? 'Duplicate in list' : null;
    if (reason) {
      skipped.push({ line: i + 1, text: line.slice(0, 80), reason });
      continue;
    }
    seen.add(ledgerName.toLowerCase());
    rows.push({ name: ledgerName, parentGroup: parts[1] ? parts[1].slice(0, 255) : null });
  }
  return { rows, skipped };
}

export async function importLedgers(ctx: AuthContext, companyUuid: string, text: string, req: Request) {
  const company = await resolveCompany(ctx, companyUuid);
  const { rows, skipped } = parseLedgerList(text);
  if (!rows.length) throw ApiError.badRequest('No ledger names found. Paste one ledger per line: "Name<TAB>Parent group".');
  if (rows.length > 20_000) throw ApiError.badRequest('Import at most 20,000 ledgers at a time');
  const summary = { created: 0, updated: 0, reactivated: 0, unchanged: 0, skipped };
  await sequelize.transaction(async (transaction) => {
    const existing = await LedgerMaster.findAll({ where: { companyId: company.id }, transaction });
    const byName = new Map(existing.map((l) => [l.name.toLowerCase(), l]));
    const toCreate: {
      companyId: number;
      name: string;
      parentGroup: string | null;
      source: 'MANUAL_IMPORT';
      isActive: boolean;
      syncedAt: null;
      lastVerifiedAt: null;
      createdBy: number;
      tallyGuid: null;
      tallyMasterId: null;
      tallyAlterId: null;
      openingBalance: null;
    }[] = [];
    for (const r of rows) {
      const found = byName.get(r.name.toLowerCase());
      if (!found) {
        toCreate.push({ companyId: company.id, name: r.name, parentGroup: r.parentGroup, source: 'MANUAL_IMPORT', isActive: true, syncedAt: null, lastVerifiedAt: null, createdBy: ctx.user.id, tallyGuid: null, tallyMasterId: null, tallyAlterId: null, openingBalance: null });
        continue;
      }
      const changes: Record<string, unknown> = {};
      if (!found.isActive) {
        changes.isActive = true;
        summary.reactivated++;
      }
      if (r.parentGroup && r.parentGroup !== found.parentGroup) changes.parentGroup = r.parentGroup;
      if (Object.keys(changes).length) {
        await found.update(changes, { transaction });
        if (!('isActive' in changes)) summary.updated++;
      } else summary.unchanged++;
    }
    for (let i = 0; i < toCreate.length; i += 500) await LedgerMaster.bulkCreate(toCreate.slice(i, i + 500), { transaction });
    summary.created = toCreate.length;
    await sequelize.query(
      `UPDATE ledger_mappings lm JOIN ledger_masters m ON m.company_id = lm.company_id AND m.name = lm.tally_ledger_name
       SET lm.ledger_master_id = m.id WHERE lm.company_id = :c AND (lm.ledger_master_id IS NULL OR lm.ledger_master_id <> m.id)`,
      { replacements: { c: company.id }, transaction },
    );
    await audit(
      { action: 'LEDGERS_IMPORTED', userId: ctx.user.id, entityType: 'company', entityUuid: company.uuid, companyId: company.id, metadata: { created: summary.created, updated: summary.updated, reactivated: summary.reactivated, skipped: skipped.length } },
      req,
      transaction,
    );
  });
  return summary;
}

export async function updateLedger(ctx: AuthContext, uuid: string, input: z.infer<typeof ledgerUpdateSchema>, req: Request) {
  const ledger = await LedgerMaster.findOne({ where: { uuid } });
  if (!ledger || !hasCompanyAccess(ctx, ledger.companyId)) throw ApiError.notFound('Ledger not found');
  const changes = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  await ledger.update(changes);
  await audit({ action: input.isActive === false ? 'LEDGER_DEACTIVATED' : 'LEDGER_UPDATED', userId: ctx.user.id, entityType: 'ledger', entityUuid: ledger.uuid, companyId: ledger.companyId, metadata: { name: ledger.name, ...changes } }, req);
  return { id: ledger.uuid, name: ledger.name, parentGroup: ledger.parentGroup, isActive: ledger.isActive };
}

// --- Ledger mappings -----------------------------------------------------------

async function applicationIdFor(company: Company, uuid: string | null | undefined) {
  if (uuid === undefined) return undefined;
  if (uuid === null) return null;
  const app = await Application.findOne({ where: { uuid } });
  if (!app) throw ApiError.badRequest('Application not found');
  const link = await ApplicationCompany.findOne({ where: { applicationId: app.id, companyId: company.id } });
  if (!link) throw ApiError.badRequest(`${app.name} is not connected to ${company.name}`);
  return app.id;
}

const MAPPING_UNIQUE = { uq_ledger_mappings_scope: 'A mapping for this category already exists at this scope', scope_key: 'A mapping for this category already exists at this scope' };

export async function listMappings(ctx: AuthContext, q: z.infer<typeof mappingListSchema> & { search?: string }) {
  const company = await resolveCompany(ctx, q.companyId);
  const repl: Record<string, unknown> = { c: company.id };
  const where = ['lm.company_id = :c'];
  if (q.applicationId) {
    where.push('(a.uuid = :app OR lm.application_id IS NULL)');
    repl.app = q.applicationId;
  }
  if (q.search) {
    where.push('(lm.source_category LIKE :s OR lm.tally_ledger_name LIKE :s)');
    repl.s = likePattern(q.search);
  }
  const rows = await select(
    `SELECT lm.uuid, lm.source_category, lm.tally_ledger_name, lm.cost_centre, lm.is_active, lm.updated_at, a.uuid AS app_uuid, a.name AS app_name,
            (SELECT COUNT(*) FROM ledger_masters m WHERE m.company_id = lm.company_id AND m.name = lm.tally_ledger_name AND m.is_active = 1) AS ledger_exists,
            u.full_name AS updated_by
     FROM ledger_mappings lm LEFT JOIN applications a ON a.id = lm.application_id LEFT JOIN users u ON u.id = COALESCE(lm.updated_by, lm.created_by)
     WHERE ${where.join(' AND ')} ORDER BY lm.source_category, a.name IS NOT NULL, a.name`,
    repl,
  );
  return rows.map((r) => ({
    id: r.uuid,
    sourceCategory: r.source_category,
    tallyLedgerName: r.tally_ledger_name,
    costCentre: r.cost_centre,
    isActive: Boolean(r.is_active),
    application: r.app_uuid ? { id: r.app_uuid, name: r.app_name } : null,
    ledgerExists: num(r.ledger_exists) > 0,
    updatedBy: r.updated_by,
    updatedAt: iso(r.updated_at),
  }));
}

async function ledgerIdByName(companyId: number, ledgerName: string) {
  const m = await LedgerMaster.findOne({ where: { companyId, name: ledgerName }, attributes: ['id'] });
  return m?.id ?? null;
}

export async function createMapping(ctx: AuthContext, input: z.infer<typeof mappingInputSchema>, req: Request) {
  const company = await resolveCompany(ctx, input.companyId);
  const applicationId = (await applicationIdFor(company, input.applicationId ?? null)) ?? null;
  const mapping = await withUniqueMessages(
    async () =>
      LedgerMapping.create({
        companyId: company.id,
        applicationId,
        sourceCategory: input.sourceCategory,
        tallyLedgerName: input.tallyLedgerName,
        ledgerMasterId: await ledgerIdByName(company.id, input.tallyLedgerName),
        costCentre: input.costCentre ?? null,
        isActive: input.isActive ?? true,
        createdBy: ctx.user.id,
        updatedBy: ctx.user.id,
      }),
    MAPPING_UNIQUE,
  );
  await audit(
    { action: 'LEDGER_MAPPING_CREATED', userId: ctx.user.id, entityType: 'ledger_mapping', entityUuid: mapping.uuid, companyId: company.id, applicationId, metadata: { category: input.sourceCategory, ledger: input.tallyLedgerName } },
    req,
  );
  return (await listMappings(ctx, { companyId: company.uuid })).find((m) => m.id === mapping.uuid)!;
}

export async function updateMapping(ctx: AuthContext, uuid: string, input: z.infer<typeof mappingUpdateSchema>, req: Request) {
  const mapping = await LedgerMapping.findOne({ where: { uuid } });
  if (!mapping || !hasCompanyAccess(ctx, mapping.companyId)) throw ApiError.notFound('Mapping not found');
  const company = (await Company.findByPk(mapping.companyId))!;
  const before = { category: mapping.sourceCategory, ledger: mapping.tallyLedgerName, active: mapping.isActive };
  const changes: Record<string, unknown> = Object.fromEntries(Object.entries(input).filter(([k, v]) => v !== undefined && k !== 'applicationId'));
  const appId = await applicationIdFor(company, input.applicationId);
  if (appId !== undefined) changes.applicationId = appId;
  if (input.tallyLedgerName) changes.ledgerMasterId = await ledgerIdByName(company.id, input.tallyLedgerName);
  changes.updatedBy = ctx.user.id;
  await withUniqueMessages(() => mapping.update(changes), MAPPING_UNIQUE);
  await audit(
    { action: 'LEDGER_MAPPING_CHANGED', userId: ctx.user.id, entityType: 'ledger_mapping', entityUuid: mapping.uuid, companyId: company.id, metadata: { before, after: { category: mapping.sourceCategory, ledger: mapping.tallyLedgerName, active: mapping.isActive } } },
    req,
  );
  return (await listMappings(ctx, { companyId: company.uuid })).find((m) => m.id === mapping.uuid)!;
}

export async function deleteMapping(ctx: AuthContext, uuid: string, req: Request) {
  const mapping = await LedgerMapping.findOne({ where: { uuid } });
  if (!mapping || !hasCompanyAccess(ctx, mapping.companyId)) throw ApiError.notFound('Mapping not found');
  await mapping.destroy();
  await audit({ action: 'LEDGER_MAPPING_DELETED', userId: ctx.user.id, entityType: 'ledger_mapping', entityUuid: mapping.uuid, companyId: mapping.companyId, metadata: { category: mapping.sourceCategory, ledger: mapping.tallyLedgerName } }, req);
}

/** Categories on unposted expenses that no active mapping covers. */
export async function unmappedCategories(ctx: AuthContext, companyUuid: string) {
  const company = await resolveCompany(ctx, companyUuid);
  const rows = await select(
    `SELECT i.category, COUNT(*) AS line_count, COUNT(DISTINCT e.id) AS expenses, COALESCE(SUM(i.amount), 0) AS amount, MAX(e.received_at) AS last_seen,
            GROUP_CONCAT(DISTINCT a.name ORDER BY a.name SEPARATOR ', ') AS applications
     FROM expense_items i JOIN expense_transactions e ON e.id = i.expense_id JOIN applications a ON a.id = e.application_id
     WHERE e.company_id = :c AND e.processing_status NOT IN ('POSTED', 'CANCELLED')
       AND NOT EXISTS (SELECT 1 FROM ledger_mappings lm WHERE lm.company_id = e.company_id AND lm.is_active = 1 AND lm.source_category = i.category
                       AND (lm.application_id = e.application_id OR lm.application_id IS NULL))
     GROUP BY i.category ORDER BY expenses DESC, i.category LIMIT 500`,
    { c: company.id },
  );
  return rows.map((r) => ({ category: r.category, lines: num(r.line_count), expenses: num(r.expenses), amount: String(r.amount), currency: company.defaultCurrency, lastSeenAt: iso(r.last_seen), applications: r.applications }));
}

/** Ledger names referenced by mappings or voucher rules that are not (active) masters. */
export async function missingLedgers(ctx: AuthContext, companyUuid: string) {
  const company = await resolveCompany(ctx, companyUuid);
  const rows = await select(
    `SELECT x.name, GROUP_CONCAT(DISTINCT x.used_by ORDER BY x.used_by SEPARATOR ', ') AS used_by,
            (SELECT r.uuid FROM master_creation_requests r WHERE r.company_id = :c AND r.proposed_name = x.name AND r.status IN ('PENDING_REVIEW','APPROVED','CREATING') LIMIT 1) AS open_request,
            (SELECT r.status FROM master_creation_requests r WHERE r.company_id = :c AND r.proposed_name = x.name AND r.status IN ('PENDING_REVIEW','APPROVED','CREATING') LIMIT 1) AS open_request_status
     FROM (
       SELECT lm.tally_ledger_name AS name, CONCAT('Mapping: ', lm.source_category) AS used_by FROM ledger_mappings lm WHERE lm.company_id = :c AND lm.is_active = 1
       UNION ALL
       SELECT JSON_UNQUOTE(JSON_EXTRACT(v.credit_ledger_rule, '$.ledger')), CONCAT('Credit: ', v.tally_voucher_type_name) FROM voucher_configurations v
         WHERE v.company_id = :c AND v.is_active = 1 AND JSON_UNQUOTE(JSON_EXTRACT(v.credit_ledger_rule, '$.source')) = 'FIXED'
       UNION ALL
       SELECT JSON_UNQUOTE(JSON_EXTRACT(v.tax_ledger_rule, '$.ledger')), CONCAT('Tax: ', v.tally_voucher_type_name) FROM voucher_configurations v
         WHERE v.company_id = :c AND v.is_active = 1 AND JSON_UNQUOTE(JSON_EXTRACT(v.tax_ledger_rule, '$.source')) = 'FIXED'
     ) x
     WHERE x.name IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledger_masters m WHERE m.company_id = :c AND m.name = x.name AND m.is_active = 1)
     GROUP BY x.name ORDER BY x.name`,
    { c: company.id },
  );
  return rows.map((r) => ({ name: r.name, usedBy: r.used_by, openRequest: r.open_request ? { id: r.open_request, status: r.open_request_status } : null }));
}

// --- Master creation requests ----------------------------------------------------

function presentRequest(r: Record<string, unknown>) {
  return {
    id: r.uuid as string,
    masterType: r.master_type,
    proposedName: r.proposed_name,
    proposedParent: r.proposed_parent,
    sourceValue: r.source_value,
    status: r.status,
    details: typeof r.details === 'string' ? JSON.parse(r.details) : r.details,
    reviewNotes: r.review_notes,
    requestedBy: r.requested_by_name,
    requestedById: r.requested_by_uuid,
    reviewedBy: r.reviewed_by_name,
    reviewedAt: iso(r.reviewed_at),
    company: { id: r.company_uuid, name: r.company_name },
    job: r.job_uuid ? { id: r.job_uuid, expenseId: r.expense_uuid, requestNumber: r.request_number } : null,
    blockedJobs: num(r.blocked_jobs),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

const REQUEST_SELECT = `
  SELECT r.*, c.uuid AS company_uuid, c.name AS company_name, ru.full_name AS requested_by_name, ru.uuid AS requested_by_uuid, vu.full_name AS reviewed_by_name,
         j.uuid AS job_uuid, e.uuid AS expense_uuid, e.request_number,
         (SELECT COUNT(*) FROM processing_jobs bj WHERE bj.company_id = r.company_id AND bj.status = 'MASTER_CREATION_REQUIRED') AS blocked_jobs
  FROM master_creation_requests r JOIN companies c ON c.id = r.company_id
  LEFT JOIN users ru ON ru.id = r.requested_by LEFT JOIN users vu ON vu.id = r.reviewed_by
  LEFT JOIN processing_jobs j ON j.id = r.job_id LEFT JOIN expense_transactions e ON e.id = j.expense_id`;

export async function listMasterRequests(ctx: AuthContext, q: ListQuery & z.infer<typeof masterListSchema>) {
  const where: string[] = [];
  const repl: Record<string, unknown> = {};
  if (ctx.companyIds !== 'ALL') {
    where.push(ctx.companyIds.length ? 'r.company_id IN (:ids)' : '1=0');
    repl.ids = ctx.companyIds;
  }
  if (q.companyId) {
    const company = await resolveCompany(ctx, q.companyId);
    where.push('r.company_id = :c');
    repl.c = company.id;
  }
  if (q.status === 'open') where.push(`r.status IN ('PENDING_REVIEW','APPROVED','CREATING')`);
  else if (q.status !== 'all') {
    where.push('r.status = :status');
    repl.status = q.status;
  }
  if (q.search) {
    where.push('(r.proposed_name LIKE :s OR r.source_value LIKE :s)');
    repl.s = likePattern(q.search);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows, count] = await Promise.all([
    select(`${REQUEST_SELECT} ${whereSql} ORDER BY r.status = 'PENDING_REVIEW' DESC, r.created_at DESC LIMIT :limit OFFSET :offset`, { ...repl, limit: q.pageSize, offset: (q.page - 1) * q.pageSize }),
    select(`SELECT COUNT(*) AS n FROM master_creation_requests r ${whereSql}`, repl),
  ]);
  return { items: rows.map(presentRequest), meta: pageMeta(q, num(count[0]?.n)) };
}

async function requestByUuid(ctx: AuthContext, uuid: string) {
  const r = await MasterCreationRequest.findOne({ where: { uuid } });
  if (!r || !hasCompanyAccess(ctx, r.companyId)) throw ApiError.notFound('Master request not found');
  return r;
}

async function presentOne(uuid: string) {
  const [row] = await select(`${REQUEST_SELECT} WHERE r.uuid = :u`, { u: uuid });
  return presentRequest(row!);
}

/** Creates a request unless an open one already exists for the same master. Used by validation too. */
export async function ensureMasterRequest(
  companyId: number,
  input: { masterType: (typeof MASTER_TYPES)[number]; proposedName: string; proposedParent: string; sourceValue?: string | null; details?: Record<string, unknown>; jobId?: number | null; requestedBy?: number | null },
  transaction?: Transaction,
) {
  const existing = await MasterCreationRequest.findOne({ where: { companyId, proposedName: input.proposedName, status: { [Op.in]: [...OPEN_MASTER] } }, transaction });
  if (existing) return { request: existing, created: false };
  const request = await MasterCreationRequest.create(
    {
      companyId,
      jobId: input.jobId ?? null,
      masterType: input.masterType,
      sourceValue: input.sourceValue ?? null,
      proposedName: input.proposedName,
      proposedParent: input.proposedParent,
      details: input.details ?? null,
      requestedBy: input.requestedBy ?? null,
      reviewedBy: null,
      reviewedAt: null,
      reviewNotes: null,
      tallyResponseId: null,
      ledgerMasterId: null,
    },
    { transaction },
  );
  return { request, created: true };
}

export async function createMasterRequest(ctx: AuthContext, input: z.infer<typeof masterRequestInputSchema>, req: Request) {
  const company = await resolveCompany(ctx, input.companyId);
  const already = await LedgerMaster.findOne({ where: { companyId: company.id, name: input.proposedName, isActive: true } });
  if (already) throw ApiError.conflict(`Ledger "${input.proposedName}" already exists in ${company.name}`, 'MASTER_EXISTS');
  const { request, created } = await ensureMasterRequest(company.id, { ...input, details: input.notes ? { notes: input.notes } : undefined, requestedBy: ctx.user.id });
  if (!created) throw ApiError.conflict('An open request for this master already exists', 'REQUEST_EXISTS');
  await audit({ action: 'MASTER_CREATION_REQUESTED', userId: ctx.user.id, entityType: 'master_request', entityUuid: request.uuid, companyId: company.id, newStatus: 'PENDING_REVIEW', metadata: { name: input.proposedName, parent: input.proposedParent, type: input.masterType } }, req);
  return presentOne(request.uuid);
}

export async function updateMasterRequest(ctx: AuthContext, uuid: string, input: z.infer<typeof masterRequestUpdateSchema>, req: Request) {
  const r = await requestByUuid(ctx, uuid);
  if (r.status !== 'PENDING_REVIEW') throw ApiError.conflict('Only requests pending review can be edited', 'INVALID_STATUS');
  const before = { name: r.proposedName, parent: r.proposedParent };
  await r.update(Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)));
  await audit({ action: 'MASTER_REQUEST_EDITED', userId: ctx.user.id, entityType: 'master_request', entityUuid: r.uuid, companyId: r.companyId, metadata: { before, after: { name: r.proposedName, parent: r.proposedParent } } }, req);
  return presentOne(uuid);
}

export async function reviewMasterRequest(ctx: AuthContext, uuid: string, decision: 'APPROVED' | 'REJECTED', notes: string | null | undefined, req: Request) {
  const r = await requestByUuid(ctx, uuid);
  if (r.status !== 'PENDING_REVIEW') throw ApiError.conflict(`This request is already ${r.status.toLowerCase().replace('_', ' ')}`, 'INVALID_STATUS');
  if (r.requestedBy && r.requestedBy === ctx.user.id) throw ApiError.forbidden('You cannot review a master request you raised (separation of duties)');
  if (decision === 'REJECTED' && !notes) throw ApiError.badRequest('Give a reason when rejecting');
  await r.update({ status: decision, reviewedBy: ctx.user.id, reviewedAt: new Date(), reviewNotes: notes ?? null });
  await audit(
    { action: decision === 'APPROVED' ? 'MASTER_CREATION_APPROVED' : 'MASTER_CREATION_REJECTED', userId: ctx.user.id, entityType: 'master_request', entityUuid: r.uuid, companyId: r.companyId, previousStatus: 'PENDING_REVIEW', newStatus: decision, metadata: { name: r.proposedName, notes } },
    req,
  );
  return presentOne(uuid);
}

/** Sends a failed creation back to the Bridge Agent after Finance fixed the cause (e.g. missing group). */
export async function retryMasterCreation(ctx: AuthContext, uuid: string, req: Request) {
  const r = await requestByUuid(ctx, uuid);
  if (r.status !== 'FAILED') throw ApiError.conflict('Only failed requests can be retried', 'INVALID_STATUS');
  await r.update({ status: 'APPROVED', reviewedBy: ctx.user.id, reviewedAt: new Date() });
  await audit({ action: 'MASTER_CREATION_RETRIED', userId: ctx.user.id, entityType: 'master_request', entityUuid: r.uuid, companyId: r.companyId, previousStatus: 'FAILED', newStatus: 'APPROVED' }, req);
  return presentOne(uuid);
}

/**
 * Records that Finance created the approved master directly in Tally. The
 * ledger is registered unverified; the Bridge Agent's next sync confirms it.
 */
export async function markMasterCreated(ctx: AuthContext, uuid: string, req: Request) {
  const r = await requestByUuid(ctx, uuid);
  if (r.status !== 'APPROVED') throw ApiError.conflict('Only approved requests can be marked as created', 'INVALID_STATUS');
  assertCompanyAccess(ctx, r.companyId);
  await sequelize.transaction(async (transaction) => {
    let ledger = await LedgerMaster.findOne({ where: { companyId: r.companyId, name: r.proposedName }, transaction });
    if (ledger) await ledger.update({ isActive: true, parentGroup: r.proposedParent ?? ledger.parentGroup }, { transaction });
    else {
      ledger = await LedgerMaster.create(
        { companyId: r.companyId, name: r.proposedName, parentGroup: r.proposedParent, source: 'MASTER_REQUEST', isActive: true, syncedAt: null, lastVerifiedAt: null, createdBy: ctx.user.id, tallyGuid: null, tallyMasterId: null, tallyAlterId: null, openingBalance: null },
        { transaction },
      );
    }
    await r.update({ status: 'CREATED', ledgerMasterId: ledger.id }, { transaction });
    await sequelize.query('UPDATE ledger_mappings SET ledger_master_id = :l WHERE company_id = :c AND tally_ledger_name = :n', { replacements: { l: ledger.id, c: r.companyId, n: r.proposedName }, transaction });
    await audit(
      { action: 'MASTER_MARKED_CREATED', userId: ctx.user.id, entityType: 'master_request', entityUuid: r.uuid, companyId: r.companyId, previousStatus: 'APPROVED', newStatus: 'CREATED', metadata: { name: r.proposedName, verification: 'pending Tally read-back' } },
      req,
      transaction,
    );
  });
  return presentOne(uuid);
}
