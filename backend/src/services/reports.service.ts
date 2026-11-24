/**
 * Phase 7 reporting: ten operational/accounting reports with company scoping
 * and server-side CSV / Excel / PDF export.
 */
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { Request } from 'express';
import { z } from 'zod';
import { ApiError } from '../utils/http';
import type { AuthContext } from './auth/authContext';
import { companyScope } from './access';
import { audit } from './audit.service';
import { iso, num, resolveCompany, select } from './common';

export const EXPORT_ROW_CAP = 50_000;
const UI_PAGE_MAX = 100;

export const REPORT_KEYS = [
  'company-expenses',
  'application-expenses',
  'payment-vouchers',
  'posting-success',
  'failed-transactions',
  'pending-queue',
  'missing-ledgers',
  'ledger-mappings',
  'monthly-expenses',
  'integration-audit',
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export interface ReportColumn {
  key: string;
  label: string;
}
export interface ReportChart {
  type: 'bar' | 'line' | 'pie';
  title: string;
  xKey: string;
  series: { key: string; label: string }[];
  points: Record<string, string | number>[];
}
export interface ReportResult {
  report: { key: ReportKey; title: string; description: string };
  filters: { dateFrom: string | null; dateTo: string | null; companyId: string | null; applicationId: string | null };
  summary: { label: string; value: string }[];
  chart: ReportChart | null;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

type CatalogEntry = {
  key: ReportKey;
  title: string;
  description: string;
  supportsApplication: boolean;
  dateFieldLabel: string;
};

export const CATALOG: CatalogEntry[] = [
  { key: 'company-expenses', title: 'Company-wise expense', description: 'Expenses grouped by company: count and total amount.', supportsApplication: true, dateFieldLabel: 'Expense date' },
  { key: 'application-expenses', title: 'Application-wise expense', description: 'Expenses grouped by Kissflow application.', supportsApplication: true, dateFieldLabel: 'Expense date' },
  { key: 'payment-vouchers', title: 'Payment voucher', description: 'Posted vouchers with type, number, reference and amount.', supportsApplication: true, dateFieldLabel: 'Voucher date' },
  { key: 'posting-success', title: 'Posting success', description: 'Jobs that posted successfully, with Tally verification details.', supportsApplication: true, dateFieldLabel: 'Posted at' },
  { key: 'failed-transactions', title: 'Failed transaction', description: 'Failed, dead-letter and Tally-rejected jobs.', supportsApplication: true, dateFieldLabel: 'Updated at' },
  { key: 'pending-queue', title: 'Pending queue', description: 'Open queue items waiting for mapping, masters, approval or posting.', supportsApplication: true, dateFieldLabel: 'Created at' },
  { key: 'missing-ledgers', title: 'Missing ledger', description: 'Mapped or configured ledgers that are not active in Tally masters.', supportsApplication: false, dateFieldLabel: 'N/A' },
  { key: 'ledger-mappings', title: 'Ledger mapping', description: 'Category → Tally ledger mappings with application scope.', supportsApplication: true, dateFieldLabel: 'Updated at' },
  { key: 'monthly-expenses', title: 'Monthly expense', description: 'Expense count and amount by calendar month.', supportsApplication: true, dateFieldLabel: 'Expense date' },
  { key: 'integration-audit', title: 'Integration audit', description: 'Audit trail of integration and posting actions.', supportsApplication: true, dateFieldLabel: 'Event time' },
];

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

export const reportFilterSchema = z.object({
  dateFrom: dateStr,
  dateTo: dateStr,
  companyId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(UI_PAGE_MAX).default(25),
});
export type ReportFilters = z.infer<typeof reportFilterSchema>;

export const exportQuerySchema = reportFilterSchema.extend({
  format: z.enum(['csv', 'xlsx', 'pdf']),
  page: z.coerce.number().int().min(1).default(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(UI_PAGE_MAX).default(25).optional(),
});

export const reportKeyParam = z.object({ key: z.enum(REPORT_KEYS) });

export function catalog() {
  return CATALOG.map(({ key, title, description, supportsApplication, dateFieldLabel }) => ({
    key,
    title,
    description,
    supportsApplication,
    dateFieldLabel,
  }));
}

function catalogEntry(key: ReportKey) {
  const e = CATALOG.find((c) => c.key === key);
  if (!e) throw ApiError.notFound('Report not found');
  return e;
}

function money(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

function pageMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

async function baseScope(ctx: AuthContext, q: ReportFilters, companyColumn: string) {
  const scope = companyScope(ctx, companyColumn);
  const where = [scope.sql];
  const repl: Record<string, unknown> = { ...scope.replacements };
  if (q.companyId) {
    const company = await resolveCompany(ctx, q.companyId);
    where.push(`${companyColumn} = :filterCompanyId`);
    repl.filterCompanyId = company.id;
  }
  return { where, repl };
}

function applyAppFilter(where: string[], repl: Record<string, unknown>, alias: string, applicationId?: string) {
  if (!applicationId) return;
  where.push(`${alias}.application_id = (SELECT id FROM applications WHERE uuid = :filterAppUuid)`);
  repl.filterAppUuid = applicationId;
}

function applyDate(where: string[], repl: Record<string, unknown>, column: string, q: ReportFilters, dateOnly = true) {
  if (q.dateFrom) {
    where.push(dateOnly ? `${column} >= :dateFrom` : `${column} >= :dateFromTs`);
    if (dateOnly) repl.dateFrom = q.dateFrom;
    else repl.dateFromTs = `${q.dateFrom} 00:00:00`;
  }
  if (q.dateTo) {
    where.push(dateOnly ? `${column} <= :dateTo` : `${column} < DATE_ADD(:dateToDay, INTERVAL 1 DAY)`);
    if (dateOnly) repl.dateTo = q.dateTo;
    else repl.dateToDay = q.dateTo;
  }
}

function presentFilters(q: ReportFilters) {
  return {
    dateFrom: q.dateFrom ?? null,
    dateTo: q.dateTo ?? null,
    companyId: q.companyId ?? null,
    applicationId: q.applicationId ?? null,
  };
}

type Built = {
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  total: number;
  summary: { label: string; value: string }[];
  chart: ReportChart | null;
};

async function buildCompanyExpenses(ctx: AuthContext, q: ReportFilters, limit: number, offset: number): Promise<Built> {
  const { where, repl } = await baseScope(ctx, q, 'e.company_id');
  applyAppFilter(where, repl, 'e', q.applicationId);
  applyDate(where, repl, 'e.expense_date', q, true);
  const whereSql = where.join(' AND ');
  const [rows, totals] = await Promise.all([
    select(
      `SELECT c.uuid AS company_id, c.name AS company, c.code AS company_code,
              COUNT(*) AS expense_count, COALESCE(SUM(e.amount), 0) AS total_amount, e.currency
       FROM expense_transactions e JOIN companies c ON c.id = e.company_id
       WHERE ${whereSql}
       GROUP BY c.id, c.uuid, c.name, c.code, e.currency
       ORDER BY total_amount DESC
       LIMIT :limit OFFSET :offset`,
      { ...repl, limit, offset },
    ),
    select(`SELECT COALESCE(SUM(e.amount), 0) AS amount, COUNT(e.id) AS expenses FROM expense_transactions e WHERE ${whereSql}`, repl),
  ]);
  const groupCount = await select(`SELECT COUNT(*) AS n FROM (SELECT e.company_id FROM expense_transactions e WHERE ${whereSql} GROUP BY e.company_id, e.currency) x`, repl);
  const chartPoints = rows.map((r) => ({ name: String(r.company), amount: Number(r.total_amount) }));
  return {
    columns: [
      { key: 'company', label: 'Company' },
      { key: 'companyCode', label: 'Code' },
      { key: 'expenseCount', label: 'Expenses' },
      { key: 'totalAmount', label: 'Total amount' },
      { key: 'currency', label: 'Currency' },
    ],
    rows: rows.map((r) => ({
      company: String(r.company),
      companyCode: String(r.company_code),
      expenseCount: num(r.expense_count),
      totalAmount: money(r.total_amount),
      currency: String(r.currency ?? 'INR'),
    })),
    total: num(groupCount[0]?.n),
    summary: [
      { label: 'Companies', value: String(num(groupCount[0]?.n)) },
      { label: 'Expenses', value: String(num(totals[0]?.expenses)) },
      { label: 'Total amount', value: money(totals[0]?.amount) },
    ],
    chart: chartPoints.length
      ? { type: 'bar', title: 'Amount by company', xKey: 'name', series: [{ key: 'amount', label: 'Amount' }], points: chartPoints }
      : null,
  };
}

async function buildApplicationExpenses(ctx: AuthContext, q: ReportFilters, limit: number, offset: number): Promise<Built> {
  const { where, repl } = await baseScope(ctx, q, 'e.company_id');
  applyAppFilter(where, repl, 'e', q.applicationId);
  applyDate(where, repl, 'e.expense_date', q, true);
  const whereSql = where.join(' AND ');
  const [rows, totals, groupCount] = await Promise.all([
    select(
      `SELECT a.uuid AS application_id, a.name AS application, a.code AS application_code,
              COUNT(*) AS expense_count, COALESCE(SUM(e.amount), 0) AS total_amount, e.currency
       FROM expense_transactions e JOIN applications a ON a.id = e.application_id
       WHERE ${whereSql}
       GROUP BY a.id, a.uuid, a.name, a.code, e.currency
       ORDER BY total_amount DESC
       LIMIT :limit OFFSET :offset`,
      { ...repl, limit, offset },
    ),
    select(`SELECT COALESCE(SUM(e.amount), 0) AS amount, COUNT(*) AS expenses FROM expense_transactions e WHERE ${whereSql}`, repl),
    select(`SELECT COUNT(*) AS n FROM (SELECT e.application_id FROM expense_transactions e WHERE ${whereSql} GROUP BY e.application_id, e.currency) x`, repl),
  ]);
  return {
    columns: [
      { key: 'application', label: 'Application' },
      { key: 'applicationCode', label: 'Code' },
      { key: 'expenseCount', label: 'Expenses' },
      { key: 'totalAmount', label: 'Total amount' },
      { key: 'currency', label: 'Currency' },
    ],
    rows: rows.map((r) => ({
      application: String(r.application),
      applicationCode: String(r.application_code),
      expenseCount: num(r.expense_count),
      totalAmount: money(r.total_amount),
      currency: String(r.currency ?? 'INR'),
    })),
    total: num(groupCount[0]?.n),
    summary: [
      { label: 'Applications', value: String(num(groupCount[0]?.n)) },
      { label: 'Expenses', value: String(num(totals[0]?.expenses)) },
      { label: 'Total amount', value: money(totals[0]?.amount) },
    ],
    chart: {
      type: 'bar',
      title: 'Amount by application',
      xKey: 'name',
      series: [{ key: 'amount', label: 'Amount' }],
      points: rows.map((r) => ({ name: String(r.application), amount: Number(r.total_amount) })),
    },
  };
}

async function buildPaymentVouchers(ctx: AuthContext, q: ReportFilters, limit: number, offset: number): Promise<Built> {
  const { where, repl } = await baseScope(ctx, q, 'pv.company_id');
  if (q.applicationId) {
    where.push('j.application_id = (SELECT id FROM applications WHERE uuid = :filterAppUuid)');
    repl.filterAppUuid = q.applicationId;
  }
  applyDate(where, repl, 'pv.voucher_date', q, true);
  const whereSql = where.join(' AND ');
  const from = `posted_vouchers pv
    JOIN processing_jobs j ON j.id = pv.job_id
    JOIN companies c ON c.id = pv.company_id
    JOIN applications a ON a.id = j.application_id
    LEFT JOIN expense_transactions e ON e.id = j.expense_id`;
  const [rows, count, totals] = await Promise.all([
    select(
      `SELECT pv.uuid, pv.voucher_date, pv.tally_voucher_type_name, pv.voucher_number, pv.reference, pv.total_amount, pv.currency,
              pv.verification_status, pv.tally_master_id, COALESCE(pv.verified_at, pv.created_at) AS posted_at,
              c.name AS company, a.name AS application, e.request_number
       FROM ${from} WHERE ${whereSql}
       ORDER BY pv.voucher_date DESC, pv.id DESC LIMIT :limit OFFSET :offset`,
      { ...repl, limit, offset },
    ),
    select(`SELECT COUNT(*) AS n FROM ${from} WHERE ${whereSql}`, repl),
    select(`SELECT COALESCE(SUM(pv.total_amount), 0) AS amount FROM ${from} WHERE ${whereSql}`, repl),
  ]);
  return {
    columns: [
      { key: 'voucherDate', label: 'Date' },
      { key: 'company', label: 'Company' },
      { key: 'application', label: 'Application' },
      { key: 'voucherType', label: 'Type' },
      { key: 'voucherNumber', label: 'Voucher no.' },
      { key: 'reference', label: 'Reference' },
      { key: 'requestNumber', label: 'Request' },
      { key: 'totalAmount', label: 'Amount' },
      { key: 'verification', label: 'Verification' },
      { key: 'tallyMasterId', label: 'Tally MasterID' },
    ],
    rows: rows.map((r) => ({
      voucherDate: String(r.voucher_date ?? ''),
      company: String(r.company),
      application: String(r.application),
      voucherType: String(r.tally_voucher_type_name),
      voucherNumber: r.voucher_number == null ? null : String(r.voucher_number),
      reference: r.reference == null ? null : String(r.reference),
      requestNumber: r.request_number == null ? null : String(r.request_number),
      totalAmount: money(r.total_amount),
      verification: String(r.verification_status),
      tallyMasterId: r.tally_master_id == null ? null : String(r.tally_master_id),
    })),
    total: num(count[0]?.n),
    summary: [
      { label: 'Vouchers', value: String(num(count[0]?.n)) },
      { label: 'Total amount', value: money(totals[0]?.amount) },
    ],
    chart: null,
  };
}

async function buildPostingSuccess(ctx: AuthContext, q: ReportFilters, limit: number, offset: number): Promise<Built> {
  const { where, repl } = await baseScope(ctx, q, 'j.company_id');
  where.push("j.status = 'POSTED'");
  applyAppFilter(where, repl, 'j', q.applicationId);
  applyDate(where, repl, 'COALESCE(pv.verified_at, pv.created_at, j.updated_at)', q, false);
  const whereSql = where.join(' AND ');
  const from = `processing_jobs j
    JOIN companies c ON c.id = j.company_id
    JOIN applications a ON a.id = j.application_id
    LEFT JOIN expense_transactions e ON e.id = j.expense_id
    LEFT JOIN posted_vouchers pv ON pv.job_id = j.id`;
  const [rows, count] = await Promise.all([
    select(
      `SELECT j.uuid, j.updated_at, e.request_number, e.amount, e.currency, c.name AS company, a.name AS application,
              pv.tally_voucher_type_name, pv.voucher_number, pv.reference, pv.verification_status, pv.tally_master_id,
              COALESCE(pv.verified_at, pv.created_at) AS posted_at
       FROM ${from} WHERE ${whereSql}
       ORDER BY COALESCE(pv.verified_at, pv.created_at, j.updated_at) DESC LIMIT :limit OFFSET :offset`,
      { ...repl, limit, offset },
    ),
    select(`SELECT COUNT(*) AS n FROM ${from} WHERE ${whereSql}`, repl),
  ]);
  return {
    columns: [
      { key: 'postedAt', label: 'Posted at' },
      { key: 'company', label: 'Company' },
      { key: 'application', label: 'Application' },
      { key: 'requestNumber', label: 'Request' },
      { key: 'amount', label: 'Amount' },
      { key: 'voucherType', label: 'Voucher type' },
      { key: 'voucherNumber', label: 'Voucher no.' },
      { key: 'reference', label: 'Reference' },
      { key: 'verification', label: 'Verification' },
      { key: 'tallyMasterId', label: 'Tally MasterID' },
    ],
    rows: rows.map((r) => ({
      postedAt: iso(r.posted_at ?? r.updated_at),
      company: String(r.company),
      application: String(r.application),
      requestNumber: r.request_number == null ? null : String(r.request_number),
      amount: money(r.amount),
      voucherType: r.tally_voucher_type_name == null ? null : String(r.tally_voucher_type_name),
      voucherNumber: r.voucher_number == null ? null : String(r.voucher_number),
      reference: r.reference == null ? null : String(r.reference),
      verification: r.verification_status == null ? null : String(r.verification_status),
      tallyMasterId: r.tally_master_id == null ? null : String(r.tally_master_id),
    })),
    total: num(count[0]?.n),
    summary: [{ label: 'Posted jobs', value: String(num(count[0]?.n)) }],
    chart: null,
  };
}

async function buildFailedTransactions(ctx: AuthContext, q: ReportFilters, limit: number, offset: number): Promise<Built> {
  const { where, repl } = await baseScope(ctx, q, 'j.company_id');
  where.push("(j.status = 'FAILED' OR j.is_dead_letter = 1)");
  applyAppFilter(where, repl, 'j', q.applicationId);
  applyDate(where, repl, 'j.updated_at', q, false);
  const whereSql = where.join(' AND ');
  const from = `processing_jobs j
    JOIN companies c ON c.id = j.company_id
    JOIN applications a ON a.id = j.application_id
    LEFT JOIN expense_transactions e ON e.id = j.expense_id`;
  const [rows, count, byError] = await Promise.all([
    select(
      `SELECT j.uuid, j.status, j.last_error_code, j.last_error_message, j.attempts, j.is_dead_letter, j.updated_at,
              e.request_number, e.amount, e.currency, c.name AS company, a.name AS application
       FROM ${from} WHERE ${whereSql}
       ORDER BY j.updated_at DESC LIMIT :limit OFFSET :offset`,
      { ...repl, limit, offset },
    ),
    select(`SELECT COUNT(*) AS n, SUM(j.is_dead_letter = 1) AS dead FROM ${from} WHERE ${whereSql}`, repl),
    select(
      `SELECT COALESCE(j.last_error_code, 'UNKNOWN') AS code, COUNT(*) AS n FROM ${from} WHERE ${whereSql}
       GROUP BY COALESCE(j.last_error_code, 'UNKNOWN') ORDER BY n DESC LIMIT 10`,
      repl,
    ),
  ]);
  return {
    columns: [
      { key: 'updatedAt', label: 'Updated' },
      { key: 'company', label: 'Company' },
      { key: 'application', label: 'Application' },
      { key: 'requestNumber', label: 'Request' },
      { key: 'amount', label: 'Amount' },
      { key: 'status', label: 'Status' },
      { key: 'errorCode', label: 'Error code' },
      { key: 'lastError', label: 'Error' },
      { key: 'attempts', label: 'Attempts' },
      { key: 'deadLetter', label: 'Dead letter' },
    ],
    rows: rows.map((r) => ({
      updatedAt: iso(r.updated_at),
      company: String(r.company),
      application: String(r.application),
      requestNumber: r.request_number == null ? null : String(r.request_number),
      amount: money(r.amount),
      status: String(r.status),
      errorCode: r.last_error_code == null ? null : String(r.last_error_code),
      lastError: r.last_error_message == null ? null : String(r.last_error_message).slice(0, 300),
      attempts: num(r.attempts),
      deadLetter: Boolean(r.is_dead_letter) ? 'Yes' : 'No',
    })),
    total: num(count[0]?.n),
    summary: [
      { label: 'Failed jobs', value: String(num(count[0]?.n)) },
      { label: 'Dead letter', value: String(num(count[0]?.dead)) },
    ],
    chart: {
      type: 'pie',
      title: 'By error code',
      xKey: 'name',
      series: [{ key: 'count', label: 'Count' }],
      points: byError.map((r) => ({ name: String(r.code), count: num(r.n) })),
    },
  };
}

const PENDING = `('RECEIVED','VALIDATING','MAPPING_REQUIRED','MASTER_CREATION_REQUIRED','VALIDATION_FAILED','AWAITING_APPROVAL','READY_TO_POST','PROCESSING','RETRY_PENDING','RECONCILIATION_REQUIRED')`;

async function buildPendingQueue(ctx: AuthContext, q: ReportFilters, limit: number, offset: number): Promise<Built> {
  const { where, repl } = await baseScope(ctx, q, 'j.company_id');
  where.push(`j.status IN ${PENDING}`);
  where.push('j.is_paused = 0');
  applyAppFilter(where, repl, 'j', q.applicationId);
  applyDate(where, repl, 'j.created_at', q, false);
  const whereSql = where.join(' AND ');
  const from = `processing_jobs j
    JOIN companies c ON c.id = j.company_id
    JOIN applications a ON a.id = j.application_id
    LEFT JOIN expense_transactions e ON e.id = j.expense_id`;
  const [rows, count, byStatus] = await Promise.all([
    select(
      `SELECT j.uuid, j.status, j.priority, j.attempts, j.created_at, j.next_retry_at,
              e.request_number, e.amount, e.currency, c.name AS company, a.name AS application
       FROM ${from} WHERE ${whereSql}
       ORDER BY j.priority ASC, j.created_at ASC LIMIT :limit OFFSET :offset`,
      { ...repl, limit, offset },
    ),
    select(`SELECT COUNT(*) AS n FROM ${from} WHERE ${whereSql}`, repl),
    select(`SELECT j.status, COUNT(*) AS n FROM ${from} WHERE ${whereSql} GROUP BY j.status ORDER BY n DESC`, repl),
  ]);
  return {
    columns: [
      { key: 'createdAt', label: 'Created' },
      { key: 'company', label: 'Company' },
      { key: 'application', label: 'Application' },
      { key: 'requestNumber', label: 'Request' },
      { key: 'amount', label: 'Amount' },
      { key: 'status', label: 'Status' },
      { key: 'priority', label: 'Priority' },
      { key: 'attempts', label: 'Attempts' },
      { key: 'nextRetryAt', label: 'Next retry' },
    ],
    rows: rows.map((r) => ({
      createdAt: iso(r.created_at),
      company: String(r.company),
      application: String(r.application),
      requestNumber: r.request_number == null ? null : String(r.request_number),
      amount: money(r.amount),
      status: String(r.status),
      priority: num(r.priority),
      attempts: num(r.attempts),
      nextRetryAt: iso(r.next_retry_at),
    })),
    total: num(count[0]?.n),
    summary: [
      { label: 'Open jobs', value: String(num(count[0]?.n)) },
      ...byStatus.slice(0, 4).map((r) => ({ label: String(r.status), value: String(num(r.n)) })),
    ],
    chart: {
      type: 'bar',
      title: 'By status',
      xKey: 'name',
      series: [{ key: 'count', label: 'Count' }],
      points: byStatus.map((r) => ({ name: String(r.status), count: num(r.n) })),
    },
  };
}

async function buildMissingLedgers(ctx: AuthContext, q: ReportFilters, limit: number, offset: number): Promise<Built> {
  const { where, repl } = await baseScope(ctx, q, 'c.id');
  // company filter already applied via baseScope on c.id when companyId set
  const whereSql = where.join(' AND ');
  const sql = `
    SELECT c.uuid AS company_id, c.name AS company, x.name AS ledger_name,
           GROUP_CONCAT(DISTINCT x.used_by ORDER BY x.used_by SEPARATOR '; ') AS used_by,
           (SELECT r.status FROM master_creation_requests r WHERE r.company_id = c.id AND r.proposed_name = x.name
              AND r.status IN ('PENDING_REVIEW','APPROVED','CREATING') LIMIT 1) AS open_request_status
    FROM companies c
    JOIN (
      SELECT lm.company_id, lm.tally_ledger_name AS name, CONCAT('Mapping: ', lm.source_category) AS used_by
        FROM ledger_mappings lm WHERE lm.is_active = 1
      UNION ALL
      SELECT v.company_id, JSON_UNQUOTE(JSON_EXTRACT(v.credit_ledger_rule, '$.ledger')), CONCAT('Credit: ', v.tally_voucher_type_name)
        FROM voucher_configurations v WHERE v.is_active = 1 AND JSON_UNQUOTE(JSON_EXTRACT(v.credit_ledger_rule, '$.source')) = 'FIXED'
      UNION ALL
      SELECT v.company_id, JSON_UNQUOTE(JSON_EXTRACT(v.tax_ledger_rule, '$.ledger')), CONCAT('Tax: ', v.tally_voucher_type_name)
        FROM voucher_configurations v WHERE v.is_active = 1 AND JSON_UNQUOTE(JSON_EXTRACT(v.tax_ledger_rule, '$.source')) = 'FIXED'
    ) x ON x.company_id = c.id
    WHERE ${whereSql} AND c.deleted_at IS NULL AND x.name IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM ledger_masters m WHERE m.company_id = c.id AND m.name = x.name AND m.is_active = 1)
    GROUP BY c.id, c.uuid, c.name, x.name
    ORDER BY c.name, x.name`;
  const all = await select(sql, repl);
  const slice = all.slice(offset, offset + limit);
  return {
    columns: [
      { key: 'company', label: 'Company' },
      { key: 'ledgerName', label: 'Missing ledger' },
      { key: 'usedBy', label: 'Used by' },
      { key: 'openRequest', label: 'Open request' },
    ],
    rows: slice.map((r) => ({
      company: String(r.company),
      ledgerName: String(r.ledger_name),
      usedBy: r.used_by == null ? null : String(r.used_by),
      openRequest: r.open_request_status == null ? null : String(r.open_request_status),
    })),
    total: all.length,
    summary: [{ label: 'Missing ledgers', value: String(all.length) }],
    chart: null,
  };
}

async function buildLedgerMappings(ctx: AuthContext, q: ReportFilters, limit: number, offset: number): Promise<Built> {
  const { where, repl } = await baseScope(ctx, q, 'lm.company_id');
  if (q.applicationId) {
    where.push('(a.uuid = :filterAppUuid OR lm.application_id IS NULL)');
    repl.filterAppUuid = q.applicationId;
  }
  applyDate(where, repl, 'lm.updated_at', q, false);
  const whereSql = where.join(' AND ');
  const from = `ledger_mappings lm
    JOIN companies c ON c.id = lm.company_id
    LEFT JOIN applications a ON a.id = lm.application_id`;
  const [rows, count] = await Promise.all([
    select(
      `SELECT lm.uuid, lm.source_category, lm.tally_ledger_name, lm.cost_centre, lm.is_active, lm.updated_at,
              c.name AS company, a.name AS application,
              (SELECT COUNT(*) FROM ledger_masters m WHERE m.company_id = lm.company_id AND m.name = lm.tally_ledger_name AND m.is_active = 1) AS ledger_exists
       FROM ${from} WHERE ${whereSql}
       ORDER BY c.name, lm.source_category LIMIT :limit OFFSET :offset`,
      { ...repl, limit, offset },
    ),
    select(`SELECT COUNT(*) AS n FROM ${from} WHERE ${whereSql}`, repl),
  ]);
  const missing = rows.filter((r) => num(r.ledger_exists) === 0).length;
  return {
    columns: [
      { key: 'company', label: 'Company' },
      { key: 'application', label: 'Application scope' },
      { key: 'sourceCategory', label: 'Source category' },
      { key: 'tallyLedger', label: 'Tally ledger' },
      { key: 'costCentre', label: 'Cost centre' },
      { key: 'active', label: 'Active' },
      { key: 'ledgerExists', label: 'Ledger exists' },
      { key: 'updatedAt', label: 'Updated' },
    ],
    rows: rows.map((r) => ({
      company: String(r.company),
      application: r.application == null ? 'Company-wide' : String(r.application),
      sourceCategory: String(r.source_category),
      tallyLedger: String(r.tally_ledger_name),
      costCentre: r.cost_centre == null ? null : String(r.cost_centre),
      active: Boolean(r.is_active) ? 'Yes' : 'No',
      ledgerExists: num(r.ledger_exists) > 0 ? 'Yes' : 'No',
      updatedAt: iso(r.updated_at),
    })),
    total: num(count[0]?.n),
    summary: [
      { label: 'Mappings', value: String(num(count[0]?.n)) },
      { label: 'Missing on this page', value: String(missing) },
    ],
    chart: null,
  };
}

async function buildMonthlyExpenses(ctx: AuthContext, q: ReportFilters, limit: number, offset: number): Promise<Built> {
  const { where, repl } = await baseScope(ctx, q, 'e.company_id');
  applyAppFilter(where, repl, 'e', q.applicationId);
  applyDate(where, repl, 'e.expense_date', q, true);
  const whereSql = where.join(' AND ');
  const [rows, totals, groupCount] = await Promise.all([
    select(
      `SELECT DATE_FORMAT(e.expense_date, '%Y-%m') AS month, COUNT(*) AS expense_count,
              COALESCE(SUM(e.amount), 0) AS total_amount, e.currency
       FROM expense_transactions e WHERE ${whereSql}
       GROUP BY DATE_FORMAT(e.expense_date, '%Y-%m'), e.currency
       ORDER BY month DESC LIMIT :limit OFFSET :offset`,
      { ...repl, limit, offset },
    ),
    select(`SELECT COALESCE(SUM(e.amount), 0) AS amount, COUNT(*) AS expenses FROM expense_transactions e WHERE ${whereSql}`, repl),
    select(`SELECT COUNT(*) AS n FROM (SELECT DATE_FORMAT(e.expense_date, '%Y-%m') m FROM expense_transactions e WHERE ${whereSql} GROUP BY m, e.currency) x`, repl),
  ]);
  const chronological = [...rows].reverse();
  return {
    columns: [
      { key: 'month', label: 'Month' },
      { key: 'expenseCount', label: 'Expenses' },
      { key: 'totalAmount', label: 'Total amount' },
      { key: 'currency', label: 'Currency' },
    ],
    rows: rows.map((r) => ({
      month: String(r.month),
      expenseCount: num(r.expense_count),
      totalAmount: money(r.total_amount),
      currency: String(r.currency ?? 'INR'),
    })),
    total: num(groupCount[0]?.n),
    summary: [
      { label: 'Months', value: String(num(groupCount[0]?.n)) },
      { label: 'Expenses', value: String(num(totals[0]?.expenses)) },
      { label: 'Total amount', value: money(totals[0]?.amount) },
    ],
    chart: {
      type: 'line',
      title: 'Monthly expense amount',
      xKey: 'name',
      series: [{ key: 'amount', label: 'Amount' }],
      points: chronological.map((r) => ({ name: String(r.month), amount: Number(r.total_amount) })),
    },
  };
}

async function buildIntegrationAudit(ctx: AuthContext, q: ReportFilters, limit: number, offset: number): Promise<Built> {
  const scope = companyScope(ctx, 'al.company_id');
  // Include company-null system events only for ALL-scope users; scoped users see their companies only.
  const where = [ctx.companyIds === 'ALL' ? '(al.company_id IS NULL OR 1=1)' : scope.sql];
  const repl: Record<string, unknown> = { ...scope.replacements };
  if (q.companyId) {
    const company = await resolveCompany(ctx, q.companyId);
    where.length = 0;
    where.push('al.company_id = :filterCompanyId');
    repl.filterCompanyId = company.id;
  }
  if (q.applicationId) {
    where.push('al.application_id = (SELECT id FROM applications WHERE uuid = :filterAppUuid)');
    repl.filterAppUuid = q.applicationId;
  }
  applyDate(where, repl, 'al.created_at', q, false);
  where.push(`al.action REGEXP 'EXPENSE_|POSTING_|APPROVAL_|LEDGER_|MASTER_|MAPPING_|WEBHOOK_|JOB_|RETRY_|RECONCIL|REPORT_|AGENT_|LEDGERS_'`);
  const whereSql = where.join(' AND ');
  const from = `audit_logs al
    LEFT JOIN companies c ON c.id = al.company_id
    LEFT JOIN applications a ON a.id = al.application_id
    LEFT JOIN users u ON u.id = al.user_id`;
  const [rows, count, byAction] = await Promise.all([
    select(
      `SELECT al.uuid, al.action, al.actor_type, al.created_at, al.previous_status, al.new_status, al.entity_type, al.entity_uuid,
              c.name AS company, a.name AS application, u.full_name AS actor
       FROM ${from} WHERE ${whereSql}
       ORDER BY al.created_at DESC LIMIT :limit OFFSET :offset`,
      { ...repl, limit, offset },
    ),
    select(`SELECT COUNT(*) AS n FROM ${from} WHERE ${whereSql}`, repl),
    select(`SELECT al.action, COUNT(*) AS n FROM ${from} WHERE ${whereSql} GROUP BY al.action ORDER BY n DESC LIMIT 12`, repl),
  ]);
  return {
    columns: [
      { key: 'createdAt', label: 'Time' },
      { key: 'action', label: 'Action' },
      { key: 'actor', label: 'Actor' },
      { key: 'actorType', label: 'Actor type' },
      { key: 'company', label: 'Company' },
      { key: 'application', label: 'Application' },
      { key: 'statusChange', label: 'Status' },
      { key: 'entity', label: 'Entity' },
    ],
    rows: rows.map((r) => ({
      createdAt: iso(r.created_at),
      action: String(r.action),
      actor: r.actor == null ? String(r.actor_type) : String(r.actor),
      actorType: String(r.actor_type),
      company: r.company == null ? null : String(r.company),
      application: r.application == null ? null : String(r.application),
      statusChange: r.previous_status || r.new_status ? `${r.previous_status ?? '—'} → ${r.new_status ?? '—'}` : null,
      entity: r.entity_type ? `${r.entity_type}${r.entity_uuid ? ` ${String(r.entity_uuid).slice(0, 8)}` : ''}` : null,
    })),
    total: num(count[0]?.n),
    summary: [{ label: 'Events', value: String(num(count[0]?.n)) }],
    chart: {
      type: 'bar',
      title: 'Top actions',
      xKey: 'name',
      series: [{ key: 'count', label: 'Count' }],
      points: byAction.map((r) => ({ name: String(r.action), count: num(r.n) })),
    },
  };
}

async function build(key: ReportKey, ctx: AuthContext, q: ReportFilters, limit: number, offset: number): Promise<Built> {
  switch (key) {
    case 'company-expenses':
      return buildCompanyExpenses(ctx, q, limit, offset);
    case 'application-expenses':
      return buildApplicationExpenses(ctx, q, limit, offset);
    case 'payment-vouchers':
      return buildPaymentVouchers(ctx, q, limit, offset);
    case 'posting-success':
      return buildPostingSuccess(ctx, q, limit, offset);
    case 'failed-transactions':
      return buildFailedTransactions(ctx, q, limit, offset);
    case 'pending-queue':
      return buildPendingQueue(ctx, q, limit, offset);
    case 'missing-ledgers':
      return buildMissingLedgers(ctx, q, limit, offset);
    case 'ledger-mappings':
      return buildLedgerMappings(ctx, q, limit, offset);
    case 'monthly-expenses':
      return buildMonthlyExpenses(ctx, q, limit, offset);
    case 'integration-audit':
      return buildIntegrationAudit(ctx, q, limit, offset);
    default:
      throw ApiError.notFound('Report not found');
  }
}

export async function runReport(ctx: AuthContext, key: ReportKey, q: ReportFilters): Promise<ReportResult> {
  const entry = catalogEntry(key);
  const built = await build(key, ctx, q, q.pageSize, (q.page - 1) * q.pageSize);
  return {
    report: { key, title: entry.title, description: entry.description },
    filters: presentFilters(q),
    summary: built.summary,
    chart: built.chart,
    columns: built.columns,
    rows: built.rows,
    meta: pageMeta(q.page, q.pageSize, built.total),
  };
}

function csvEscape(v: unknown) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function toCsv(columns: ReportColumn[], rows: Record<string, string | number | null>[]) {
  const header = columns.map((c) => csvEscape(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => csvEscape(r[c.key])).join(',')).join('\n');
  return Buffer.from(`${header}\n${body}\n`, 'utf8');
}

async function toXlsx(title: string, columns: ReportColumn[], rows: Record<string, string | number | null>[], summary: { label: string; value: string }[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Tally Monitor';
  const sheet = wb.addWorksheet(title.slice(0, 31));
  sheet.addRow(summary.map((s) => `${s.label}: ${s.value}`));
  sheet.addRow([]);
  sheet.addRow(columns.map((c) => c.label));
  sheet.getRow(3).font = { bold: true };
  for (const r of rows) sheet.addRow(columns.map((c) => r[c.key] ?? ''));
  sheet.columns.forEach((col) => {
    col.width = 18;
  });
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function toPdf(title: string, columns: ReportColumn[], rows: Record<string, string | number | null>[], summary: { label: string; value: string }[], filters: ReportResult['filters']) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: columns.length > 6 ? 'landscape' : 'portrait' });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text(title, { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#444').text(`Generated ${new Date().toISOString()}`);
    const filterBits = [
      filters.dateFrom ? `From ${filters.dateFrom}` : null,
      filters.dateTo ? `To ${filters.dateTo}` : null,
      filters.companyId ? `Company ${filters.companyId}` : null,
      filters.applicationId ? `Application ${filters.applicationId}` : null,
    ].filter(Boolean);
    if (filterBits.length) doc.text(filterBits.join(' · '));
    doc.moveDown(0.5).fillColor('#000').text(summary.map((s) => `${s.label}: ${s.value}`).join('   '));
    doc.moveDown();

    const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colW = usable / Math.max(columns.length, 1);
    const drawHeader = () => {
      doc.fontSize(8).font('Helvetica-Bold');
      let x = doc.page.margins.left;
      const y = doc.y;
      for (const c of columns) {
        doc.text(c.label, x, y, { width: colW - 4, continued: false });
        x += colW;
      }
      doc.moveDown(0.8);
      doc.font('Helvetica');
    };
    drawHeader();
    for (const r of rows) {
      if (doc.y > doc.page.height - 50) {
        doc.addPage();
        drawHeader();
      }
      let x = doc.page.margins.left;
      const y = doc.y;
      let rowH = 12;
      for (const c of columns) {
        const text = r[c.key] == null ? '' : String(r[c.key]);
        doc.fontSize(7).text(text, x, y, { width: colW - 4, height: 36, ellipsis: true });
        rowH = Math.max(rowH, 12);
        x += colW;
      }
      doc.y = y + rowH + 2;
    }
    doc.end();
  });
}

export async function exportReport(
  ctx: AuthContext,
  key: ReportKey,
  q: ReportFilters & { format: 'csv' | 'xlsx' | 'pdf' },
  req: Request,
): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
  const entry = catalogEntry(key);
  // Count first; refuse oversized exports rather than streaming unbounded memory.
  const probe = await build(key, ctx, { ...q, page: 1, pageSize: 1 }, 1, 0);
  if (probe.total > EXPORT_ROW_CAP) {
    throw new ApiError(422, 'EXPORT_TOO_LARGE', `This report has ${probe.total} rows. Narrow the date or company filter (export limit is ${EXPORT_ROW_CAP}).`);
  }
  const full = await build(key, ctx, q, Math.max(probe.total, 1), 0);
  const filters = presentFilters(q);
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `tally-monitor-${key}-${stamp}`;

  let buffer: Buffer;
  let contentType: string;
  let filename: string;
  if (q.format === 'csv') {
    buffer = await toCsv(full.columns, full.rows);
    contentType = 'text/csv; charset=utf-8';
    filename = `${base}.csv`;
  } else if (q.format === 'xlsx') {
    buffer = await toXlsx(entry.title, full.columns, full.rows, full.summary);
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    filename = `${base}.xlsx`;
  } else {
    buffer = await toPdf(entry.title, full.columns, full.rows, full.summary, filters);
    contentType = 'application/pdf';
    filename = `${base}.pdf`;
  }

  await audit(
    {
      action: 'REPORT_EXPORTED',
      userId: ctx.user.id,
      entityType: 'report',
      entityUuid: key,
      metadata: { format: q.format, rows: full.rows.length, filters },
    },
    req,
  );

  return { buffer, contentType, filename };
}
