import type { Request } from 'express';
import { Op } from 'sequelize';
import { assertTransition, type JobStatus } from '../domain/jobStatus';
import { buildVoucher, type EngineInput, type LedgerRule, type VoucherConfigInput, type VoucherDraft } from '../domain/voucherEngine';
import { Application, AuditLog, Company, ExpenseItem, ExpenseTransaction, LedgerMapping, LedgerMaster, ProcessingJob, sequelize, VoucherConfiguration, VoucherMapping } from '../models';
import { ApiError } from '../utils/http';
import type { AuthContext } from './auth/authContext';
import { assertCompanyAccess, resolveCompany } from './common';
import { ensureMasterRequest } from './ledgers.service';

const VALIDATABLE: JobStatus[] = ['RECEIVED', 'VALIDATION_FAILED', 'MAPPING_REQUIRED', 'MASTER_CREATION_REQUIRED', 'AWAITING_APPROVAL', 'READY_TO_POST', 'RETRY_PENDING', 'FAILED'];
const BLOCKED: JobStatus[] = ['RECEIVED', 'VALIDATION_FAILED', 'MAPPING_REQUIRED', 'MASTER_CREATION_REQUIRED'];

const asRule = (v: unknown) => (v ? ((typeof v === 'string' ? JSON.parse(v) : v) as LedgerRule) : null);

function toConfigInput(c: VoucherConfiguration): VoucherConfigInput {
  return {
    id: c.uuid,
    voucherKind: c.voucherKind,
    tallyVoucherTypeName: c.tallyVoucherTypeName,
    numberingMode: c.numberingMode,
    numberingTemplate: c.numberingTemplate,
    debitLedgerRule: asRule(c.debitLedgerRule),
    creditLedgerRule: asRule(c.creditLedgerRule),
    partyLedgerRule: asRule(c.partyLedgerRule),
    taxLedgerRule: asRule(c.taxLedgerRule),
    narrationTemplate: c.narrationTemplate,
    referenceTemplate: c.referenceTemplate,
    costCentreEnabled: c.costCentreEnabled,
    billAllocationEnabled: c.billAllocationEnabled,
    approvalPolicy: c.approvalPolicy,
    approvalThreshold: c.approvalThreshold,
    isActive: c.isActive,
  };
}

/** Category rule → application rule → company config for the application's default voucher kind. */
async function resolveConfig(companyId: number, app: Application, categories: string[]) {
  const rules = await VoucherMapping.findAll({ where: { companyId, applicationId: app.id, isActive: true }, order: [['priority', 'ASC']] });
  const lower = categories.map((c) => c.toLowerCase());
  const byCategory = rules.find((r) => r.expenseCategory && lower.includes(r.expenseCategory.toLowerCase()));
  const fallback = rules.find((r) => !r.expenseCategory);
  const rule = byCategory ?? fallback;
  if (rule) {
    const cfg = await VoucherConfiguration.findByPk(rule.voucherConfigurationId);
    if (cfg) return { config: cfg, source: byCategory ? `Rule for ${app.name} / ${rule.expenseCategory}` : `Rule for ${app.name}` };
  }
  if (app.defaultVoucherKind) {
    const cfg = await VoucherConfiguration.findOne({ where: { companyId, voucherKind: app.defaultVoucherKind, isActive: true }, order: [['id', 'ASC']] });
    if (cfg) return { config: cfg, source: `${app.name} default voucher type (${app.defaultVoucherKind})` };
  }
  return { config: null, source: app.defaultVoucherKind ? `No active ${app.defaultVoucherKind} configuration` : 'No voucher rule or default voucher type' };
}

async function loadContext(expense: ExpenseTransaction) {
  const [app, company, items] = await Promise.all([
    Application.unscoped().findByPk(expense.applicationId),
    Company.findByPk(expense.companyId),
    ExpenseItem.findAll({ where: { expenseId: expense.id }, order: [['lineNo', 'ASC']] }),
  ]);
  if (!app || !company) throw ApiError.notFound('Expense references a missing application or company');
  const categories = [...new Set(items.map((i) => i.category).concat(expense.expenseCategory ? [expense.expenseCategory] : []))];
  const [{ config, source }, mappings, ledgers] = await Promise.all([
    resolveConfig(company.id, app, categories),
    LedgerMapping.findAll({ where: { companyId: company.id, isActive: true, [Op.or]: [{ applicationId: app.id }, { applicationId: null }] } }),
    LedgerMaster.findAll({ where: { companyId: company.id, isActive: true }, attributes: ['name'] }),
  ]);
  const input: EngineInput = {
    expense: {
      sourceTransactionId: expense.sourceTransactionId,
      requestNumber: expense.requestNumber,
      expenseDate: expense.expenseDate,
      employeeName: expense.employeeName,
      employeeCode: expense.employeeCode,
      vendorName: expense.vendorName,
      description: expense.description,
      category: expense.expenseCategory,
      amount: expense.amount,
      taxAmount: expense.taxAmount,
      currency: expense.currency,
      costCentre: expense.costCentre,
    },
    lines: items.map((i) => ({ lineNo: i.lineNo, category: i.category, description: i.description, amount: i.amount, taxAmount: i.taxAmount, costCentre: i.costCentre })),
    application: { name: app.name, code: app.code },
    company: { code: company.code, name: company.name, defaultCurrency: company.defaultCurrency },
    config: config ? toConfigInput(config) : null,
    ledgerMappings: mappings.map((m) => ({ applicationScoped: m.applicationId !== null, sourceCategory: m.sourceCategory, tallyLedgerName: m.tallyLedgerName, costCentre: m.costCentre })),
    ledgerNames: ledgers.map((l) => l.name),
  };
  return { app, company, items, config, configSource: source, input, mappings };
}

async function expenseByUuid(ctx: AuthContext, uuid: string) {
  const expense = await ExpenseTransaction.findOne({ where: { uuid } });
  if (!expense) throw ApiError.notFound('Expense not found');
  assertCompanyAccess(ctx, expense.companyId);
  return expense;
}

function present(draft: VoucherDraft, extra: { configSource: string; configId: string | null; currency: string; companyName: string; tallyCompanyName: string }) {
  return { ...draft, ...extra };
}

export async function previewVoucher(ctx: AuthContext, uuid: string) {
  const expense = await expenseByUuid(ctx, uuid);
  const c = await loadContext(expense);
  const draft = buildVoucher(c.input);
  const job = await ProcessingJob.findOne({ where: { expenseId: expense.id }, order: [['createdAt', 'DESC']], attributes: ['uuid', 'status'] });
  return {
    ...present(draft, { configSource: c.configSource, configId: c.config?.uuid ?? null, currency: expense.currency, companyName: c.company.name, tallyCompanyName: c.company.tallyCompanyName }),
    job: job ? { id: job.uuid, status: job.status, canValidate: VALIDATABLE.includes(job.status) } : null,
  };
}

function outcomeStatus(draft: VoucherDraft): JobStatus {
  if (draft.outcome !== 'OK') return draft.outcome;
  return draft.approvalRequired ? 'AWAITING_APPROVAL' : 'READY_TO_POST';
}

/** Validates the expense's accounting and moves its job through the state machine. */
export async function validateExpense(ctx: AuthContext | null, expenseId: number, req?: Request) {
  const expense = await ExpenseTransaction.findByPk(expenseId);
  if (!expense) throw ApiError.notFound('Expense not found');
  if (ctx) assertCompanyAccess(ctx, expense.companyId);
  const c = await loadContext(expense);
  const draft = buildVoucher(c.input);
  const next = outcomeStatus(draft);
  const lineLedgers = new Map<number, string | null>();
  for (const line of c.input.lines) {
    if (c.config && asRule(c.config.debitLedgerRule)?.source === 'FIXED') lineLedgers.set(line.lineNo, (asRule(c.config.debitLedgerRule) as { ledger: string }).ledger);
    else {
      const cands = c.mappings.filter((m) => line.category && m.sourceCategory.toLowerCase() === line.category.toLowerCase());
      lineLedgers.set(line.lineNo, (cands.find((m) => m.applicationId !== null) ?? cands[0])?.tallyLedgerName ?? null);
    }
  }

  return sequelize.transaction(async (transaction) => {
    const job = await ProcessingJob.findOne({ where: { expenseId: expense.id }, order: [['createdAt', 'DESC']], lock: transaction.LOCK.UPDATE, transaction });
    if (!job) throw ApiError.conflict('This expense has no processing job', 'NO_JOB');
    const previous = job.status;
    if (!VALIDATABLE.includes(previous)) throw new ApiError(409, 'INVALID_STATUS_TRANSITION', `A job in ${previous.toLowerCase().replace(/_/g, ' ')} cannot be revalidated`);
    assertTransition(previous, 'VALIDATING');
    assertTransition('VALIDATING', next);

    const firstError = draft.issues.find((i) => i.severity === 'error');
    await job.update(
      {
        status: next,
        voucherConfigurationId: c.config?.id ?? null,
        voucherPayload: draft,
        lastErrorCode: firstError?.code ?? null,
        lastErrorMessage: firstError ? draft.issues.filter((i) => i.severity === 'error').map((i) => i.message).join('; ').slice(0, 2000) : null,
        // A changed voucher must be approved again.
        approvedBy: null,
        approvedAt: null,
        approvedVoucherHash: null,
        approvalNotes: null,
        isDeadLetter: false,
      },
      { transaction },
    );
    const validation = (expense.validationResults ?? {}) as Record<string, unknown>;
    await expense.update(
      {
        processingStatus: next,
        voucherKind: (draft.voucherKind as ExpenseTransaction['voucherKind']) ?? expense.voucherKind,
        validationResults: {
          ...validation,
          accounting: { validatedAt: new Date().toISOString(), validatedBy: ctx?.user.fullName ?? 'system', outcome: draft.outcome, configSource: c.configSource, issues: draft.issues, requiredMasters: draft.requiredMasters, balanced: draft.balanced },
        },
      },
      { transaction },
    );
    for (const item of c.items) await item.update({ resolvedLedgerName: lineLedgers.get(item.lineNo) ?? null }, { transaction });

    const requests: string[] = [];
    for (const m of draft.requiredMasters) {
      const { request, created } = await ensureMasterRequest(
        expense.companyId,
        { masterType: m.masterType, proposedName: m.name, proposedParent: m.proposedParent, sourceValue: m.category ?? null, details: { reason: m.reason, raisedBy: 'validation' }, jobId: job.id, requestedBy: null },
        transaction,
      );
      if (created) requests.push(request.uuid);
    }

    await AuditLog.create(
      {
        actorType: ctx ? 'USER' : 'SYSTEM',
        userId: ctx?.user.id ?? null,
        agentId: null,
        action: 'EXPENSE_VALIDATED',
        entityType: 'job',
        entityUuid: job.uuid,
        companyId: expense.companyId,
        applicationId: expense.applicationId,
        expenseId: expense.id,
        jobId: job.id,
        previousStatus: previous,
        newStatus: next,
        requestRef: expense.requestNumber ?? expense.sourceTransactionId,
        responseRef: null,
        ipAddress: req?.ip ?? null,
        userAgent: req?.header('user-agent')?.slice(0, 500) ?? null,
        metadata: { outcome: draft.outcome, issues: draft.issues.map((i) => i.code), masterRequests: requests.length, balanced: draft.balanced, total: draft.totalDebit },
      },
      { transaction },
    );
    return { expenseId: expense.uuid, jobId: job.uuid, previousStatus: previous, status: next, outcome: draft.outcome, issues: draft.issues, masterRequestsCreated: requests.length };
  });
}

export async function validateExpenseByUuid(ctx: AuthContext, uuid: string, req: Request) {
  const expense = await expenseByUuid(ctx, uuid);
  return validateExpense(ctx, expense.id, req);
}

/** Revalidates every blocked job for a company, e.g. after mappings or ledgers change. */
export async function revalidateCompany(ctx: AuthContext, companyUuid: string, req: Request) {
  const company = await resolveCompany(ctx, companyUuid);
  const jobs = await ProcessingJob.findAll({ where: { companyId: company.id, status: { [Op.in]: BLOCKED } }, attributes: ['expenseId'], order: [['createdAt', 'ASC']], limit: 500 });
  const summary: Record<string, number> = { processed: 0, failed: 0 };
  for (const j of jobs) {
    try {
      const r = await validateExpense(ctx, j.expenseId, req);
      summary[r.status] = (summary[r.status] ?? 0) + 1;
      summary.processed!++;
    } catch {
      summary.failed!++;
    }
  }
  return { company: company.name, candidates: jobs.length, ...summary };
}
