import { Alert, Box, Button, Card, Chip, CircularProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { applicationsApi, companiesApi } from '@/api/adminEndpoints';
import { toApiError } from '@/api/client';
import { reportsApi } from '@/api/reportEndpoints';
import type { ReportCatalogItem, ReportKey } from '@/api/reportTypes';
import { DataTable, type Column } from '@/components/data/DataTable';
import { useAuthStore } from '@/stores/auth';
import { brand } from '@/theme/theme';
import { formatNumber } from '@/utils/format';
import { ReportChartPanel } from './ReportChart';

function defaultDates() {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 3);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { dateFrom: iso(from), dateTo: iso(to) };
}

export function ReportViewer({
  catalog,
  lockedCompanyId,
  initialKey,
}: {
  catalog: ReportCatalogItem[];
  lockedCompanyId?: string | null;
  initialKey?: ReportKey;
}) {
  const canExport = useAuthStore((s) => s.hasPermission('reports.export'));
  const defaults = useMemo(() => defaultDates(), []);
  const [key, setKey] = useState<ReportKey>(initialKey ?? catalog[0]?.key ?? 'company-expenses');
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  const [companyId, setCompanyId] = useState(lockedCompanyId ?? '');
  const [applicationId, setApplicationId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (initialKey && initialKey !== key) {
      setKey(initialKey);
      setPage(1);
    }
  }, [initialKey]); // eslint-disable-line react-hooks/exhaustive-deps -- only react to parent catalog clicks

  useEffect(() => {
    if (lockedCompanyId) setCompanyId(lockedCompanyId);
  }, [lockedCompanyId]);

  const selected = catalog.find((c) => c.key === key) ?? catalog[0];
  const companies = useQuery({ queryKey: ['companies', 'reports'], queryFn: () => companiesApi.list({ pageSize: 100, sort: 'name', order: 'asc' }) });
  const apps = useQuery({ queryKey: ['applications', 'reports'], queryFn: () => applicationsApi.list({ pageSize: 100, sort: 'name', order: 'asc' }) });

  const filters = {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    companyId: (lockedCompanyId || companyId) || undefined,
    applicationId: selected?.supportsApplication ? applicationId || undefined : undefined,
    page,
    pageSize,
  };

  const report = useQuery({
    queryKey: ['reports', 'run', key, filters],
    queryFn: () => reportsApi.run(key, filters),
    enabled: Boolean(key),
    placeholderData: (p) => p,
  });

  const exportMut = useMutation({
    mutationFn: (format: 'csv' | 'xlsx' | 'pdf') => reportsApi.export(key, format, { ...filters, page: undefined, pageSize: undefined }),
    onMutate: () => setExportError(null),
    onError: (err) => setExportError(toApiError(err).message),
  });

  const columns: Column<Record<string, string | number | null>>[] =
    report.data?.columns.map((c) => ({
      key: c.key,
      header: c.label,
      render: (row) => {
        const v = row[c.key];
        return v == null || v === '' ? '—' : String(v);
      },
    })) ?? [];

  return (
    <Stack spacing={2.5}>
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: '2fr repeat(4, 1fr)' } }}>
        <TextField
          select
          size="small"
          label="Report"
          value={key}
          onChange={(e) => {
            setKey(e.target.value as ReportKey);
            setPage(1);
          }}
        >
          {catalog.map((r) => (
            <MenuItem key={r.key} value={r.key}>
              {r.title}
            </MenuItem>
          ))}
        </TextField>
        <TextField size="small" type="date" label={selected?.dateFieldLabel === 'N/A' ? 'Date from' : `${selected?.dateFieldLabel ?? 'Date'} from`} value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} slotProps={{ inputLabel: { shrink: true } }} disabled={selected?.dateFieldLabel === 'N/A'} />
        <TextField size="small" type="date" label="To" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} slotProps={{ inputLabel: { shrink: true } }} disabled={selected?.dateFieldLabel === 'N/A'} />
        {!lockedCompanyId && (
          <TextField select size="small" label="Company" value={companyId} onChange={(e) => { setCompanyId(e.target.value); setPage(1); }}>
            <MenuItem value="">All companies</MenuItem>
            {(companies.data?.items ?? []).map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
        )}
        {selected?.supportsApplication && (
          <TextField select size="small" label="Application" value={applicationId} onChange={(e) => { setApplicationId(e.target.value); setPage(1); }}>
            <MenuItem value="">All applications</MenuItem>
            {(apps.data?.items ?? []).map((a) => (
              <MenuItem key={a.id} value={a.id}>
                {a.name}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Box>

      {selected && (
        <Typography variant="body2" color="text.secondary">
          {selected.description}
        </Typography>
      )}

      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }} useFlexGap>
        {(report.data?.summary ?? []).map((s) => (
          <Chip key={s.label} label={`${s.label}: ${s.value}`} sx={{ fontWeight: 600, bgcolor: alpha(brand.indigo.main, 0.08) }} />
        ))}
        <Box sx={{ flex: 1 }} />
        {canExport && (
          <>
            <Button size="small" variant="outlined" startIcon={exportMut.isPending ? <CircularProgress size={14} /> : <FileText size={16} />} disabled={exportMut.isPending} onClick={() => exportMut.mutate('csv')}>
              CSV
            </Button>
            <Button size="small" variant="outlined" startIcon={<FileSpreadsheet size={16} />} disabled={exportMut.isPending} onClick={() => exportMut.mutate('xlsx')}>
              Excel
            </Button>
            <Button size="small" variant="contained" startIcon={<Download size={16} />} disabled={exportMut.isPending} onClick={() => exportMut.mutate('pdf')}>
              PDF
            </Button>
          </>
        )}
      </Stack>

      {exportError && (
        <Alert severity="error" onClose={() => setExportError(null)}>
          {exportError}
        </Alert>
      )}
      {report.isError && <Alert severity="error">{toApiError(report.error).message}</Alert>}

      {report.data?.chart && report.data.chart.points.length > 0 && <ReportChartPanel chart={report.data.chart} />}

      <Card sx={{ overflow: 'hidden' }}>
        <DataTable
          plain
          rows={(report.data?.rows ?? []).map((r, i) => ({ ...r, __row: `${page}-${i}` }))}
          rowKey={(row) => String(row.__row)}
          loading={report.isFetching}
          error={null}
          meta={report.data?.meta}
          onPageChange={(p, size) => {
            setPage(p);
            setPageSize(size);
          }}
          emptyTitle="No rows for these filters"
          emptyText="Widen the date range or clear the company / application filter."
          columns={columns.length ? columns : [{ key: '_', header: '—', render: () => '—' }]}
        />
      </Card>

      {report.data && (
        <Typography variant="caption" color="text.secondary">
          Showing {formatNumber(report.data.rows.length)} of {formatNumber(report.data.meta.total)} rows.
        </Typography>
      )}
    </Stack>
  );
}
