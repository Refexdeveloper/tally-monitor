import { Alert, Box, Button, Card, Checkbox, Chip, CircularProgress, Divider, Menu, MenuItem, Skeleton, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, CircleX, FlaskConical, LayoutTemplate, Save, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Application, FieldMappingRow, IntakeOutcome, MappingPreview, TargetField, Transform } from '@/api/adminTypes';
import { intakeApi } from '@/api/adminEndpoints';
import { toApiError } from '@/api/client';
import { ConfirmDialog } from '@/components/common/Dialogs';
import { ErrorState } from '@/components/common/States';
import { useApiMutation } from '@/hooks/useApiMutation';
import { toast } from '@/stores/toast';
import { formatMoney } from '@/utils/format';
import { SAMPLE_CANONICAL_PAYLOAD } from './samplePayloads';

interface Row {
  enabled: boolean;
  sourcePath: string;
  transform: Transform | '';
  defaultValue: string;
  isRequired: boolean;
}

const emptyRow = (): Row => ({ enabled: false, sourcePath: '', transform: '', defaultValue: '', isRequired: false });

function toRows(fields: TargetField[], mappings: FieldMappingRow[]) {
  const by = new Map(mappings.map((m) => [m.targetField, m]));
  return Object.fromEntries(
    fields.map((f) => {
      const m = by.get(f.field);
      // Required fields are always part of the mapping.
      const row = m ? { enabled: true, sourcePath: m.sourcePath, transform: (m.transform ?? '') as Row['transform'], defaultValue: m.defaultValue ?? '', isRequired: Boolean(m.isRequired) } : { ...emptyRow(), enabled: f.required };
      return [f.field, row];
    }),
  ) as Record<string, Row>;
}

function toMappings(fields: TargetField[], rows: Record<string, Row>): FieldMappingRow[] {
  return fields
    .filter((f) => rows[f.field]?.enabled)
    .map((f) => {
      const r = rows[f.field]!;
      return { targetField: f.field, sourcePath: r.sourcePath.trim(), transform: r.transform || null, defaultValue: r.defaultValue || null, isRequired: r.isRequired };
    });
}

const CHECK_ICON = { PASS: CircleCheck, WARN: CircleAlert, FAIL: CircleX } as const;
const CHECK_COLOR = { PASS: 'success', WARN: 'warning', FAIL: 'error' } as const;

function PreviewResult({ preview }: { preview: MappingPreview }) {
  const theme = useTheme();
  const n = preview.normalized;
  return (
    <Stack spacing={1.5}>
      <Alert severity={preview.ok ? 'success' : 'error'} sx={{ borderRadius: 3 }}>
        {preview.ok ? 'This payload would be accepted.' : 'This payload would be rejected. See the issues below.'}
      </Alert>
      {[...preview.mappingIssues.map((i) => ({ ...i, kind: 'Mapping' })), ...preview.errors.map((i) => ({ ...i, kind: 'Error' }))].map((i, idx) => (
        <Typography key={idx} variant="body2" color="error">
          • <b>{i.field}</b>: {i.message}
        </Typography>
      ))}
      {preview.warnings.map((w, idx) => (
        <Typography key={`w${idx}`} variant="body2" color="warning.main">
          • <b>{w.field}</b>: {w.message}
        </Typography>
      ))}
      {preview.checks.map((c) => {
        const Icon = CHECK_ICON[c.status];
        const color = theme.palette[CHECK_COLOR[c.status]].main;
        return (
          <Stack key={c.name} direction="row" spacing={1} sx={{ alignItems: 'center', p: 1, borderRadius: 2, bgcolor: alpha(color, 0.08) }}>
            <Icon size={17} color={color} />
            <Typography variant="body2">
              <b>{c.name}:</b> {c.message}
            </Typography>
          </Stack>
        );
      })}
      {n && (
        <Box sx={{ p: 1.5, borderRadius: 3, border: `1px dashed ${theme.palette.divider}` }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Normalized expense
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75, fontSize: 13 }}>
            {[
              ['Source ID', n.sourceTransactionId],
              ['Request', n.requestNumber],
              ['Company key', n.companyKey],
              ['Date', n.expenseDate],
              ['Employee', [n.employeeName, n.employeeCode].filter(Boolean).join(' · ')],
              ['Category', n.expenseCategory],
              ['Amount', formatMoney(n.amount, n.currency ?? 'INR')],
              ['Approval', n.approvalStatus],
            ].map(([k, v]) => (
              <Typography key={k} variant="body2">
                <span style={{ color: theme.palette.text.secondary }}>{k}:</span> {v || '-'}
              </Typography>
            ))}
          </Box>
          <Table size="small" sx={{ mt: 1 }}>
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Category</TableCell>
                <TableCell align="right">Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {n.lineItems.map((l) => (
                <TableRow key={l.lineNo}>
                  <TableCell>{l.lineNo}</TableCell>
                  <TableCell>{l.category ?? '-'}</TableCell>
                  <TableCell align="right">{formatMoney(l.amount, n.currency ?? 'INR')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Stack>
  );
}

export function FieldMappingPanel({ app, canManage }: { app: Application; canManage: boolean }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const catalog = useQuery({ queryKey: ['mapping-catalog'], queryFn: intakeApi.catalog, staleTime: Infinity });
  const saved = useQuery({ queryKey: ['applications', 'detail', app.id, 'mappings'], queryFn: () => intakeApi.mappings(app.id) });
  const [rows, setRows] = useState<Record<string, Row> | null>(null);
  const [dirty, setDirty] = useState(false);
  const [templateAnchor, setTemplateAnchor] = useState<HTMLElement | null>(null);
  const [sample, setSample] = useState(() => JSON.stringify(SAMPLE_CANONICAL_PAYLOAD, null, 2));
  const [preview, setPreview] = useState<MappingPreview | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);

  const fields = useMemo(() => catalog.data?.fields ?? [], [catalog.data]);
  useEffect(() => {
    if (catalog.data && saved.data && !dirty) setRows(toRows(fields, saved.data));
  }, [catalog.data, saved.data, fields, dirty]);

  const save = useApiMutation(() => intakeApi.saveMappings(app.id, toMappings(fields, rows!)), {
    success: 'Field mapping saved',
    invalidate: [['applications', 'detail', app.id]],
    onSuccess: () => setDirty(false),
  });
  const runPreview = useApiMutation((payload: unknown) => intakeApi.preview(app.id, payload, toMappings(fields, rows!)), { onSuccess: (r) => setPreview(r) });
  const runImport = useApiMutation((payload: unknown) => intakeApi.importPayload(app.id, payload), {
    invalidate: [['expenses'], ['jobs'], ['applications'], ['dashboard']],
    onSuccess: (o: IntakeOutcome) => {
      setConfirmImport(false);
      if (o.status === 'ACCEPTED') {
        toast.success('Transaction imported and queued', 'Imported');
        if (o.expenseId) navigate(`/expenses/${o.expenseId}`);
      } else if (o.status === 'DUPLICATE') toast.info('Already received earlier; nothing changed.');
      else toast.error(o.message, 'Import rejected');
    },
  });

  const parseSample = () => {
    try {
      return JSON.parse(sample) as unknown;
    } catch {
      toast.error('Sample payload is not valid JSON');
      return undefined;
    }
  };

  if (catalog.error || saved.error) return <ErrorState message={toApiError(catalog.error ?? saved.error).message} compact />;
  if (!rows) return <Skeleton variant="rounded" height={420} sx={{ m: 3 }} />;

  const update = (field: string, patch: Partial<Row>) => {
    setRows((r) => ({ ...r!, [field]: { ...r![field]!, ...patch } }));
    setDirty(true);
  };
  const itemsEnabled = rows.lineItems?.enabled;
  const editable = canManage;

  const renderGroup = (group: 'header' | 'item') => (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell width={36} />
          <TableCell>Target field</TableCell>
          <TableCell>Source path</TableCell>
          <TableCell width={140}>Transform</TableCell>
          <TableCell width={140}>Default</TableCell>
          <TableCell width={70} align="center">
            Required
          </TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {fields
          .filter((f) => f.group === group)
          .map((f) => {
            const r = rows[f.field]!;
            const disabled = !editable || (group === 'item' && !itemsEnabled);
            return (
              <TableRow key={f.field} sx={{ opacity: r.enabled ? 1 : 0.6 }}>
                <TableCell padding="checkbox">
                  <Checkbox size="small" checked={r.enabled || f.required} disabled={disabled || f.required} onChange={(e) => update(f.field, { enabled: e.target.checked })} />
                </TableCell>
                <TableCell>
                  <Tooltip title={f.description} placement="top-start">
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {f.label} {f.required && <Chip size="small" label="required" sx={{ height: 18, fontSize: 10 }} color="primary" variant="outlined" />}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        {f.field}
                      </Typography>
                    </Box>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    fullWidth
                    placeholder={f.group === 'item' ? 'relative to each line' : 'e.g. Req_Entity|Billing_Entity'}
                    value={r.sourcePath}
                    disabled={disabled}
                    onChange={(e) => update(f.field, { sourcePath: e.target.value, enabled: true })}
                    slotProps={{ htmlInput: { style: { fontFamily: 'monospace', fontSize: 13 } } }}
                  />
                </TableCell>
                <TableCell>
                  <TextField select size="small" fullWidth value={r.transform} disabled={disabled} onChange={(e) => update(f.field, { transform: e.target.value as Transform, enabled: true })}>
                    <MenuItem value="">
                      <em>{f.transform} (default)</em>
                    </MenuItem>
                    {catalog.data!.transforms.map((t) => (
                      <MenuItem key={t} value={t}>
                        {t}
                      </MenuItem>
                    ))}
                  </TextField>
                </TableCell>
                <TableCell>
                  <TextField size="small" fullWidth value={r.defaultValue} disabled={disabled} onChange={(e) => update(f.field, { defaultValue: e.target.value, enabled: true })} />
                </TableCell>
                <TableCell align="center">
                  <Checkbox size="small" checked={f.required || r.isRequired} disabled={disabled || f.required} onChange={(e) => update(f.field, { isRequired: e.target.checked, enabled: true })} />
                </TableCell>
              </TableRow>
            );
          })}
      </TableBody>
    </Table>
  );

  return (
    <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', xl: '1.6fr 1fr' }, p: 3, alignItems: 'start' }}>
      <Box sx={{ minWidth: 0 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2, alignItems: { sm: 'center' } }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6">Payload field mapping</Typography>
            <Typography variant="body2" color="text.secondary">
              Paths use dots and [index]; use <code>a|b</code> to fall back to <code>b</code> when <code>a</code> is empty. Keys like <code>Table::Bulk_Expense_2</code> work as-is.
            </Typography>
          </Box>
          {editable && (
            <>
              <Button variant="outlined" startIcon={<LayoutTemplate size={16} />} onClick={(e) => setTemplateAnchor(e.currentTarget)}>
                Apply template
              </Button>
              <Button variant="contained" startIcon={save.isPending ? <CircularProgress size={16} color="inherit" /> : <Save size={16} />} disabled={!dirty || save.isPending} onClick={() => save.mutate(undefined)}>
                Save mapping
              </Button>
            </>
          )}
        </Stack>
        {saved.data && saved.data.length === 0 && !dirty && (
          <Alert severity="warning" sx={{ mb: 2, borderRadius: 3 }}>
            No mapping saved yet. Incoming items are rejected until a mapping is saved. Start from a template.
          </Alert>
        )}
        <Card variant="outlined" sx={{ boxShadow: 'none', overflowX: 'auto' }}>
          {renderGroup('header')}
        </Card>
        <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>
          Line item fields {!itemsEnabled && <Chip size="small" label="enable “Line items (array)” to use" sx={{ ml: 1 }} />}
        </Typography>
        <Card variant="outlined" sx={{ boxShadow: 'none', overflowX: 'auto' }}>
          {renderGroup('item')}
        </Card>
      </Box>

      <Card variant="outlined" sx={{ p: 2.5, boxShadow: 'none', position: { xl: 'sticky' }, top: { xl: 88 }, bgcolor: alpha(theme.palette.primary.main, 0.02) }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
          <FlaskConical size={18} color={theme.palette.primary.main} />
          <Typography variant="h6">Test with a sample payload</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Paste a Kissflow payload. The preview uses the mapping on the left (including unsaved changes) and writes nothing.
        </Typography>
        <TextField multiline minRows={12} maxRows={22} fullWidth value={sample} onChange={(e) => setSample(e.target.value)} slotProps={{ htmlInput: { style: { fontFamily: 'monospace', fontSize: 12 }, spellCheck: false } }} />
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
          <Button variant="contained" startIcon={runPreview.isPending ? <CircularProgress size={16} color="inherit" /> : <FlaskConical size={16} />} disabled={runPreview.isPending} onClick={() => { const p = parseSample(); if (p !== undefined) runPreview.mutate(p); }}>
            Run preview
          </Button>
          {editable && (
            <Tooltip title={dirty ? 'Save the mapping first' : 'Creates a real expense and queue job (still subject to validation and Finance approval)'}>
              <span>
                <Button variant="outlined" startIcon={<Upload size={16} />} disabled={dirty || !preview?.ok || app.status === 'INACTIVE'} onClick={() => setConfirmImport(true)}>
                  Import as real transaction
                </Button>
              </span>
            </Tooltip>
          )}
        </Stack>
        {preview && (
          <>
            <Divider sx={{ my: 2, borderStyle: 'dashed' }} />
            <PreviewResult preview={preview} />
          </>
        )}
      </Card>

      <Menu anchorEl={templateAnchor} open={Boolean(templateAnchor)} onClose={() => setTemplateAnchor(null)}>
        {catalog.data!.templates.map((t) => (
          <MenuItem
            key={t.id}
            onClick={() => {
              setRows(toRows(fields, t.mappings));
              setDirty(true);
              setTemplateAnchor(null);
              setPreview(null);
              toast.info(`Template "${t.name}" applied. Review and save.`);
            }}
            sx={{ display: 'block', whiteSpace: 'normal', maxWidth: 420, py: 1.25 }}
          >
            <Typography variant="subtitle2">{t.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {t.description}
            </Typography>
          </MenuItem>
        ))}
      </Menu>
      <ConfirmDialog
        open={confirmImport}
        title="Import this payload?"
        message="A real expense and processing job are created for the routed company. Nothing is posted to Tally until it passes validation and the Finance approval policy."
        confirmLabel="Import"
        loading={runImport.isPending}
        onConfirm={() => {
          const p = parseSample();
          if (p !== undefined) runImport.mutate(p);
        }}
        onClose={() => setConfirmImport(false)}
      />
    </Box>
  );
}
