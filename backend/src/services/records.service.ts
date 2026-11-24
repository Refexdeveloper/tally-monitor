import { z } from 'zod';
import { JOB_STATUSES } from '../domain/jobStatus';
import { companyScope } from './access';
import type { AuthContext } from './auth/authContext';
import { ApiError } from '../utils/http';
import { iso, likePattern, num, orderBy, pageMeta, select, type ListQuery } from './common';

/** Read-only, company-scoped listings shared by detail pages (full modules arrive in Phases 3 and 5). */

export const recordFilterSchema = z.object({
  companyId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
  status: z.enum(JOB_STATUSES).optional(),
});

const dateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const amountParam = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Invalid amount');

export const expenseFilterSchema = recordFilterSchema.extend({
  dateFrom: dateParam.optional(),
  dateTo: dateParam.optional(),
  amountMin: amountParam.optional(),
  amountMax: amountParam.optional(),
  category: z.string().max(150).optional(),
  approvalStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  voucherKind: z.enum(['PAYMENT', 'JOURNAL', 'RECEIPT', 'CONTRA', 'PURCHASE', 'SALES', 'CREDIT_NOTE', 'DEBIT_NOTE']).optional(),
});

export const auditFilterSchema = z.object({
  companyId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
  entityType: z.string().max(64).optional(),
  entityId: z.string().uuid().optional(),
  action: z.string().max(100).optional(),
  actorType: z.enum(['USER', 'SYSTEM', 'AGENT', 'WEBHOOK']).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function auditActions(ctx: AuthContext) {
  const scope = ctx.companyIds === 'ALL' ? { sql: '1=1', replacements: {} } : companyScope(ctx, 'al.company_id');
  const rows = await select(`SELECT DISTINCT al.action FROM audit_logs al WHERE ${scope.sql} ORDER BY al.action LIMIT 300`, scope.replacements);
  return rows.map((r) => String(r.action));
}

function filters(ctx: AuthContext, alias: string, q: z.infer<typeof recordFilterSchema>) {
  const scope = companyScope(ctx, `${alias}.company_id`);
  const where = [scope.sql];
  const repl: Record<string, unknown> = { ...scope.replacements };
  if (q.companyId) {
    where.push(`${alias}.company_id = (SELECT id FROM companies WHERE uuid = :companyUuid)`);
    repl.companyUuid = q.companyId;
  }
  if (q.applicationId) {
    where.push(`${alias}.application_id = (SELECT id FROM applications WHERE uuid = :applicationUuid)`);
    repl.applicationUuid = q.applicationId;
  }
  return { where, repl };
}

export async function listExpenses(ctx: AuthContext, q: ListQuery & z.infer<typeof expenseFilterSchema>) {
  const { where, repl } = filters(ctx, 'e', q);
  if (q.status) {
    where.push('e.processing_status = :status');
    repl.status = q.status;
  }
  const extra: [keyof typeof q, string][] = [
    ['dateFrom', 'e.expense_date >= :dateFrom'],
    ['dateTo', 'e.expense_date <= :dateTo'],
    ['amountMin', 'e.amount >= :amountMin'],
    ['amountMax', 'e.amount <= :amountMax'],
    ['category', 'e.expense_category = :category'],
    ['approvalStatus', 'e.approval_status = :approvalStatus'],
    ['voucherKind', 'e.voucher_kind = :voucherKind'],
  ];
  for (const [key, sql] of extra) {
    if (q[key] !== undefined) {
      where.push(sql);
      repl[key] = q[key];
    }
  }
  if (q.search) {
    where.push('(e.request_number LIKE :s OR e.source_transaction_id LIKE :s OR e.employee_name LIKE :s OR e.vendor_name LIKE :s OR e.expense_category LIKE :s)');
    repl.s = likePattern(q.search);
  }
  const whereSql = where.join(' AND ');
  const sort = orderBy(q, { receivedAt: 'e.received_at', expenseDate: 'e.expense_date', amount: 'e.amount' }, 'receivedAt');
  const [rows, count] = await Promise.all([
    select(
      `SELECT e.uuid, e.request_number, e.source_transaction_id, e.expense_date, e.employee_name, e.vendor_name, e.expense_category,
              e.amount, e.currency, e.approval_status, e.processing_status, e.received_at, e.voucher_kind, e.kissflow_request_id, e.created_at,
              a.uuid AS app_uuid, a.name AS app_name, c.uuid AS company_uuid, c.name AS company_name,
              (SELECT pv.voucher_number FROM posted_vouchers pv JOIN processing_jobs j ON j.id = pv.job_id WHERE j.expense_id = e.id AND pv.verification_status = 'VERIFIED' LIMIT 1) AS voucher_number
       FROM expense_transactions e JOIN applications a ON a.id = e.application_id JOIN companies c ON c.id = e.company_id
       WHERE ${whereSql} ORDER BY ${sort} LIMIT :limit OFFSET :offset`,
      { ...repl, limit: q.pageSize, offset: (q.page - 1) * q.pageSize },
    ),
    select(`SELECT COUNT(*) AS n FROM expense_transactions e WHERE ${whereSql}`, repl),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.uuid,
      requestNumber: r.request_number,
      sourceTransactionId: r.source_transaction_id,
      expenseDate: r.expense_date,
      party: r.employee_name ?? r.vendor_name,
      category: r.expense_category,
      amount: String(r.amount),
      currency: r.currency,
      approvalStatus: r.approval_status,
      status: r.processing_status,
      voucherNumber: r.voucher_number,
      voucherKind: r.voucher_kind,
      kissflowRequestId: r.kissflow_request_id,
      receivedAt: iso(r.received_at),
      createdAt: iso(r.created_at),
      application: { id: r.app_uuid, name: r.app_name },
      company: { id: r.company_uuid, name: r.company_name },
    })),
    meta: pageMeta(q, num(count[0]?.n)),
  };
}

/** Distinct categories for the expense filter, scoped to the user's companies. */
export async function expenseCategories(ctx: AuthContext) {
  const scope = companyScope(ctx, 'e.company_id');
  const rows = await select(`SELECT DISTINCT e.expense_category AS c FROM expense_transactions e WHERE e.expense_category IS NOT NULL AND ${scope.sql} ORDER BY c LIMIT 200`, scope.replacements);
  return rows.map((r) => String(r.c));
}

const parseJson = (v: unknown) => (typeof v === 'string' ? (() => { try { return JSON.parse(v); } catch { return v; } })() : v);

export async function getExpense(ctx: AuthContext, uuid: string) {
  const scope = companyScope(ctx, 'e.company_id');
  const [e] = await select(
    `SELECT e.*, a.uuid AS app_uuid, a.name AS app_name, a.code AS app_code, a.integration_mode, a.color AS app_color, a.icon AS app_icon,
            c.uuid AS company_uuid, c.name AS company_name, c.code AS company_code, c.tally_company_name, c.default_currency
     FROM expense_transactions e JOIN applications a ON a.id = e.application_id JOIN companies c ON c.id = e.company_id
     WHERE e.uuid = :uuid AND ${scope.sql}`,
    { uuid, ...scope.replacements },
  );
  if (!e) throw ApiError.notFound('Expense not found');
  const id = e.id;

  const [items, jobs, attempts, responses, vouchers, receipts, timeline] = await Promise.all([
    select(
      `SELECT i.line_no, i.category, i.description, i.amount, i.tax_amount, i.cost_centre, i.resolved_ledger_name,
              (SELECT lm.tally_ledger_name FROM ledger_mappings lm WHERE lm.company_id = :companyId AND lm.is_active = 1 AND lm.source_category = i.category
                AND (lm.application_id = :appId OR lm.application_id IS NULL) ORDER BY lm.application_id IS NULL LIMIT 1) AS mapped_ledger,
              (SELECT COUNT(*) FROM ledger_masters m JOIN ledger_mappings lm2 ON lm2.tally_ledger_name = m.name AND lm2.company_id = m.company_id
                WHERE m.company_id = :companyId AND m.is_active = 1 AND lm2.source_category = i.category) AS ledger_exists
       FROM expense_items i WHERE i.expense_id = :id ORDER BY i.line_no`,
      { id, companyId: e.company_id, appId: e.application_id },
    ),
    select(
      `SELECT j.id, j.uuid, j.status, j.priority, j.attempts, j.max_attempts, j.is_paused, j.next_retry_at, j.last_attempt_at, j.last_error_code,
              j.last_error_message, j.is_dead_letter, j.approved_at, j.rejected_at, j.rejection_reason, j.created_at, j.updated_at,
              vc.tally_voucher_type_name AS voucher_type, ua.full_name AS approved_by_name
       FROM processing_jobs j LEFT JOIN voucher_configurations vc ON vc.id = j.voucher_configuration_id LEFT JOIN users ua ON ua.id = j.approved_by
       WHERE j.expense_id = :id ORDER BY j.created_at`,
      { id },
    ),
    select(
      `SELECT a.uuid, a.job_id, a.attempt_no, a.operation, a.from_status, a.to_status, a.outcome, a.error_code, a.error_message, a.started_at, a.finished_at, a.duration_ms
       FROM job_attempts a JOIN processing_jobs j ON j.id = a.job_id WHERE j.expense_id = :id ORDER BY a.started_at`,
      { id },
    ),
    select(
      `SELECT t.uuid, t.operation, t.http_status, t.created_count, t.altered_count, t.error_count, t.line_error, t.created_at, LEFT(t.response_body, 4000) AS response_excerpt
       FROM tally_responses t JOIN processing_jobs j ON j.id = t.job_id WHERE j.expense_id = :id ORDER BY t.created_at DESC LIMIT 20`,
      { id },
    ),
    select(
      `SELECT pv.uuid, pv.voucher_kind, pv.tally_voucher_type_name, pv.voucher_number, pv.voucher_date, pv.reference, pv.tally_master_id, pv.tally_alter_id,
              pv.tally_guid, pv.total_amount, pv.currency, pv.verification_status, pv.verified_at
       FROM posted_vouchers pv WHERE pv.expense_id = :id ORDER BY pv.created_at DESC`,
      { id },
    ),
    select(`SELECT r.uuid, r.source, r.status, r.http_status, r.error_code, r.created_at FROM webhook_receipts r WHERE r.expense_id = :id ORDER BY r.created_at DESC LIMIT 20`, { id }),
    select(
      `SELECT al.uuid, al.action, al.actor_type, al.previous_status, al.new_status, al.created_at, u.full_name AS user_name
       FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id WHERE al.expense_id = :id ORDER BY al.created_at, al.id`,
      { id },
    ),
  ]);

  const docs = parseJson(e.supporting_documents);
  return {
    id: e.uuid as string,
    sourceTransactionId: e.source_transaction_id,
    kissflowRequestId: e.kissflow_request_id,
    requestNumber: e.request_number,
    idempotencyKey: e.idempotency_key,
    payloadHash: e.payload_hash,
    expenseDate: e.expense_date,
    employeeCode: e.employee_code,
    employeeName: e.employee_name,
    vendorName: e.vendor_name,
    category: e.expense_category,
    description: e.description,
    amount: String(e.amount),
    taxAmount: String(e.tax_amount),
    currency: e.currency,
    costCentre: e.cost_centre,
    voucherKind: e.voucher_kind,
    approvalStatus: e.approval_status,
    status: e.processing_status,
    receivedAt: iso(e.received_at),
    updatedAt: iso(e.updated_at),
    supportingDocuments: Array.isArray(docs) ? docs : [],
    originalPayload: parseJson(e.original_payload),
    normalizedPayload: parseJson(e.normalized_payload),
    validationResults: parseJson(e.validation_results),
    application: { id: e.app_uuid, name: e.app_name, code: e.app_code, integrationMode: e.integration_mode, color: e.app_color, icon: e.app_icon },
    company: { id: e.company_uuid, name: e.company_name, code: e.company_code, tallyCompanyName: e.tally_company_name, defaultCurrency: e.default_currency },
    items: items.map((i) => ({
      lineNo: num(i.line_no),
      category: i.category,
      description: i.description,
      amount: String(i.amount),
      taxAmount: String(i.tax_amount),
      costCentre: i.cost_centre,
      ledger: i.resolved_ledger_name ?? i.mapped_ledger ?? null,
      ledgerStatus: i.resolved_ledger_name ? 'RESOLVED' : i.mapped_ledger ? (num(i.ledger_exists) ? 'MAPPED' : 'MASTER_MISSING') : 'UNMAPPED',
    })),
    jobs: jobs.map((j) => ({
      id: j.uuid,
      status: j.status,
      priority: num(j.priority),
      attempts: num(j.attempts),
      maxAttempts: num(j.max_attempts),
      isPaused: Boolean(j.is_paused),
      isDeadLetter: Boolean(j.is_dead_letter),
      nextRetryAt: iso(j.next_retry_at),
      lastAttemptAt: iso(j.last_attempt_at),
      errorCode: j.last_error_code,
      errorMessage: j.last_error_message,
      voucherType: j.voucher_type,
      approvedAt: iso(j.approved_at),
      approvedBy: j.approved_by_name,
      rejectedAt: iso(j.rejected_at),
      rejectionReason: j.rejection_reason,
      createdAt: iso(j.created_at),
      updatedAt: iso(j.updated_at),
      attempts_: attempts
        .filter((a) => a.job_id === j.id)
        .map((a) => ({
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
        })),
    })),
    tallyResponses: responses.map((t) => ({
      id: t.uuid,
      operation: t.operation,
      httpStatus: t.http_status === null ? null : num(t.http_status),
      created: num(t.created_count),
      altered: num(t.altered_count),
      errors: num(t.error_count),
      lineError: t.line_error,
      responseExcerpt: t.response_excerpt,
      createdAt: iso(t.created_at),
    })),
    postedVouchers: vouchers.map((v) => ({
      id: v.uuid,
      voucherKind: v.voucher_kind,
      voucherType: v.tally_voucher_type_name,
      voucherNumber: v.voucher_number,
      voucherDate: v.voucher_date,
      reference: v.reference,
      tallyMasterId: v.tally_master_id === null ? null : String(v.tally_master_id),
      tallyAlterId: v.tally_alter_id === null ? null : String(v.tally_alter_id),
      tallyGuid: v.tally_guid,
      amount: String(v.total_amount),
      currency: v.currency,
      verificationStatus: v.verification_status,
      verifiedAt: iso(v.verified_at),
    })),
    receipts: receipts.map((r) => ({ id: r.uuid, source: r.source, status: r.status, httpStatus: num(r.http_status), errorCode: r.error_code, createdAt: iso(r.created_at) })),
    timeline: timeline.map((t) => ({ id: t.uuid, action: t.action, actorType: t.actor_type, previousStatus: t.previous_status, newStatus: t.new_status, user: t.user_name, createdAt: iso(t.created_at) })),
  };
}

export const jobFilterSchema = recordFilterSchema.extend({
  paused: z.enum(['true', 'false']).optional(),
  deadLetter: z.enum(['true', 'false']).optional(),
  statusGroup: z.enum(['open', 'attention', 'all']).optional(),
});

export async function listJobs(ctx: AuthContext, q: ListQuery & z.infer<typeof jobFilterSchema>) {
  const { where, repl } = filters(ctx, 'j', q);
  if (q.status) {
    where.push('j.status = :status');
    repl.status = q.status;
  }
  if (q.paused) where.push(`j.is_paused = ${q.paused === 'true' ? 1 : 0}`);
  if (q.deadLetter) where.push(`j.is_dead_letter = ${q.deadLetter === 'true' ? 1 : 0}`);
  if (q.statusGroup === 'open') where.push("j.status NOT IN ('POSTED', 'CANCELLED')");
  if (q.statusGroup === 'attention') where.push("j.status IN ('VALIDATION_FAILED', 'MAPPING_REQUIRED', 'MASTER_CREATION_REQUIRED', 'FAILED', 'RECONCILIATION_REQUIRED')");
  if (q.search) {
    where.push('(e.request_number LIKE :s OR j.last_error_code LIKE :s)');
    repl.s = likePattern(q.search);
  }
  const whereSql = where.join(' AND ');
  const sort = orderBy(q, { createdAt: 'j.created_at', updatedAt: 'j.updated_at', priority: 'j.priority', attempts: 'j.attempts' }, 'createdAt');
  const [rows, count] = await Promise.all([
    select(
      `SELECT j.uuid, j.status, j.priority, j.attempts, j.max_attempts, j.is_paused, j.next_retry_at, j.last_attempt_at, j.last_error_code,
              j.last_error_message, j.created_at, e.uuid AS expense_uuid, e.request_number, e.amount, e.currency,
              a.name AS app_name, c.name AS company_name, vc.tally_voucher_type_name AS voucher_type
       FROM processing_jobs j JOIN expense_transactions e ON e.id = j.expense_id JOIN applications a ON a.id = j.application_id
       JOIN companies c ON c.id = j.company_id LEFT JOIN voucher_configurations vc ON vc.id = j.voucher_configuration_id
       WHERE ${whereSql} ORDER BY ${sort} LIMIT :limit OFFSET :offset`,
      { ...repl, limit: q.pageSize, offset: (q.page - 1) * q.pageSize },
    ),
    select(`SELECT COUNT(*) AS n FROM processing_jobs j JOIN expense_transactions e ON e.id = j.expense_id WHERE ${whereSql}`, repl),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.uuid,
      status: r.status,
      priority: num(r.priority),
      attempts: num(r.attempts),
      maxAttempts: num(r.max_attempts),
      isPaused: Boolean(r.is_paused),
      nextRetryAt: iso(r.next_retry_at),
      lastAttemptAt: iso(r.last_attempt_at),
      errorCode: r.last_error_code,
      errorMessage: r.last_error_message,
      createdAt: iso(r.created_at),
      expense: { id: r.expense_uuid, requestNumber: r.request_number, amount: String(r.amount), currency: r.currency },
      application: r.app_name,
      company: r.company_name,
      voucherType: r.voucher_type,
    })),
    meta: pageMeta(q, num(count[0]?.n)),
  };
}

export async function listAuditLogs(ctx: AuthContext, q: ListQuery & z.infer<typeof auditFilterSchema>) {
  // Platform-level events (no company) are only visible to users with access to every company.
  const scope = ctx.companyIds === 'ALL' ? { sql: '1=1', replacements: {} } : companyScope(ctx, 'al.company_id');
  const where = [scope.sql];
  const repl: Record<string, unknown> = { ...scope.replacements };
  if (q.companyId) {
    where.push('al.company_id = (SELECT id FROM companies WHERE uuid = :companyUuid)');
    repl.companyUuid = q.companyId;
  }
  if (q.applicationId) {
    where.push('al.application_id = (SELECT id FROM applications WHERE uuid = :applicationUuid)');
    repl.applicationUuid = q.applicationId;
  }
  if (q.entityType) {
    where.push('al.entity_type = :entityType');
    repl.entityType = q.entityType;
  }
  if (q.entityId) {
    where.push('al.entity_uuid = :entityId');
    repl.entityId = q.entityId;
  }
  if (q.action) {
    where.push('al.action = :action');
    repl.action = q.action;
  }
  if (q.actorType) {
    where.push('al.actor_type = :actorType');
    repl.actorType = q.actorType;
  }
  if (q.dateFrom) {
    where.push('al.created_at >= :dateFrom');
    repl.dateFrom = `${q.dateFrom} 00:00:00`;
  }
  if (q.dateTo) {
    where.push('al.created_at < DATE_ADD(:dateTo, INTERVAL 1 DAY)');
    repl.dateTo = q.dateTo;
  }
  if (q.search) {
    where.push('(al.action LIKE :s OR al.request_ref LIKE :s OR u.full_name LIKE :s)');
    repl.s = likePattern(q.search);
  }
  const whereSql = where.join(' AND ');
  const [rows, count] = await Promise.all([
    select(
      `SELECT al.uuid, al.actor_type, al.action, al.entity_type, al.entity_uuid, al.previous_status, al.new_status, al.request_ref,
              al.ip_address, al.metadata, al.created_at, u.full_name AS user_name, c.name AS company_name, a.name AS app_name
       FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id LEFT JOIN companies c ON c.id = al.company_id
       LEFT JOIN applications a ON a.id = al.application_id
       WHERE ${whereSql} ORDER BY al.created_at DESC, al.id DESC LIMIT :limit OFFSET :offset`,
      { ...repl, limit: q.pageSize, offset: (q.page - 1) * q.pageSize },
    ),
    select(`SELECT COUNT(*) AS n FROM audit_logs al LEFT JOIN users u ON u.id = al.user_id WHERE ${whereSql}`, repl),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.uuid,
      actorType: r.actor_type,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_uuid,
      previousStatus: r.previous_status,
      newStatus: r.new_status,
      reference: r.request_ref,
      ipAddress: r.ip_address,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
      createdAt: iso(r.created_at),
      user: r.user_name,
      company: r.company_name,
      application: r.app_name,
    })),
    meta: pageMeta(q, num(count[0]?.n)),
  };
}
