import { UniqueConstraintError } from 'sequelize';
import { logger } from '../config/logger';
import { normalize, redactPayload, stableStringify, type FieldMapping, type NormalizedExpense, type Transform } from '../domain/mapping';
import {
  type Application,
  ApplicationCompany,
  AuditLog,
  Company,
  ExpenseItem,
  ExpenseTransaction,
  ProcessingJob,
  sequelize,
  SourceFieldMapping,
  SystemSetting,
  WebhookReceipt,
} from '../models';
import { sha256 } from '../utils/crypto';

export type IntakeSource = 'WEBHOOK' | 'API' | 'MANUAL';
export type AuthResult = 'VALID' | 'INVALID' | 'MISSING' | 'NOT_REQUIRED' | 'USER';

export interface IntakeMeta {
  source: IntakeSource;
  authResult: AuthResult;
  ip?: string | null;
  headers?: Record<string, string>;
  userId?: number | null;
  rawSize?: number;
  startedAt?: number;
}

export interface IntakeOutcome {
  httpStatus: number;
  status: 'ACCEPTED' | 'DUPLICATE' | 'REJECTED' | 'FAILED';
  code?: string;
  message: string;
  details?: unknown;
  receiptId?: string;
  expenseId?: string;
  jobId?: string;
  warnings?: { field: string; message: string }[];
}

const MAX_STORED_PAYLOAD = 2 * 1024 * 1024;

export async function loadMappings(applicationId: number): Promise<FieldMapping[]> {
  const rows = await SourceFieldMapping.findAll({ where: { applicationId }, order: [['sortOrder', 'ASC']] });
  return rows.map((r) => ({ targetField: r.targetField, sourcePath: r.sourcePath, transform: (r.transform as Transform | null) ?? null, defaultValue: r.defaultValue, isRequired: r.isRequired }));
}

/** Resolves the payload's company key to an active company connected to the application. */
export type CompanyResolution = { ok: true; company: Company } | { ok: false; error: { code: string; message: string } };

export async function resolveCompanyLink(applicationId: number, companyKey: string): Promise<CompanyResolution> {
  const fail = (code: string, message: string): CompanyResolution => ({ ok: false, error: { code, message } });
  const link = await ApplicationCompany.findOne({ where: { applicationId, sourceCompanyKey: companyKey.trim() } });
  if (!link) return fail('COMPANY_NOT_MAPPED', `Company key "${companyKey}" is not connected to this application`);
  if (!link.isActive) return fail('COMPANY_LINK_INACTIVE', `The connection for company key "${companyKey}" is inactive`);
  const company = await Company.findByPk(link.companyId);
  if (!company) return fail('COMPANY_NOT_FOUND', 'The connected company no longer exists');
  if (!company.isActive) return fail('COMPANY_INACTIVE', `Company ${company.name} is inactive`);
  return { ok: true, company };
}

async function maxAttempts() {
  const s = await SystemSetting.findOne({ where: { settingKey: 'queue.max_attempts' } });
  const n = Number(s?.value);
  return Number.isInteger(n) && n > 0 ? n : 5;
}

async function recordReceipt(
  app: Application,
  meta: IntakeMeta,
  outcome: IntakeOutcome,
  extra: { payloadText?: string | null; payloadHash?: string | null; sourceTransactionId?: string | null; idempotencyKey?: string | null; normalized?: unknown; expenseId?: number | null },
) {
  try {
    const receipt = await WebhookReceipt.create({
      applicationId: app.id,
      source: meta.source,
      status: outcome.status,
      httpStatus: outcome.httpStatus,
      authResult: meta.authResult,
      errorCode: outcome.code ?? null,
      errorMessage: outcome.status === 'ACCEPTED' ? null : outcome.message.slice(0, 2000),
      errorDetails: outcome.details ?? (outcome.warnings?.length ? { warnings: outcome.warnings } : null),
      sourceTransactionId: extra.sourceTransactionId?.slice(0, 150) ?? null,
      idempotencyKey: extra.idempotencyKey ?? null,
      payloadHash: extra.payloadHash ?? null,
      payloadSize: meta.rawSize ?? null,
      payload: extra.payloadText && extra.payloadText.length <= MAX_STORED_PAYLOAD ? extra.payloadText : null,
      normalized: extra.normalized ?? null,
      requestHeaders: meta.headers ?? null,
      ipAddress: meta.ip ?? null,
      expenseId: extra.expenseId ?? null,
      triggeredBy: meta.userId ?? null,
      durationMs: meta.startedAt ? Date.now() - meta.startedAt : null,
    });
    outcome.receiptId = receipt.uuid;
  } catch (err) {
    logger.error('Failed to record intake receipt', { application: app.code, error: (err as Error).message });
  }
  return outcome;
}

/** Records a request that never reached normalization (auth failure, bad JSON, inactive app). */
export function rejectIntake(app: Application, meta: IntakeMeta, httpStatus: number, code: string, message: string, payloadText?: string | null) {
  return recordReceipt(app, meta, { httpStatus, status: 'REJECTED', code, message }, { payloadText: meta.authResult === 'VALID' || meta.authResult === 'USER' ? payloadText : null });
}

/**
 * Persists one source transaction and its processing job. Never talks to Tally.
 * Same source id + same content = idempotent duplicate; changed content = 409.
 */
export async function ingest(app: Application, payload: unknown, meta: IntakeMeta): Promise<IntakeOutcome> {
  const started = meta.startedAt ?? Date.now();
  meta.startedAt = started;
  const payloadHash = sha256(stableStringify(payload));
  const redacted = redactPayload(payload);
  const payloadText = JSON.stringify(redacted);
  const reject = (httpStatus: number, code: string, message: string, details?: unknown, normalized?: unknown) =>
    recordReceipt(app, meta, { httpStatus, status: 'REJECTED', code, message, details }, { payloadText, payloadHash, normalized });

  if (app.status === 'INACTIVE' || (app.status === 'DRAFT' && meta.source !== 'MANUAL')) {
    return reject(403, 'APPLICATION_INACTIVE', `Application ${app.code} is ${app.status.toLowerCase()}; activate it to accept transactions`);
  }

  const mappings = await loadMappings(app.id);
  if (!mappings.length) return reject(422, 'MAPPING_NOT_CONFIGURED', 'No field mapping is configured for this application');

  const result = normalize(payload, mappings);
  if (!result.ok || !result.value) return reject(422, 'NORMALIZATION_FAILED', result.errors.map((e) => e.message).join('; '), { errors: result.errors, warnings: result.warnings });
  const value: NormalizedExpense = result.value;

  const idempotencyKey = `${app.code}:${value.sourceTransactionId}`;
  const base = { payloadText, payloadHash, sourceTransactionId: value.sourceTransactionId, idempotencyKey, normalized: value };

  if (value.approvalStatus !== 'APPROVED') {
    return recordReceipt(app, meta, { httpStatus: 422, status: 'REJECTED', code: 'NOT_APPROVED', message: `Item is ${value.approvalStatus.toLowerCase()} in the source application; only approved items are accepted` }, base);
  }

  const resolved = await resolveCompanyLink(app.id, value.companyKey);
  if (!resolved.ok) return recordReceipt(app, meta, { httpStatus: 422, status: 'REJECTED', code: resolved.error.code, message: resolved.error.message }, base);
  const company = resolved.company;

  const warnings = [...result.warnings];
  const currency = value.currency ?? company.defaultCurrency;
  if (currency !== company.defaultCurrency) warnings.push({ field: 'currency', message: `Currency ${currency} differs from company currency ${company.defaultCurrency}` });

  const duplicateOf = async () => {
    const existing = await ExpenseTransaction.findOne({ where: { idempotencyKey } });
    if (!existing) return null;
    if (existing.payloadHash === payloadHash) {
      return recordReceipt(app, meta, { httpStatus: 200, status: 'DUPLICATE', code: 'DUPLICATE', message: 'Already received; no changes made', expenseId: existing.uuid }, { ...base, expenseId: existing.id });
    }
    return recordReceipt(
      app,
      meta,
      { httpStatus: 409, status: 'REJECTED', code: 'PAYLOAD_CONFLICT', message: `Transaction ${value.sourceTransactionId} was already received with different content. Corrections must be handled in Tally Monitor, not by resending.`, expenseId: existing.uuid },
      { ...base, expenseId: existing.id },
    );
  };

  const dup = await duplicateOf();
  if (dup) return dup;

  const attempts = await maxAttempts();
  try {
    const { expense, job } = await sequelize.transaction(async (transaction) => {
      const expense = await ExpenseTransaction.create(
        {
          applicationId: app.id,
          companyId: company.id,
          sourceTransactionId: value.sourceTransactionId,
          kissflowRequestId: value.sourceTransactionId,
          requestNumber: value.requestNumber,
          idempotencyKey,
          payloadHash,
          expenseDate: value.expenseDate,
          employeeCode: value.employeeCode,
          employeeName: value.employeeName,
          vendorName: value.vendorName,
          expenseCategory: value.expenseCategory ?? value.lineItems[0]?.category ?? null,
          description: value.description,
          amount: value.amount,
          taxAmount: value.taxAmount,
          currency,
          costCentre: value.costCentre,
          voucherKind: app.defaultVoucherKind,
          approvalStatus: 'APPROVED',
          processingStatus: 'RECEIVED',
          supportingDocuments: value.supportingDocuments,
          originalPayload: redacted,
          normalizedPayload: { ...value, currency },
          validationResults: { intake: { source: meta.source, receivedAt: new Date().toISOString(), warnings } },
        },
        { transaction },
      );
      await ExpenseItem.bulkCreate(
        value.lineItems.map((l) => ({
          expenseId: expense.id,
          lineNo: l.lineNo,
          category: l.category ?? 'Uncategorised',
          description: l.description,
          amount: l.amount,
          taxAmount: l.taxAmount,
          costCentre: l.costCentre,
          resolvedLedgerName: null,
        })),
        { transaction },
      );
      const job = await ProcessingJob.create(
        {
          expenseId: expense.id,
          companyId: company.id,
          applicationId: app.id,
          voucherConfigurationId: null,
          idempotencyKey: `${company.code}:${idempotencyKey}`,
          status: 'RECEIVED',
          maxAttempts: attempts,
          nextRetryAt: null,
          lastAttemptAt: null,
          lockedByAgentId: null,
          lockedAt: null,
          lockExpiresAt: null,
          heartbeatAt: null,
          submissionStartedAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
          voucherPayload: null,
          approvedBy: null,
          approvedAt: null,
          rejectedBy: null,
          rejectedAt: null,
          rejectionReason: null,
        },
        { transaction },
      );
      await AuditLog.create(
        {
          actorType: meta.source === 'MANUAL' ? 'USER' : 'WEBHOOK',
          userId: meta.userId ?? null,
          agentId: null,
          action: 'EXPENSE_RECEIVED',
          entityType: 'expense',
          entityUuid: expense.uuid,
          companyId: company.id,
          applicationId: app.id,
          expenseId: expense.id,
          jobId: job.id,
          previousStatus: null,
          newStatus: 'RECEIVED',
          requestRef: value.requestNumber ?? value.sourceTransactionId,
          responseRef: null,
          ipAddress: meta.ip ?? null,
          userAgent: meta.headers?.['user-agent'] ?? null,
          metadata: { source: meta.source, amount: value.amount, currency, lines: value.lineItems.length },
        },
        { transaction },
      );
      await app.update({ lastRequestAt: new Date(), lastSuccessAt: new Date() }, { transaction });
      return { expense, job };
    });

    return recordReceipt(
      app,
      meta,
      { httpStatus: 202, status: 'ACCEPTED', message: 'Accepted for processing', expenseId: expense.uuid, jobId: job.uuid, warnings },
      { ...base, expenseId: expense.id, normalized: { ...value, currency } },
    );
  } catch (err) {
    // A concurrent delivery of the same item won the insert race.
    if (err instanceof UniqueConstraintError) {
      const again = await duplicateOf();
      if (again) return again;
    }
    logger.error('Intake failed', { application: app.code, error: (err as Error).message });
    return recordReceipt(app, meta, { httpStatus: 500, status: 'FAILED', code: 'INTAKE_FAILED', message: 'The transaction could not be stored. It is safe to retry.' }, base);
  }
}
