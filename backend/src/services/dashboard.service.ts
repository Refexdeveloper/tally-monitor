import { QueryTypes } from 'sequelize';
import { env } from '../config/env';
import { STATUS_GROUPS, type JobStatus } from '../domain/jobStatus';
import { sequelize } from '../models';
import { companyScope } from './access';
import type { AuthContext } from './auth/authContext';

const DAY_MS = 86_400_000;

type Row = Record<string, unknown>;

function select<T extends object = Row>(sql: string, replacements: Record<string, unknown>): Promise<T[]> {
  return sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT });
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? new Date(String(v)).toISOString() : null);

/** Local calendar days (by tz offset in minutes) from oldest to today. */
function dayKeys(days: number, tzOffset: number): string[] {
  const nowLocal = Date.now() + tzOffset * 60_000;
  return Array.from({ length: days }, (_, i) => new Date(nowLocal - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10));
}

function monthKeys(months: number, tzOffset: number): string[] {
  const now = new Date(Date.now() + tzOffset * 60_000);
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

/** UTC instant corresponding to local midnight `days - 1` days ago. */
function sinceForDays(days: number, tzOffset: number): Date {
  const first = dayKeys(days, tzOffset)[0];
  return new Date(Date.parse(`${first}T00:00:00Z`) - tzOffset * 60_000);
}

function fill(keys: string[], rows: Row[], keyField = 'd') {
  const map = new Map(rows.map((r) => [String(r[keyField]), r]));
  return keys.map((k) => ({ key: k, row: map.get(k) }));
}

function trend(series: number[]): number | null {
  const half = Math.floor(series.length / 2);
  const prev = series.slice(0, half).reduce((a, b) => a + b, 0);
  const curr = series.slice(half).reduce((a, b) => a + b, 0);
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

const localDate = (column: string) => `DATE_FORMAT(DATE_ADD(${column}, INTERVAL :tz MINUTE), '%Y-%m-%d')`;
const localMonth = (column: string) => `DATE_FORMAT(DATE_ADD(${column}, INTERVAL :tz MINUTE), '%Y-%m')`;

export async function getOverview(ctx: AuthContext, tzOffset: number) {
  const eScope = companyScope(ctx, 'e.company_id');
  const jScope = companyScope(ctx, 'j.company_id');
  const cScope = companyScope(ctx, 'c.id');
  const pvScope = companyScope(ctx, 'pv.company_id');
  const mScope = companyScope(ctx, 'm.company_id');
  const keys = dayKeys(14, tzOffset);
  const since = sinceForDays(14, tzOffset);
  const base = { tz: tzOffset, since };

  const appsSql =
    ctx.companyIds === 'ALL'
      ? `SELECT COUNT(*) AS total, SUM(a.status = 'ACTIVE') AS active FROM applications a WHERE a.deleted_at IS NULL`
      : `SELECT COUNT(DISTINCT a.id) AS total, COUNT(DISTINCT CASE WHEN a.status = 'ACTIVE' THEN a.id END) AS active
         FROM applications a JOIN application_companies ac ON ac.application_id = a.id
         WHERE a.deleted_at IS NULL AND ${companyScope(ctx, 'ac.company_id').sql}`;

  const [apps, companies, expenseTotals, jobCounts, masterPending, receivedDaily, postedDaily, failedDaily] = await Promise.all([
    select(appsSql, { ...companyScope(ctx, 'ac.company_id').replacements }),
    select(`SELECT COUNT(*) AS total, SUM(c.is_active) AS active FROM companies c WHERE c.deleted_at IS NULL AND ${cScope.sql}`, cScope.replacements),
    select(
      `SELECT e.currency, COUNT(*) AS n, SUM(e.amount) AS total FROM expense_transactions e WHERE ${eScope.sql} GROUP BY e.currency ORDER BY n DESC`,
      eScope.replacements,
    ),
    select(`SELECT j.status, COUNT(*) AS n FROM processing_jobs j WHERE ${jScope.sql} GROUP BY j.status`, jScope.replacements),
    select(`SELECT COUNT(*) AS n FROM master_creation_requests m WHERE m.status = 'PENDING_REVIEW' AND ${mScope.sql}`, mScope.replacements),
    select(
      `SELECT ${localDate('e.received_at')} AS d, COUNT(*) AS n FROM expense_transactions e
       WHERE e.received_at >= :since AND ${eScope.sql} GROUP BY d`,
      { ...base, ...eScope.replacements },
    ),
    select(
      `SELECT ${localDate('pv.verified_at')} AS d, COUNT(*) AS n FROM posted_vouchers pv
       WHERE pv.verification_status = 'VERIFIED' AND pv.verified_at >= :since AND ${pvScope.sql} GROUP BY d`,
      { ...base, ...pvScope.replacements },
    ),
    select(
      `SELECT ${localDate('a.finished_at')} AS d, COUNT(*) AS n FROM job_attempts a JOIN processing_jobs j ON j.id = a.job_id
       WHERE a.outcome IN ('FAILED', 'TIMEOUT', 'AMBIGUOUS') AND a.finished_at >= :since AND ${jScope.sql} GROUP BY d`,
      { ...base, ...jScope.replacements },
    ),
  ]);

  const statusCount = new Map(jobCounts.map((r) => [r.status as JobStatus, num(r.n)]));
  const sumOf = (statuses: readonly JobStatus[]) => statuses.reduce((acc, s) => acc + (statusCount.get(s) ?? 0), 0);
  const totalJobs = [...statusCount.values()].reduce((a, b) => a + b, 0);
  const series = (rows: Row[]) => fill(keys, rows).map(({ key, row }) => ({ date: key, value: num(row?.n) }));
  const received = series(receivedDaily);
  const posted = series(postedDaily);
  const failed = series(failedDaily);

  return {
    generatedAt: new Date().toISOString(),
    applications: { total: num(apps[0]?.total), active: num(apps[0]?.active) },
    companies: { total: num(companies[0]?.total), active: num(companies[0]?.active) },
    expenses: {
      total: expenseTotals.reduce((a, r) => a + num(r.n), 0),
      byCurrency: expenseTotals.map((r) => ({ currency: String(r.currency), count: num(r.n), amount: String(r.total ?? '0') })),
      daily: received,
      trendPct: trend(received.map((p) => p.value)),
    },
    jobs: {
      total: totalJobs,
      pending: sumOf(STATUS_GROUPS.pending),
      processing: sumOf(STATUS_GROUPS.processing),
      posted: sumOf(STATUS_GROUPS.posted),
      failed: sumOf(STATUS_GROUPS.failed),
      awaitingApproval: sumOf(STATUS_GROUPS.awaitingApproval),
      needsAttention: sumOf(STATUS_GROUPS.attention),
      postedDaily: posted,
      postedTrendPct: trend(posted.map((p) => p.value)),
      failedDaily: failed,
      failedTrendPct: trend(failed.map((p) => p.value)),
    },
    masterRequestsPending: num(masterPending[0]?.n),
  };
}

export async function getAnalytics(ctx: AuthContext, days: number, tzOffset: number) {
  const eScope = companyScope(ctx, 'e.company_id');
  const jScope = companyScope(ctx, 'j.company_id');
  const cScope = companyScope(ctx, 'c.id');
  const pvScope = companyScope(ctx, 'pv.company_id');
  const keys = dayKeys(days, tzOffset);
  const months = monthKeys(12, tzOffset);
  const since = sinceForDays(days, tzOffset);
  const monthsSince = new Date(Date.parse(`${months[0]}-01T00:00:00Z`) - tzOffset * 60_000);
  const base = { tz: tzOffset, since, monthsSince };

  const [byCompany, byApplication, daily, postedDaily, failedDaily, queue, monthlyExpenses, monthlyPosted] = await Promise.all([
    select(
      `SELECT c.uuid, c.name, c.code, c.default_currency AS currency, COUNT(e.id) AS n, COALESCE(SUM(e.amount), 0) AS total
       FROM companies c LEFT JOIN expense_transactions e ON e.company_id = c.id AND e.received_at >= :since
       WHERE c.deleted_at IS NULL AND ${cScope.sql} GROUP BY c.id ORDER BY total DESC`,
      { ...base, ...cScope.replacements },
    ),
    select(
      `SELECT a.uuid, a.name, a.code, a.color, COUNT(e.id) AS n, COALESCE(SUM(e.amount), 0) AS total
       FROM expense_transactions e JOIN applications a ON a.id = e.application_id
       WHERE e.received_at >= :since AND ${eScope.sql} GROUP BY a.id ORDER BY total DESC`,
      { ...base, ...eScope.replacements },
    ),
    select(
      `SELECT ${localDate('e.received_at')} AS d, COUNT(*) AS n, COALESCE(SUM(e.amount), 0) AS total
       FROM expense_transactions e WHERE e.received_at >= :since AND ${eScope.sql} GROUP BY d`,
      { ...base, ...eScope.replacements },
    ),
    select(
      `SELECT ${localDate('pv.verified_at')} AS d, COUNT(*) AS n FROM posted_vouchers pv
       WHERE pv.verification_status = 'VERIFIED' AND pv.verified_at >= :since AND ${pvScope.sql} GROUP BY d`,
      { ...base, ...pvScope.replacements },
    ),
    select(
      `SELECT ${localDate('a.finished_at')} AS d, COUNT(*) AS n FROM job_attempts a JOIN processing_jobs j ON j.id = a.job_id
       WHERE a.outcome IN ('FAILED', 'TIMEOUT', 'AMBIGUOUS') AND a.finished_at >= :since AND ${jScope.sql} GROUP BY d`,
      { ...base, ...jScope.replacements },
    ),
    select(`SELECT j.status, COUNT(*) AS n FROM processing_jobs j WHERE ${jScope.sql} GROUP BY j.status ORDER BY n DESC`, jScope.replacements),
    select(
      `SELECT ${localMonth('e.received_at')} AS m, COUNT(*) AS n, COALESCE(SUM(e.amount), 0) AS total
       FROM expense_transactions e WHERE e.received_at >= :monthsSince AND ${eScope.sql} GROUP BY m`,
      { ...base, ...eScope.replacements },
    ),
    select(
      `SELECT ${localMonth('pv.verified_at')} AS m, COUNT(*) AS n, COALESCE(SUM(pv.total_amount), 0) AS total
       FROM posted_vouchers pv WHERE pv.verification_status = 'VERIFIED' AND pv.verified_at >= :monthsSince AND ${pvScope.sql} GROUP BY m`,
      { ...base, ...pvScope.replacements },
    ),
  ]);

  const postedMap = new Map(postedDaily.map((r) => [String(r.d), num(r.n)]));
  const failedMap = new Map(failedDaily.map((r) => [String(r.d), num(r.n)]));
  const postedMonthMap = new Map(monthlyPosted.map((r) => [String(r.m), r]));

  return {
    range: { days, from: keys[0], to: keys[keys.length - 1], tzOffset },
    expensesByCompany: byCompany.map((r) => ({ uuid: r.uuid, name: r.name, code: r.code, currency: r.currency, count: num(r.n), amount: num(r.total) })),
    expensesByApplication: byApplication.map((r) => ({ uuid: r.uuid, name: r.name, code: r.code, color: r.color, count: num(r.n), amount: num(r.total) })),
    dailyTransactions: fill(keys, daily).map(({ key, row }) => ({ date: key, count: num(row?.n), amount: num(row?.total) })),
    postingOutcome: {
      totals: {
        posted: [...postedMap.values()].reduce((a, b) => a + b, 0),
        failed: [...failedMap.values()].reduce((a, b) => a + b, 0),
      },
      daily: keys.map((k) => ({ date: k, posted: postedMap.get(k) ?? 0, failed: failedMap.get(k) ?? 0 })),
    },
    queueDistribution: queue.map((r) => ({ status: r.status as JobStatus, count: num(r.n) })),
    monthlyTrends: fill(months, monthlyExpenses, 'm').map(({ key, row }) => ({
      month: key,
      expenses: num(row?.n),
      expenseAmount: num(row?.total),
      posted: num(postedMonthMap.get(key)?.n),
      postedAmount: num(postedMonthMap.get(key)?.total),
    })),
  };
}

export async function getRecentActivity(ctx: AuthContext) {
  const eScope = companyScope(ctx, 'e.company_id');
  const jScope = companyScope(ctx, 'j.company_id');
  const pvScope = companyScope(ctx, 'pv.company_id');
  const alScope = companyScope(ctx, 'al.company_id');

  const appsSql =
    ctx.companyIds === 'ALL'
      ? `SELECT a.uuid, a.name, a.code, a.status, a.color, a.icon, a.created_at,
           (SELECT COUNT(*) FROM application_companies ac WHERE ac.application_id = a.id AND ac.is_active = 1) AS companies
         FROM applications a WHERE a.deleted_at IS NULL ORDER BY a.created_at DESC LIMIT 5`
      : `SELECT a.uuid, a.name, a.code, a.status, a.color, a.icon, a.created_at, COUNT(ac.id) AS companies
         FROM applications a JOIN application_companies ac ON ac.application_id = a.id AND ac.is_active = 1
         WHERE a.deleted_at IS NULL AND ${companyScope(ctx, 'ac.company_id').sql}
         GROUP BY a.id ORDER BY a.created_at DESC LIMIT 5`;

  const [expenses, vouchers, failedJobs, applications, companyActivity] = await Promise.all([
    select(
      `SELECT e.uuid, e.request_number, e.employee_name, e.vendor_name, e.expense_category, e.amount, e.currency,
              e.processing_status, e.received_at, a.name AS application, c.name AS company
       FROM expense_transactions e JOIN applications a ON a.id = e.application_id JOIN companies c ON c.id = e.company_id
       WHERE ${eScope.sql} ORDER BY e.received_at DESC LIMIT 8`,
      eScope.replacements,
    ),
    select(
      `SELECT pv.uuid, pv.voucher_number, pv.tally_voucher_type_name, pv.voucher_date, pv.total_amount, pv.currency, pv.verified_at,
              c.name AS company
       FROM posted_vouchers pv JOIN companies c ON c.id = pv.company_id
       WHERE pv.verification_status = 'VERIFIED' AND ${pvScope.sql} ORDER BY pv.verified_at DESC LIMIT 6`,
      pvScope.replacements,
    ),
    select(
      `SELECT j.uuid, j.status, j.attempts, j.last_error_code, j.last_error_message, j.updated_at,
              c.name AS company, a.name AS application, e.request_number, e.amount, e.currency
       FROM processing_jobs j JOIN companies c ON c.id = j.company_id JOIN applications a ON a.id = j.application_id
       JOIN expense_transactions e ON e.id = j.expense_id
       WHERE j.status IN ('FAILED', 'RECONCILIATION_REQUIRED') AND ${jScope.sql} ORDER BY j.updated_at DESC LIMIT 6`,
      jScope.replacements,
    ),
    select(appsSql, companyScope(ctx, 'ac.company_id').replacements),
    select(
      `SELECT al.uuid, al.action, al.actor_type, al.previous_status, al.new_status, al.request_ref, al.created_at,
              c.name AS company, u.full_name AS user_name
       FROM audit_logs al JOIN companies c ON c.id = al.company_id LEFT JOIN users u ON u.id = al.user_id
       WHERE ${alScope.sql} ORDER BY al.created_at DESC LIMIT 8`,
      alScope.replacements,
    ),
  ]);

  return {
    latestExpenses: expenses.map((r) => ({
      uuid: r.uuid,
      requestNumber: r.request_number,
      party: r.employee_name ?? r.vendor_name,
      category: r.expense_category,
      amount: String(r.amount),
      currency: r.currency,
      status: r.processing_status,
      receivedAt: iso(r.received_at),
      application: r.application,
      company: r.company,
    })),
    latestVouchers: vouchers.map((r) => ({
      uuid: r.uuid,
      voucherNumber: r.voucher_number,
      voucherType: r.tally_voucher_type_name,
      voucherDate: r.voucher_date,
      amount: String(r.total_amount),
      currency: r.currency,
      verifiedAt: iso(r.verified_at),
      company: r.company,
    })),
    failedJobs: failedJobs.map((r) => ({
      uuid: r.uuid,
      status: r.status,
      attempts: num(r.attempts),
      errorCode: r.last_error_code,
      errorMessage: r.last_error_message,
      updatedAt: iso(r.updated_at),
      company: r.company,
      application: r.application,
      requestNumber: r.request_number,
      amount: String(r.amount),
      currency: r.currency,
    })),
    recentApplications: applications.map((r) => ({
      uuid: r.uuid,
      name: r.name,
      code: r.code,
      status: r.status,
      color: r.color,
      icon: r.icon,
      createdAt: iso(r.created_at),
      companies: num(r.companies),
    })),
    companyActivity: companyActivity.map((r) => ({
      uuid: r.uuid,
      action: r.action,
      actorType: r.actor_type,
      previousStatus: r.previous_status,
      newStatus: r.new_status,
      reference: r.request_ref,
      createdAt: iso(r.created_at),
      company: r.company,
      user: r.user_name,
    })),
  };
}

export const healthThresholds = {
  agentHeartbeatSeconds: env.AGENT_HEARTBEAT_TIMEOUT_SECONDS,
  tallyStaleSeconds: env.TALLY_HEALTH_STALE_SECONDS,
};
