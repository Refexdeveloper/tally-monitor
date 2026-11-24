import type { Request } from 'express';
import { Op, type WhereOptions } from 'sequelize';
import { z } from 'zod';
import { MAPPING_TEMPLATES, normalize, TARGET_FIELDS, TRANSFORMS, validateMappings, type FieldMapping } from '../domain/mapping';
import { Application, ApplicationCompany, ExpenseTransaction, sequelize, SourceFieldMapping, WebhookReceipt } from '../models';
import { ApiError } from '../utils/http';
import { audit } from './audit.service';
import type { AuthContext } from './auth/authContext';
import { iso, num, pageMeta, type ListQuery } from './common';
import { ingest, loadMappings, resolveCompanyLink } from './ingestion.service';
import { kissflowGet } from './kissflowClient';

const mappingRow = z.object({
  targetField: z.string().max(64),
  sourcePath: z.string().trim().max(255),
  transform: z.preprocess((v) => (v === '' ? null : v), z.enum(TRANSFORMS).nullable().optional()),
  defaultValue: z.preprocess((v) => (v === '' ? null : v), z.string().max(255).nullable().optional()),
  isRequired: z.boolean().optional(),
});
export const mappingsInputSchema = z.object({ mappings: z.array(mappingRow).max(80) });
export const previewSchema = z.object({ payload: z.unknown(), mappings: z.array(mappingRow).max(80).optional() });
export const importSchema = z.object({ payload: z.unknown() });
export const receiptListSchema = z.object({ status: z.enum(['ACCEPTED', 'DUPLICATE', 'REJECTED', 'FAILED', 'all']).default('all'), source: z.enum(['WEBHOOK', 'API', 'MANUAL', 'all']).default('all') });

export function mappingCatalog() {
  return { fields: TARGET_FIELDS, transforms: TRANSFORMS, templates: MAPPING_TEMPLATES };
}

/** Applies the same company scoping as the applications service. */
async function scopedApp(ctx: AuthContext, uuid: string) {
  const app = await Application.findOne({ where: { uuid } });
  if (!app) throw ApiError.notFound('Application not found');
  if (ctx.companyIds !== 'ALL') {
    const link = await ApplicationCompany.findOne({ where: { applicationId: app.id, companyId: { [Op.in]: ctx.companyIds.length ? ctx.companyIds : [0] } } });
    if (!link) throw ApiError.notFound('Application not found');
  }
  return app;
}

export async function getMappings(ctx: AuthContext, uuid: string) {
  const app = await scopedApp(ctx, uuid);
  const rows = await SourceFieldMapping.findAll({ where: { applicationId: app.id }, order: [['sortOrder', 'ASC']] });
  return rows.map((r) => ({ targetField: r.targetField, sourcePath: r.sourcePath, transform: r.transform, defaultValue: r.defaultValue, isRequired: r.isRequired, updatedAt: iso(r.updatedAt) }));
}

export async function saveMappings(ctx: AuthContext, uuid: string, mappings: FieldMapping[], req: Request) {
  const app = await scopedApp(ctx, uuid);
  const issues = validateMappings(mappings);
  if (issues.length) throw new ApiError(422, 'VALIDATION_ERROR', 'The field mapping is incomplete or invalid', issues.map((i) => ({ path: i.field, message: i.message })));
  const before = (await loadMappings(app.id)).map((m) => `${m.targetField}=${m.sourcePath}`);
  const order = new Map(TARGET_FIELDS.map((f, i) => [f.field, i]));
  await sequelize.transaction(async (transaction) => {
    await SourceFieldMapping.destroy({ where: { applicationId: app.id }, transaction });
    await SourceFieldMapping.bulkCreate(
      mappings.map((m) => ({
        applicationId: app.id,
        targetField: m.targetField,
        sourcePath: m.sourcePath.trim(),
        transform: m.transform ?? null,
        defaultValue: m.defaultValue ?? null,
        isRequired: m.isRequired ?? false,
        sortOrder: order.get(m.targetField) ?? 99,
      })),
      { transaction },
    );
    const after = mappings.map((m) => `${m.targetField}=${m.sourcePath.trim()}`);
    await audit(
      {
        action: 'FIELD_MAPPING_CHANGED',
        userId: ctx.user.id,
        entityType: 'application',
        entityUuid: app.uuid,
        applicationId: app.id,
        metadata: { added: after.filter((a) => !before.includes(a)), removed: before.filter((b) => !after.includes(b)) },
      },
      req,
      transaction,
    );
  });
  return getMappings(ctx, uuid);
}

/** Dry run: normalization, company resolution and duplicate check without writing. */
export async function previewMapping(ctx: AuthContext, uuid: string, payload: unknown, draft?: FieldMapping[]) {
  const app = await scopedApp(ctx, uuid);
  const mappings = draft ?? (await loadMappings(app.id));
  const mappingIssues = validateMappings(mappings);
  const result = normalize(payload, mappings);
  const checks: { name: string; status: 'PASS' | 'WARN' | 'FAIL'; message: string }[] = [];
  if (result.value) {
    checks.push(result.value.approvalStatus === 'APPROVED' ? { name: 'Approval', status: 'PASS', message: 'Item is approved' } : { name: 'Approval', status: 'FAIL', message: `Item is ${result.value.approvalStatus.toLowerCase()}; it would be rejected` });
    const link = await resolveCompanyLink(app.id, result.value.companyKey);
    checks.push(!link.ok ? { name: 'Company', status: 'FAIL', message: link.error.message } : { name: 'Company', status: 'PASS', message: `Routes to ${link.company.name} (Tally: ${link.company.tallyCompanyName})` });
    const existing = await ExpenseTransaction.findOne({ where: { idempotencyKey: `${app.code}:${result.value.sourceTransactionId}` }, attributes: ['uuid'] });
    checks.push(existing ? { name: 'Duplicate', status: 'WARN', message: 'This source transaction was already received' } : { name: 'Duplicate', status: 'PASS', message: 'New transaction' });
  }
  return { mappingIssues, ok: result.ok && mappingIssues.length === 0 && checks.every((c) => c.status !== 'FAIL'), normalized: result.value, errors: result.errors, warnings: result.warnings, trace: result.trace, checks };
}

export async function manualImport(ctx: AuthContext, uuid: string, payload: unknown, req: Request) {
  const app = await scopedApp(ctx, uuid);
  const outcome = await ingest(app, payload, { source: 'MANUAL', authResult: 'USER', ip: req.ip ?? null, userId: ctx.user.id, rawSize: Buffer.byteLength(JSON.stringify(payload ?? null)), headers: { 'user-agent': req.header('user-agent') ?? '' } });
  return outcome;
}

/** Pulls items from the configured Kissflow API endpoint and ingests each. */
export async function syncFromApi(ctx: AuthContext, uuid: string, req: Request) {
  const app = await scopedApp(ctx, uuid);
  if (app.integrationMode !== 'API' || !app.apiEndpoint) throw ApiError.badRequest('This application is not configured for API retrieval');
  if (app.status !== 'ACTIVE') throw ApiError.badRequest('Activate the application before syncing');
  const res = await kissflowGet(app, app.apiEndpoint);
  if (res.status === 401 || res.status === 403) throw new ApiError(502, 'SOURCE_AUTH_FAILED', `Kissflow rejected the credentials (HTTP ${res.status})`);
  if (res.status < 200 || res.status >= 300) throw new ApiError(502, 'SOURCE_ERROR', `Kissflow answered HTTP ${res.status}`);
  const body = res.data as unknown;
  const list = Array.isArray(body) ? body : ((body as Record<string, unknown>)?.Data ?? (body as Record<string, unknown>)?.data ?? (body as Record<string, unknown>)?.items);
  if (!Array.isArray(list)) throw new ApiError(502, 'SOURCE_FORMAT', 'Expected an array (or Data/data/items) in the Kissflow response');
  const items = list.slice(0, 200);
  const summary = { fetched: list.length, processed: items.length, accepted: 0, duplicate: 0, rejected: 0, failed: 0 };
  for (const item of items) {
    const o = await ingest(app, item, { source: 'API', authResult: 'VALID', ip: null, userId: ctx.user.id, rawSize: Buffer.byteLength(JSON.stringify(item ?? null)) });
    if (o.status === 'ACCEPTED') summary.accepted++;
    else if (o.status === 'DUPLICATE') summary.duplicate++;
    else if (o.status === 'REJECTED') summary.rejected++;
    else summary.failed++;
  }
  await app.update({ lastRequestAt: new Date() });
  await audit({ action: 'APPLICATION_API_SYNC', userId: ctx.user.id, entityType: 'application', entityUuid: app.uuid, applicationId: app.id, metadata: summary }, req);
  return summary;
}

export async function listReceipts(ctx: AuthContext, uuid: string, q: ListQuery & z.infer<typeof receiptListSchema>) {
  const app = await scopedApp(ctx, uuid);
  const search = q.search ? `%${q.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const where: WhereOptions<WebhookReceipt> = {
    applicationId: app.id,
    ...(q.status !== 'all' ? { status: q.status } : {}),
    ...(q.source !== 'all' ? { source: q.source } : {}),
    ...(search ? { [Op.or]: [{ sourceTransactionId: { [Op.like]: search } }, { errorCode: { [Op.like]: search } }] } : {}),
  };
  const { rows, count } = await WebhookReceipt.findAndCountAll({
    where,
    attributes: { exclude: ['payload', 'normalized'] },
    order: [['createdAt', 'DESC'], ['id', 'DESC']],
    limit: q.pageSize,
    offset: (q.page - 1) * q.pageSize,
    include: [{ model: ExpenseTransaction, as: 'expense', attributes: ['uuid'] }],
  });
  return {
    items: rows.map((r) => ({
      id: r.uuid,
      source: r.source,
      status: r.status,
      httpStatus: r.httpStatus,
      authResult: r.authResult,
      errorCode: r.errorCode,
      errorMessage: r.errorMessage,
      sourceTransactionId: r.sourceTransactionId,
      payloadSize: r.payloadSize,
      ipAddress: r.ipAddress,
      durationMs: r.durationMs,
      expenseId: (r as WebhookReceipt & { expense?: ExpenseTransaction }).expense?.uuid ?? null,
      createdAt: iso(r.createdAt),
    })),
    meta: pageMeta(q, count),
  };
}

export async function getReceipt(ctx: AuthContext, uuid: string, receiptUuid: string) {
  const app = await scopedApp(ctx, uuid);
  const r = await WebhookReceipt.findOne({ where: { uuid: receiptUuid, applicationId: app.id }, include: [{ model: ExpenseTransaction, as: 'expense', attributes: ['uuid'] }] });
  if (!r) throw ApiError.notFound('Receipt not found');
  let payload: unknown = null;
  if (r.payload) {
    try {
      payload = JSON.parse(r.payload);
    } catch {
      payload = r.payload;
    }
  }
  return {
    id: r.uuid,
    source: r.source,
    status: r.status,
    httpStatus: r.httpStatus,
    authResult: r.authResult,
    errorCode: r.errorCode,
    errorMessage: r.errorMessage,
    errorDetails: r.errorDetails,
    sourceTransactionId: r.sourceTransactionId,
    idempotencyKey: r.idempotencyKey,
    payloadHash: r.payloadHash,
    payloadSize: num(r.payloadSize),
    payload,
    normalized: r.normalized,
    requestHeaders: r.requestHeaders,
    ipAddress: r.ipAddress,
    durationMs: r.durationMs,
    expenseId: (r as WebhookReceipt & { expense?: ExpenseTransaction }).expense?.uuid ?? null,
    createdAt: iso(r.createdAt),
  };
}
