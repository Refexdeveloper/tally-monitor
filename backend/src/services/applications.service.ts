import net from 'node:net';
import axios from 'axios';
import type { Request } from 'express';
import { Op, type Transaction } from 'sequelize';
import { z } from 'zod';
import { env } from '../config/env';
import { Application, ApplicationCompany, ApplicationCredential, Company, sequelize, SourceFieldMapping } from '../models';
import { VOUCHER_KINDS } from '../models/common';
import { decryptSecret, encryptSecret, randomToken } from '../utils/crypto';
import { ApiError } from '../utils/http';
import { audit } from './audit.service';
import type { AuthContext } from './auth/authContext';
import { assertCompanyAccess, hasCompanyAccess, iso, likePattern, nullableText, num, orderBy, pageMeta, select, withUniqueMessages, type ListQuery, type Row } from './common';

export const APPLICATION_TYPES = ['EXPENSE_CLAIM', 'TRAVEL', 'PAYMENT_REQUEST', 'PURCHASE', 'ADVANCE', 'OTHER'] as const;

const credentialsSchema = z
  .object({
    apiKeyId: z.string().trim().min(1).max(200).optional(),
    apiKeySecret: z.string().trim().min(1).max(500).optional(),
    bearerToken: z.string().trim().min(1).max(4000).optional(),
  })
  .optional();

const companyLinkSchema = z.object({
  companyId: z.string().uuid(),
  sourceCompanyKey: z.string().trim().min(1, 'Source company key is required').max(150),
});

const baseFields = {
  name: z.string().trim().min(2, 'Application name is required').max(150),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9_-]{1,63}$/, 'Use 2-64 letters, digits, "-" or "_"'),
  description: nullableText(1000),
  applicationType: z.enum(APPLICATION_TYPES),
  icon: nullableText(64),
  color: z.preprocess((v) => (v === '' ? null : v), z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Use a hex colour like #4F46E5').nullable().optional()),
  kissflowAccount: nullableText(150),
  kissflowAppId: nullableText(150),
  kissflowProcessId: nullableText(150),
  integrationMode: z.enum(['WEBHOOK', 'API', 'MANUAL']),
  apiEndpoint: z.preprocess((v) => (v === '' ? null : v), z.string().url('Enter a valid URL').max(500).nullable().optional()),
  authMethod: z.enum(['HMAC_SHA256', 'BEARER_TOKEN', 'API_KEY', 'NONE']),
  defaultVoucherKind: z.preprocess((v) => (v === '' ? null : v), z.enum(VOUCHER_KINDS).nullable().optional()),
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE']).optional(),
};

function checkModeRules(v: { integrationMode?: string; authMethod?: string; apiEndpoint?: string | null }, ctx: z.RefinementCtx) {
  if (v.integrationMode === 'WEBHOOK' && v.authMethod === 'NONE') {
    ctx.addIssue({ code: 'custom', path: ['authMethod'], message: 'Webhooks must be authenticated (HMAC or token)' });
  }
  if (v.integrationMode === 'API') {
    if (!v.apiEndpoint) ctx.addIssue({ code: 'custom', path: ['apiEndpoint'], message: 'API endpoint is required for API integrations' });
    else if (!v.apiEndpoint.startsWith('https://')) ctx.addIssue({ code: 'custom', path: ['apiEndpoint'], message: 'API endpoint must use HTTPS' });
    if (v.authMethod === 'HMAC_SHA256' || v.authMethod === 'NONE') {
      ctx.addIssue({ code: 'custom', path: ['authMethod'], message: 'API integrations need an API key or bearer token' });
    }
  }
}

export const applicationCreateSchema = z
  .object({ ...baseFields, credentials: credentialsSchema, companies: z.array(companyLinkSchema).max(200).optional() })
  .superRefine(checkModeRules);

export const applicationUpdateSchema = z
  .object(Object.fromEntries(Object.entries(baseFields).map(([k, v]) => [k, v.optional()])) as { [K in keyof typeof baseFields]: z.ZodOptional<(typeof baseFields)[K]> })
  .extend({ credentials: credentialsSchema });

export const applicationListSchema = z.object({
  status: z.enum(['DRAFT', 'ACTIVE', 'INACTIVE', 'all']).default('all'),
  mode: z.enum(['WEBHOOK', 'API', 'MANUAL', 'all']).default('all'),
});

export const companyLinkInputSchema = companyLinkSchema;
export const companyLinkUpdateSchema = z.object({ sourceCompanyKey: z.string().trim().min(1).max(150).optional(), isActive: z.boolean().optional() });

const UNIQUE = {
  'applications.code': 'Another application already uses this code',
  code: 'Another application already uses this code',
  application_companies_application_id_source_company_key: 'This source company key is already used for another company in this application',
  source_company_key: 'This source company key is already used for another company in this application',
  application_companies_application_id_company_id: 'This company is already connected to the application',
};

export const webhookUrlFor = (code: string) => `${env.publicApiUrl}/api/v1/webhooks/${encodeURIComponent(code)}`;
const hint = (value: string) => (value.length <= 4 ? '••••' : `••••${value.slice(-4)}`);

function scopeExists(ctx: AuthContext) {
  if (ctx.companyIds === 'ALL') return { sql: '1=1', replacements: {} };
  if (!ctx.companyIds.length) return { sql: '1=0', replacements: {} };
  return {
    sql: 'EXISTS (SELECT 1 FROM application_companies acs WHERE acs.application_id = a.id AND acs.company_id IN (:scopeCompanyIds))',
    replacements: { scopeCompanyIds: ctx.companyIds },
  };
}

function scopedCompanyFilter(ctx: AuthContext, column: string) {
  if (ctx.companyIds === 'ALL') return '';
  if (!ctx.companyIds.length) return ' AND 1=0';
  return ` AND ${column} IN (:scopeCompanyIds)`;
}

function listSelect(ctx: AuthContext) {
  const e = scopedCompanyFilter(ctx, 'e.company_id');
  const j = scopedCompanyFilter(ctx, 'j.company_id');
  const ac = scopedCompanyFilter(ctx, 'ac.company_id');
  return `
  SELECT a.*,
    (SELECT COUNT(*) FROM application_companies ac JOIN companies c ON c.id = ac.company_id AND c.deleted_at IS NULL
      WHERE ac.application_id = a.id AND ac.is_active = 1${ac}) AS companies_count,
    (SELECT COUNT(*) FROM expense_transactions e WHERE e.application_id = a.id${e}) AS expenses,
    (SELECT COALESCE(SUM(e.amount), 0) FROM expense_transactions e WHERE e.application_id = a.id${e}) AS expense_amount,
    (SELECT COUNT(*) FROM processing_jobs j WHERE j.application_id = a.id AND j.status NOT IN ('POSTED', 'CANCELLED')${j}) AS open_jobs,
    (SELECT COUNT(*) FROM application_credentials cr WHERE cr.application_id = a.id AND cr.is_active = 1 AND cr.credential_type = 'WEBHOOK_SECRET') AS has_webhook_secret
  FROM applications a`;
}

function present(r: Row) {
  return {
    id: r.uuid as string,
    name: r.name as string,
    code: r.code as string,
    description: r.description,
    applicationType: r.application_type,
    icon: r.icon,
    color: r.color,
    kissflowAccount: r.kissflow_account,
    kissflowAppId: r.kissflow_app_id,
    kissflowProcessId: r.kissflow_process_id,
    integrationMode: r.integration_mode,
    apiEndpoint: r.api_endpoint,
    authMethod: r.auth_method,
    defaultVoucherKind: r.default_voucher_kind,
    status: r.status,
    webhookUrl: r.integration_mode === 'WEBHOOK' ? webhookUrlFor(r.code as string) : null,
    hasWebhookSecret: num(r.has_webhook_secret) > 0,
    lastRequestAt: iso(r.last_request_at),
    lastSuccessAt: iso(r.last_success_at),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    stats: {
      connectedCompanies: num(r.companies_count),
      expenses: num(r.expenses),
      expenseAmount: String(r.expense_amount ?? '0'),
      openJobs: num(r.open_jobs),
    },
  };
}

export async function listApplications(ctx: AuthContext, q: ListQuery & z.infer<typeof applicationListSchema>) {
  const scope = scopeExists(ctx);
  const where = ['a.deleted_at IS NULL', scope.sql];
  const repl: Record<string, unknown> = { ...scope.replacements };
  if (q.search) {
    where.push('(a.name LIKE :s OR a.code LIKE :s OR a.kissflow_app_id LIKE :s OR a.description LIKE :s)');
    repl.s = likePattern(q.search);
  }
  if (q.status !== 'all') {
    where.push('a.status = :status');
    repl.status = q.status;
  }
  if (q.mode !== 'all') {
    where.push('a.integration_mode = :mode');
    repl.mode = q.mode;
  }
  const whereSql = where.join(' AND ');
  const sort = orderBy(q, { name: 'a.name', createdAt: 'a.created_at', expenses: 'expenses', lastRequestAt: 'a.last_request_at' }, 'createdAt');
  const [rows, count] = await Promise.all([
    select(`${listSelect(ctx)} WHERE ${whereSql} ORDER BY ${sort} LIMIT :limit OFFSET :offset`, { ...repl, limit: q.pageSize, offset: (q.page - 1) * q.pageSize }),
    select(`SELECT COUNT(*) AS n FROM applications a WHERE ${whereSql}`, repl),
  ]);
  return { items: rows.map(present), meta: pageMeta(q, num(count[0]?.n)) };
}

async function resolveApplication(ctx: AuthContext, uuid: string) {
  const app = await Application.findOne({ where: { uuid } });
  if (!app) throw ApiError.notFound('Application not found');
  if (ctx.companyIds !== 'ALL') {
    const link = await ApplicationCompany.findOne({ where: { applicationId: app.id, companyId: { [Op.in]: ctx.companyIds } } });
    if (!link) throw ApiError.notFound('Application not found');
  }
  return app;
}

export async function getApplication(ctx: AuthContext, uuid: string) {
  const app = await resolveApplication(ctx, uuid);
  const [row] = await select(`${listSelect(ctx)} WHERE a.id = :id`, {
    id: app.id,
    ...(ctx.companyIds === 'ALL' ? {} : { scopeCompanyIds: ctx.companyIds.length ? ctx.companyIds : [0] }),
  });
  const credentials = await ApplicationCredential.findAll({ where: { applicationId: app.id, isActive: true }, order: [['createdAt', 'DESC']] });
  return {
    ...present(row!),
    credentials: credentials.map((c) => ({ id: c.uuid, type: c.credentialType, label: c.label, hint: c.hint, createdAt: iso(c.createdAt), rotatedAt: iso(c.rotatedAt) })),
  };
}

async function storeCredential(
  applicationId: number,
  type: ApplicationCredential['credentialType'],
  plaintext: string,
  label: string,
  transaction: Transaction,
  hintSource: string = plaintext,
) {
  await ApplicationCredential.update({ isActive: false, rotatedAt: new Date() }, { where: { applicationId, credentialType: type, isActive: true }, transaction });
  await ApplicationCredential.create(
    { applicationId, credentialType: type, label, encryptedValue: encryptSecret(plaintext, env.encryptionKey), hint: hint(hintSource), isActive: true, expiresAt: null, rotatedAt: null },
    { transaction },
  );
}

async function applyCredentials(
  app: { id: number; authMethod: string },
  credentials: z.infer<typeof credentialsSchema>,
  transaction: Transaction,
) {
  if (!credentials) return [];
  const stored: string[] = [];
  if (app.authMethod === 'API_KEY' && (credentials.apiKeyId || credentials.apiKeySecret)) {
    if (!credentials.apiKeyId || !credentials.apiKeySecret) throw ApiError.badRequest('Both API key ID and API key secret are required');
    await storeCredential(
      app.id,
      'API_KEY',
      JSON.stringify({ keyId: credentials.apiKeyId, keySecret: credentials.apiKeySecret }),
      'Access key',
      transaction,
      // Hint derives from the non-secret key id so no part of the secret is ever displayed.
      credentials.apiKeyId,
    );
    stored.push('API_KEY');
  }
  if (app.authMethod === 'BEARER_TOKEN' && credentials.bearerToken) {
    await storeCredential(app.id, 'BEARER_TOKEN', credentials.bearerToken, 'Bearer token', transaction);
    stored.push('BEARER_TOKEN');
  }
  return stored;
}

async function linkCompanies(ctx: AuthContext, applicationId: number, links: z.infer<typeof companyLinkSchema>[], transaction: Transaction) {
  for (const link of links) {
    const company = await Company.findOne({ where: { uuid: link.companyId }, transaction });
    if (!company) throw ApiError.badRequest('One of the selected companies does not exist');
    assertCompanyAccess(ctx, company.id);
    await ApplicationCompany.create({ applicationId, companyId: company.id, sourceCompanyKey: link.sourceCompanyKey, isActive: true }, { transaction });
  }
}

export async function createApplication(ctx: AuthContext, input: z.infer<typeof applicationCreateSchema>, req: Request) {
  if (input.status === 'ACTIVE' && !(input.companies?.length)) throw ApiError.badRequest('Connect at least one company before activating the application');
  if (ctx.companyIds !== 'ALL' && !(input.companies?.length)) throw ApiError.badRequest('Connect at least one of your companies');

  let webhookSecret: string | null = null;
  const app = await withUniqueMessages(
    () =>
      sequelize.transaction(async (transaction) => {
        const created = await Application.create(
          {
            name: input.name,
            code: input.code,
            description: input.description ?? null,
            applicationType: input.applicationType,
            icon: input.icon ?? null,
            color: input.color ?? null,
            kissflowAccount: input.kissflowAccount ?? null,
            kissflowAppId: input.kissflowAppId ?? null,
            kissflowProcessId: input.kissflowProcessId ?? null,
            integrationMode: input.integrationMode,
            apiEndpoint: input.apiEndpoint ?? null,
            authMethod: input.authMethod,
            defaultVoucherKind: input.defaultVoucherKind ?? null,
            status: input.status ?? 'DRAFT',
            lastRequestAt: null,
            lastSuccessAt: null,
            deletedAt: null,
          },
          { transaction },
        );
        if (input.integrationMode === 'WEBHOOK' && (input.authMethod === 'HMAC_SHA256' || input.authMethod === 'BEARER_TOKEN')) {
          webhookSecret = randomToken(32);
          await storeCredential(created.id, 'WEBHOOK_SECRET', webhookSecret, input.authMethod === 'HMAC_SHA256' ? 'HMAC signing secret' : 'Webhook bearer token', transaction);
        }
        if (input.integrationMode === 'API') await applyCredentials(created, input.credentials, transaction);
        await linkCompanies(ctx, created.id, input.companies ?? [], transaction);
        await audit(
          {
            action: 'APPLICATION_CREATED',
            userId: ctx.user.id,
            entityType: 'application',
            entityUuid: created.uuid,
            applicationId: created.id,
            newStatus: created.status,
            metadata: { code: created.code, mode: created.integrationMode, companies: input.companies?.length ?? 0 },
          },
          req,
          transaction,
        );
        return created;
      }),
    UNIQUE,
  );
  return { application: await getApplication(ctx, app.uuid), webhookSecret };
}

async function assertActivatable(app: Application) {
  const links = await ApplicationCompany.count({ where: { applicationId: app.id, isActive: true } });
  if (!links) throw ApiError.badRequest('Connect at least one active company before activating the application');
  if (app.integrationMode === 'API') {
    const creds = await ApplicationCredential.count({ where: { applicationId: app.id, isActive: true, credentialType: { [Op.in]: ['API_KEY', 'BEARER_TOKEN'] } } });
    if (!creds) throw ApiError.badRequest('Add API credentials before activating an API integration');
  }
  if (app.integrationMode === 'WEBHOOK' && app.authMethod !== 'NONE') {
    const creds = await ApplicationCredential.count({ where: { applicationId: app.id, isActive: true, credentialType: 'WEBHOOK_SECRET' } });
    if (!creds) throw ApiError.badRequest('Generate a webhook secret before activating the application');
  }
}

export async function updateApplication(ctx: AuthContext, uuid: string, input: z.infer<typeof applicationUpdateSchema>, req: Request) {
  const app = await resolveApplication(ctx, uuid);
  const { credentials, ...fields } = input;
  const merged = { integrationMode: fields.integrationMode ?? app.integrationMode, authMethod: fields.authMethod ?? app.authMethod, apiEndpoint: fields.apiEndpoint !== undefined ? fields.apiEndpoint : app.apiEndpoint };
  const issues: string[] = [];
  checkModeRules(merged, { addIssue: (i: { message?: string }) => issues.push(i.message ?? 'Invalid configuration') } as unknown as z.RefinementCtx);
  if (issues.length) throw new ApiError(422, 'VALIDATION_ERROR', issues[0]!);

  const previousStatus = app.status;
  const changes = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
  let webhookSecret: string | null = null;

  await withUniqueMessages(
    () =>
      sequelize.transaction(async (transaction) => {
        await app.update(changes, { transaction });
        if (merged.integrationMode === 'API') await applyCredentials({ id: app.id, authMethod: merged.authMethod }, credentials, transaction);
        if (merged.integrationMode === 'WEBHOOK' && merged.authMethod !== 'NONE') {
          const has = await ApplicationCredential.count({ where: { applicationId: app.id, isActive: true, credentialType: 'WEBHOOK_SECRET' }, transaction });
          if (!has) {
            webhookSecret = randomToken(32);
            await storeCredential(app.id, 'WEBHOOK_SECRET', webhookSecret, 'HMAC signing secret', transaction);
          }
        }
      }),
    UNIQUE,
  );
  if (app.status === 'ACTIVE' && previousStatus !== 'ACTIVE') {
    try {
      await assertActivatable(app);
    } catch (err) {
      await app.update({ status: previousStatus });
      throw err;
    }
  }

  const changedKeys = [...Object.keys(changes), ...(credentials ? ['credentials'] : [])];
  if (changedKeys.length) {
    await audit(
      {
        action: previousStatus !== app.status ? (app.status === 'ACTIVE' ? 'APPLICATION_ACTIVATED' : 'APPLICATION_DEACTIVATED') : 'APPLICATION_UPDATED',
        userId: ctx.user.id,
        entityType: 'application',
        entityUuid: app.uuid,
        applicationId: app.id,
        previousStatus,
        newStatus: app.status,
        metadata: { changed: changedKeys },
      },
      req,
    );
  }
  return { application: await getApplication(ctx, uuid), webhookSecret };
}

export async function deleteApplication(ctx: AuthContext, uuid: string, req: Request) {
  const app = await resolveApplication(ctx, uuid);
  const [open] = await select(`SELECT COUNT(*) AS n FROM processing_jobs j WHERE j.application_id = :id AND j.status NOT IN ('POSTED', 'CANCELLED')`, { id: app.id });
  if (num(open?.n) > 0) throw ApiError.conflict('This application still has open jobs. Resolve or cancel them before deleting.', 'APPLICATION_BUSY');
  await sequelize.transaction(async (transaction) => {
    await app.update({ status: 'INACTIVE' }, { transaction });
    await ApplicationCredential.update({ isActive: false, rotatedAt: new Date() }, { where: { applicationId: app.id, isActive: true }, transaction });
    await app.destroy({ transaction });
    await audit({ action: 'APPLICATION_DELETED', userId: ctx.user.id, entityType: 'application', entityUuid: app.uuid, applicationId: app.id, previousStatus: app.status }, req, transaction);
  });
}

export async function regenerateWebhookSecret(ctx: AuthContext, uuid: string, req: Request) {
  const app = await resolveApplication(ctx, uuid);
  if (app.integrationMode !== 'WEBHOOK' || app.authMethod === 'NONE') throw ApiError.badRequest('This application does not use an authenticated webhook');
  const secret = randomToken(32);
  await sequelize.transaction(async (transaction) => {
    await storeCredential(app.id, 'WEBHOOK_SECRET', secret, app.authMethod === 'HMAC_SHA256' ? 'HMAC signing secret' : 'Webhook bearer token', transaction);
    await audit({ action: 'APPLICATION_SECRET_REGENERATED', userId: ctx.user.id, entityType: 'application', entityUuid: app.uuid, applicationId: app.id }, req, transaction);
  });
  return { webhookSecret: secret, webhookUrl: webhookUrlFor(app.code) };
}

export async function listApplicationCompanies(ctx: AuthContext, uuid: string) {
  const app = await resolveApplication(ctx, uuid);
  const rows = await select(
    `SELECT c.uuid, c.name, c.code, c.tally_company_name, c.is_active AS company_active, ac.source_company_key, ac.is_active, ac.created_at,
            (SELECT COUNT(*) FROM expense_transactions e WHERE e.company_id = c.id AND e.application_id = ac.application_id) AS expenses,
            (SELECT MAX(e.received_at) FROM expense_transactions e WHERE e.company_id = c.id AND e.application_id = ac.application_id) AS last_received
     FROM application_companies ac JOIN companies c ON c.id = ac.company_id AND c.deleted_at IS NULL
     WHERE ac.application_id = :id${scopedCompanyFilter(ctx, 'c.id')} ORDER BY c.name`,
    { id: app.id, ...(ctx.companyIds === 'ALL' ? {} : { scopeCompanyIds: ctx.companyIds.length ? ctx.companyIds : [0] }) },
  );
  return rows.map((r) => ({
    companyId: r.uuid,
    name: r.name,
    code: r.code,
    tallyCompanyName: r.tally_company_name,
    companyActive: Boolean(r.company_active),
    sourceCompanyKey: r.source_company_key,
    isActive: Boolean(r.is_active),
    linkedAt: iso(r.created_at),
    expenses: num(r.expenses),
    lastReceivedAt: iso(r.last_received),
  }));
}

export async function addCompanyLink(ctx: AuthContext, uuid: string, input: z.infer<typeof companyLinkSchema>, req: Request) {
  const app = await resolveApplication(ctx, uuid);
  const company = await Company.findOne({ where: { uuid: input.companyId } });
  if (!company) throw ApiError.notFound('Company not found');
  assertCompanyAccess(ctx, company.id);
  await withUniqueMessages(() => ApplicationCompany.create({ applicationId: app.id, companyId: company.id, sourceCompanyKey: input.sourceCompanyKey, isActive: true }), UNIQUE);
  await audit(
    { action: 'APPLICATION_COMPANY_LINKED', userId: ctx.user.id, entityType: 'application', entityUuid: app.uuid, applicationId: app.id, companyId: company.id, metadata: { sourceCompanyKey: input.sourceCompanyKey } },
    req,
  );
  return listApplicationCompanies(ctx, uuid);
}

export async function updateCompanyLink(ctx: AuthContext, uuid: string, companyUuid: string, input: z.infer<typeof companyLinkUpdateSchema>, req: Request) {
  const app = await resolveApplication(ctx, uuid);
  const company = await Company.findOne({ where: { uuid: companyUuid } });
  if (!company || !hasCompanyAccess(ctx, company.id)) throw ApiError.notFound('Company not found');
  const link = await ApplicationCompany.findOne({ where: { applicationId: app.id, companyId: company.id } });
  if (!link) throw ApiError.notFound('This company is not connected to the application');
  await withUniqueMessages(() => link.update(Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined))), UNIQUE);
  await audit({ action: 'APPLICATION_COMPANY_LINK_UPDATED', userId: ctx.user.id, entityType: 'application', entityUuid: app.uuid, applicationId: app.id, companyId: company.id, metadata: input }, req);
  return listApplicationCompanies(ctx, uuid);
}

export async function removeCompanyLink(ctx: AuthContext, uuid: string, companyUuid: string, req: Request) {
  const app = await resolveApplication(ctx, uuid);
  const company = await Company.findOne({ where: { uuid: companyUuid } });
  if (!company || !hasCompanyAccess(ctx, company.id)) throw ApiError.notFound('Company not found');
  const link = await ApplicationCompany.findOne({ where: { applicationId: app.id, companyId: company.id } });
  if (!link) throw ApiError.notFound('This company is not connected to the application');

  const [history] = await select('SELECT COUNT(*) AS n FROM expense_transactions WHERE application_id = :a AND company_id = :c', { a: app.id, c: company.id });
  // Keep the link (deactivated) when history exists so past transactions stay explainable.
  const mode = num(history?.n) > 0 ? 'DEACTIVATED' : 'REMOVED';
  if (mode === 'DEACTIVATED') await link.update({ isActive: false });
  else await link.destroy();

  if (app.status === 'ACTIVE' && !(await ApplicationCompany.count({ where: { applicationId: app.id, isActive: true } }))) {
    await app.update({ status: 'INACTIVE' });
  }
  await audit({ action: 'APPLICATION_COMPANY_UNLINKED', userId: ctx.user.id, entityType: 'application', entityUuid: app.uuid, applicationId: app.id, companyId: company.id, metadata: { mode } }, req);
  return { mode, companies: await listApplicationCompanies(ctx, uuid) };
}

interface Check {
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  message: string;
}

function hostAllowed(hostname: string) {
  const h = hostname.toLowerCase();
  if (net.isIP(h)) return false;
  return env.kissflowAllowedHosts.some((suffix) => h === suffix || h.endsWith(`.${suffix}`));
}

export async function testConnection(ctx: AuthContext, uuid: string, req: Request) {
  const app = await resolveApplication(ctx, uuid);
  const checks: Check[] = [];
  checks.push(
    app.status === 'ACTIVE'
      ? { name: 'Status', status: 'PASS', message: 'Application is active' }
      : { name: 'Status', status: 'WARN', message: `Application is ${app.status.toLowerCase()}; incoming data will be rejected until it is activated` },
  );
  const links = await ApplicationCompany.count({ where: { applicationId: app.id, isActive: true } });
  checks.push(links ? { name: 'Companies', status: 'PASS', message: `${links} active company connection(s)` } : { name: 'Companies', status: 'FAIL', message: 'No active company connections' });

  if (app.integrationMode === 'WEBHOOK') {
    const mappingCount = await SourceFieldMapping.count({ where: { applicationId: app.id } });
    checks.push(mappingCount ? { name: 'Field mapping', status: 'PASS', message: `${mappingCount} fields mapped` } : { name: 'Field mapping', status: 'FAIL', message: 'No field mapping configured; incoming items will be rejected' });
    const secret = await ApplicationCredential.count({ where: { applicationId: app.id, isActive: true, credentialType: 'WEBHOOK_SECRET' } });
    checks.push(
      app.authMethod === 'NONE'
        ? { name: 'Authentication', status: 'FAIL', message: 'Webhook is not authenticated' }
        : secret
          ? { name: 'Authentication', status: 'PASS', message: `${app.authMethod === 'HMAC_SHA256' ? 'HMAC signing secret' : 'Webhook token'} configured` }
          : { name: 'Authentication', status: 'FAIL', message: 'No webhook secret; regenerate one' },
    );
    checks.push(
      app.lastRequestAt
        ? { name: 'Last request', status: 'PASS', message: `Last webhook received ${app.lastRequestAt.toISOString()}` }
        : { name: 'Last request', status: 'WARN', message: 'No webhook received yet. Configure the Kissflow integration with the webhook URL and secret.' },
    );
  } else if (app.integrationMode === 'API') {
    const cred = await ApplicationCredential.unscoped().findOne({
      where: { applicationId: app.id, isActive: true, credentialType: { [Op.in]: ['API_KEY', 'BEARER_TOKEN'] } },
      order: [['createdAt', 'DESC']],
    });
    const mappingCount = await SourceFieldMapping.count({ where: { applicationId: app.id } });
    checks.push(mappingCount ? { name: 'Field mapping', status: 'PASS', message: `${mappingCount} fields mapped` } : { name: 'Field mapping', status: 'FAIL', message: 'No field mapping configured' });
    if (!app.apiEndpoint) checks.push({ name: 'Endpoint', status: 'FAIL', message: 'No API endpoint configured' });
    else if (!cred) checks.push({ name: 'Credentials', status: 'FAIL', message: 'No API credentials stored' });
    else {
      const url = new URL(app.apiEndpoint);
      if (url.protocol !== 'https:' || !hostAllowed(url.hostname)) {
        checks.push({ name: 'Endpoint', status: 'FAIL', message: `Host ${url.hostname} is not in the allowed Kissflow hosts (${env.kissflowAllowedHosts.join(', ')})` });
      } else {
        const secret = decryptSecret(cred.encryptedValue, env.encryptionKey);
        const headers: Record<string, string> =
          cred.credentialType === 'API_KEY'
            ? (() => {
                const { keyId, keySecret } = JSON.parse(secret) as { keyId: string; keySecret: string };
                return { 'X-Access-Key-Id': keyId, 'X-Access-Key-Secret': keySecret };
              })()
            : { Authorization: `Bearer ${secret}` };
        const t0 = Date.now();
        try {
          const res = await axios.get(app.apiEndpoint, { headers, timeout: 8000, maxRedirects: 0, validateStatus: () => true, responseType: 'text' });
          const ms = Date.now() - t0;
          checks.push(
            res.status >= 200 && res.status < 300
              ? { name: 'Kissflow API', status: 'PASS', message: `HTTP ${res.status} in ${ms} ms` }
              : res.status === 401 || res.status === 403
                ? { name: 'Kissflow API', status: 'FAIL', message: `Credentials rejected (HTTP ${res.status})` }
                : { name: 'Kissflow API', status: 'WARN', message: `Endpoint answered HTTP ${res.status} in ${ms} ms` },
          );
        } catch (err) {
          checks.push({ name: 'Kissflow API', status: 'FAIL', message: `Request failed: ${(err as Error).message}` });
        }
      }
    }
  } else {
    checks.push({ name: 'Mode', status: 'PASS', message: 'Manual import; no remote connection required' });
  }

  const ok = checks.every((c) => c.status !== 'FAIL');
  await audit(
    { action: 'APPLICATION_CONNECTION_TESTED', userId: ctx.user.id, entityType: 'application', entityUuid: app.uuid, applicationId: app.id, metadata: { ok, checks: checks.map((c) => `${c.name}:${c.status}`) } },
    req,
  );
  return { ok, testedAt: new Date().toISOString(), checks };
}
