import type { Request } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { Company, IntegrationAgent, TallyServer } from '../models';
import { ApiError } from '../utils/http';
import { companyScope } from './access';
import { audit } from './audit.service';
import type { AuthContext } from './auth/authContext';
import { iso, likePattern, nullableText, num, orderBy, pageMeta, resolveCompany, select, withUniqueMessages, type ListQuery, type Row } from './common';

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const companyInputSchema = z.object({
  name: z.string().trim().min(2, 'Company name is required').max(200),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9_-]{1,31}$/, 'Use 2-32 letters, digits, "-" or "_"'),
  gstin: z.preprocess(
    (v) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim().toUpperCase()) : v),
    z.string().regex(GSTIN, 'Enter a valid 15-character GSTIN').nullable().optional(),
  ),
  tallyCompanyName: z.string().trim().min(1, 'Exact Tally company name is required').max(255),
  tallyServerId: z.string().uuid().nullable().optional(),
  integrationAgentId: z.string().uuid().nullable().optional(),
  defaultCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'Use a 3-letter ISO currency code').optional(),
  financialYearStart: z.preprocess((v) => (v === '' ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullable().optional()),
  isActive: z.boolean().optional(),
});
export const companyUpdateSchema = companyInputSchema.partial();
export type CompanyInput = z.infer<typeof companyInputSchema>;

export const companyListSchema = z.object({
  status: z.enum(['active', 'inactive', 'all']).default('all'),
});

const UNIQUE = {
  code: 'Another company already uses this code',
  uq_companies_server_tally_name: 'This Tally company is already mapped to another company on the same Tally server',
};

const BASE_SELECT = `
  SELECT c.id, c.uuid, c.name, c.code, c.gstin, c.tally_company_name, c.default_currency, c.financial_year_start, c.is_active,
         c.created_at, c.updated_at,
         s.uuid AS server_uuid, s.name AS server_name, s.host AS server_host, s.port AS server_port, s.status AS server_status,
         s.last_health_check_at AS server_checked_at, s.tally_release AS server_release, s.discovered_companies AS server_discovered,
         s.discovered_at AS server_discovered_at, c.ledgers_synced_at,
         ag.uuid AS agent_uuid, ag.name AS agent_name, ag.last_heartbeat_at AS agent_heartbeat_at, ag.status AS agent_status,
         (c.integration_agent_id IS NOT NULL) AS agent_overridden,
         (SELECT COUNT(*) FROM application_companies ac JOIN applications a ON a.id = ac.application_id AND a.deleted_at IS NULL
           WHERE ac.company_id = c.id AND ac.is_active = 1) AS apps,
         (SELECT COUNT(*) FROM expense_transactions e WHERE e.company_id = c.id) AS expenses,
         (SELECT COALESCE(SUM(e.amount), 0) FROM expense_transactions e WHERE e.company_id = c.id) AS expense_amount,
         (SELECT COUNT(*) FROM posted_vouchers pv WHERE pv.company_id = c.id AND pv.verification_status = 'VERIFIED') AS posted,
         (SELECT COUNT(*) FROM processing_jobs j WHERE j.company_id = c.id AND j.status NOT IN ('POSTED', 'CANCELLED')) AS open_jobs,
         (SELECT COUNT(*) FROM processing_jobs j WHERE j.company_id = c.id AND j.status = 'FAILED') AS failed_jobs
  FROM companies c
  LEFT JOIN tally_servers s ON s.id = c.tally_server_id
  LEFT JOIN integration_agents ag ON ag.id = COALESCE(c.integration_agent_id, s.integration_agent_id) AND ag.revoked_at IS NULL`;

export type IntegrationStatus = 'INACTIVE' | 'NOT_CONFIGURED' | 'NO_AGENT' | 'AGENT_OFFLINE' | 'CONNECTED';

function integrationStatus(r: Row): IntegrationStatus {
  if (!r.is_active) return 'INACTIVE';
  if (!r.server_uuid) return 'NOT_CONFIGURED';
  if (!r.agent_uuid) return 'NO_AGENT';
  const t = r.agent_heartbeat_at ? new Date(r.agent_heartbeat_at as string).getTime() : 0;
  return Date.now() - t <= env.AGENT_HEARTBEAT_TIMEOUT_SECONDS * 1000 ? 'CONNECTED' : 'AGENT_OFFLINE';
}

function present(r: Row, canSeeTally: boolean) {
  const discovered = (typeof r.server_discovered === 'string' ? JSON.parse(r.server_discovered) : r.server_discovered) as string[] | null;
  return {
    id: r.uuid as string,
    name: r.name,
    code: r.code,
    gstin: r.gstin,
    tallyCompanyName: r.tally_company_name,
    defaultCurrency: r.default_currency,
    financialYearStart: r.financial_year_start,
    isActive: Boolean(r.is_active),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    tallyServer: r.server_uuid
      ? {
          id: r.server_uuid,
          name: r.server_name,
          endpoint: canSeeTally ? `${r.server_host}:${r.server_port}` : null,
          release: r.server_release,
          status: r.server_status,
          lastHealthCheckAt: iso(r.server_checked_at),
          // null = the agent has not reported loaded companies yet.
          companyLoaded: discovered ? discovered.some((n) => n.trim().toLowerCase() === String(r.tally_company_name).trim().toLowerCase()) : null,
          discoveredAt: iso(r.server_discovered_at),
        }
      : null,
    ledgersSyncedAt: iso(r.ledgers_synced_at),
    agent: r.agent_uuid ? { id: r.agent_uuid, name: r.agent_name, lastHeartbeatAt: iso(r.agent_heartbeat_at), overridden: Boolean(r.agent_overridden) } : null,
    integrationStatus: integrationStatus(r),
    stats: {
      connectedApplications: num(r.apps),
      expenses: num(r.expenses),
      expenseAmount: String(r.expense_amount ?? '0'),
      postedVouchers: num(r.posted),
      openJobs: num(r.open_jobs),
      failedJobs: num(r.failed_jobs),
    },
  };
}
export type CompanyDto = ReturnType<typeof present>;

export async function listCompanies(ctx: AuthContext, q: ListQuery & z.infer<typeof companyListSchema>) {
  const scope = companyScope(ctx, 'c.id');
  const where = ['c.deleted_at IS NULL', scope.sql];
  const repl: Record<string, unknown> = { ...scope.replacements };
  if (q.search) {
    where.push('(c.name LIKE :s OR c.code LIKE :s OR c.tally_company_name LIKE :s OR c.gstin LIKE :s)');
    repl.s = likePattern(q.search);
  }
  if (q.status !== 'all') where.push(`c.is_active = ${q.status === 'active' ? 1 : 0}`);
  const whereSql = where.join(' AND ');
  const sort = orderBy(q, { name: 'c.name', code: 'c.code', createdAt: 'c.created_at', expenses: 'expenses', openJobs: 'open_jobs' }, 'name');

  const [rows, count] = await Promise.all([
    select(`${BASE_SELECT} WHERE ${whereSql} ORDER BY ${sort} LIMIT :limit OFFSET :offset`, { ...repl, limit: q.pageSize, offset: (q.page - 1) * q.pageSize }),
    select(`SELECT COUNT(*) AS n FROM companies c WHERE ${whereSql}`, repl),
  ]);
  const canSeeTally = ctx.permissions.has('tally.view');
  return { items: rows.map((r) => present(r, canSeeTally)), meta: pageMeta(q, num(count[0]?.n)) };
}

export async function getCompany(ctx: AuthContext, uuid: string) {
  const company = await resolveCompany(ctx, uuid);
  const [row] = await select(`${BASE_SELECT} WHERE c.id = :id`, { id: company.id });
  return present(row!, ctx.permissions.has('tally.view'));
}

async function resolveRefs(input: Partial<CompanyInput>) {
  const refs: { tallyServerId?: number | null; integrationAgentId?: number | null } = {};
  if (input.tallyServerId !== undefined) {
    if (input.tallyServerId === null) refs.tallyServerId = null;
    else {
      const server = await TallyServer.findOne({ where: { uuid: input.tallyServerId } });
      if (!server) throw ApiError.badRequest('Selected Tally server does not exist');
      if (!server.isActive) throw ApiError.badRequest('Selected Tally server is inactive');
      refs.tallyServerId = server.id;
    }
  }
  if (input.integrationAgentId !== undefined) {
    if (input.integrationAgentId === null) refs.integrationAgentId = null;
    else {
      const agent = await IntegrationAgent.findOne({ where: { uuid: input.integrationAgentId } });
      if (!agent || agent.revokedAt) throw ApiError.badRequest('Selected Bridge Agent does not exist or was revoked');
      refs.integrationAgentId = agent.id;
    }
  }
  return refs;
}

export async function createCompany(ctx: AuthContext, input: CompanyInput, req: Request) {
  if (ctx.companyIds !== 'ALL') throw ApiError.forbidden('Only users with access to all companies can create companies');
  const refs = await resolveRefs(input);
  const company = await withUniqueMessages(
    () =>
      Company.create({
        name: input.name,
        code: input.code,
        gstin: input.gstin ?? null,
        tallyCompanyName: input.tallyCompanyName,
        tallyServerId: refs.tallyServerId ?? null,
        integrationAgentId: refs.integrationAgentId ?? null,
        defaultCurrency: input.defaultCurrency ?? 'INR',
        financialYearStart: input.financialYearStart ?? null,
        isActive: input.isActive ?? true,
        deletedAt: null,
      }),
    UNIQUE,
  );
  await audit(
    { action: 'COMPANY_CREATED', userId: ctx.user.id, entityType: 'company', entityUuid: company.uuid, companyId: company.id, metadata: { code: company.code } },
    req,
  );
  return getCompany(ctx, company.uuid);
}

export async function updateCompany(ctx: AuthContext, uuid: string, input: Partial<CompanyInput>, req: Request) {
  const company = await resolveCompany(ctx, uuid);
  const refs = await resolveRefs(input);
  const before = company.get({ plain: true });
  const changes: Record<string, unknown> = {};
  for (const key of ['name', 'code', 'gstin', 'tallyCompanyName', 'defaultCurrency', 'financialYearStart', 'isActive'] as const) {
    if (input[key] !== undefined) changes[key] = input[key];
  }
  Object.assign(changes, refs);

  if (changes.tallyCompanyName !== undefined && changes.tallyCompanyName !== company.tallyCompanyName) {
    // Renaming the Tally target with work in flight could post into the wrong books.
    const [busy] = await select(`SELECT COUNT(*) AS n FROM processing_jobs j WHERE j.company_id = :id AND j.status IN ('PROCESSING', 'RECONCILIATION_REQUIRED')`, {
      id: company.id,
    });
    if (num(busy?.n) > 0) throw ApiError.conflict('Cannot change the Tally company while jobs are processing or awaiting reconciliation', 'COMPANY_BUSY');
  }

  await withUniqueMessages(() => company.update(changes), UNIQUE);
  const changed = Object.keys(changes).filter((k) => String((before as Record<string, unknown>)[k] ?? '') !== String(changes[k] ?? ''));
  if (changed.length) {
    await audit(
      {
        action: changes.isActive === false && before.isActive ? 'COMPANY_DEACTIVATED' : changes.isActive === true && !before.isActive ? 'COMPANY_ACTIVATED' : 'COMPANY_UPDATED',
        userId: ctx.user.id,
        entityType: 'company',
        entityUuid: company.uuid,
        companyId: company.id,
        metadata: { changed },
      },
      req,
    );
  }
  return getCompany(ctx, uuid);
}

/** Applications connected to a company, with per-pair activity. */
export async function listCompanyApplications(ctx: AuthContext, uuid: string) {
  const company = await resolveCompany(ctx, uuid);
  const rows = await select(
    `SELECT a.uuid, a.name, a.code, a.status, a.integration_mode, a.color, a.icon, ac.source_company_key, ac.is_active, ac.created_at,
            (SELECT COUNT(*) FROM expense_transactions e WHERE e.company_id = ac.company_id AND e.application_id = a.id) AS expenses,
            (SELECT MAX(e.received_at) FROM expense_transactions e WHERE e.company_id = ac.company_id AND e.application_id = a.id) AS last_received
     FROM application_companies ac JOIN applications a ON a.id = ac.application_id AND a.deleted_at IS NULL
     WHERE ac.company_id = :id ORDER BY a.name`,
    { id: company.id },
  );
  return rows.map((r) => ({
    applicationId: r.uuid,
    name: r.name,
    code: r.code,
    status: r.status,
    integrationMode: r.integration_mode,
    color: r.color,
    icon: r.icon,
    sourceCompanyKey: r.source_company_key,
    isActive: Boolean(r.is_active),
    linkedAt: iso(r.created_at),
    expenses: num(r.expenses),
    lastReceivedAt: iso(r.last_received),
  }));
}
