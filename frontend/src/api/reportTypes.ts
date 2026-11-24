export type ReportKey =
  | 'company-expenses'
  | 'application-expenses'
  | 'payment-vouchers'
  | 'posting-success'
  | 'failed-transactions'
  | 'pending-queue'
  | 'missing-ledgers'
  | 'ledger-mappings'
  | 'monthly-expenses'
  | 'integration-audit';

export interface ReportCatalogItem {
  key: ReportKey;
  title: string;
  description: string;
  supportsApplication: boolean;
  dateFieldLabel: string;
}

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

export interface ReportFilters {
  dateFrom?: string;
  dateTo?: string;
  companyId?: string;
  applicationId?: string;
  page?: number;
  pageSize?: number;
}
