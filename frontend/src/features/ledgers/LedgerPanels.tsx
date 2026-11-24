import { Alert, Autocomplete, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, FormControlLabel, IconButton, MenuItem, Stack, Switch, TextField, Tooltip, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { BookPlus, Check, CircleCheck, Hammer, Link2, Pencil, Plus, Power, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import { useState } from 'react';
import type { LedgerMappingRow, LedgerRow, MasterRequest, MasterStatus, MissingLedger, UnmappedCategory } from '@/api/accountingTypes';
import { ledgersApi } from '@/api/accountingEndpoints';
import { companiesApi } from '@/api/adminEndpoints';
import { toApiError } from '@/api/client';
import { ConfirmDialog, DialogHeader } from '@/components/common/Dialogs';
import { DataTable } from '@/components/data/DataTable';
import { SearchToolbar } from '@/components/data/SearchToolbar';
import { useApiMutation } from '@/hooks/useApiMutation';
import { useListState } from '@/hooks/useListState';
import { useAuthStore } from '@/stores/auth';
import { formatMoney, formatNumber, humanize, timeAgo } from '@/utils/format';
import { ActiveBadge } from '../shared/Badges';

const INVALIDATE = [['ledgers'], ['ledger-mappings'], ['master-requests'], ['expenses'], ['dashboard']];

// --- Ledgers -----------------------------------------------------------------------

const SOURCE_LABEL: Record<LedgerRow['source'], { label: string; color: 'success' | 'default' | 'secondary' }> = {
  TALLY_SYNC: { label: 'Synced from Tally', color: 'success' },
  MANUAL_IMPORT: { label: 'Imported', color: 'default' },
  MASTER_REQUEST: { label: 'Master request', color: 'secondary' },
};

function ImportDialog({ companyId, open, onClose }: { companyId: string; open: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const run = useApiMutation(() => ledgersApi.importList(companyId, text), {
    success: (r) => `Imported: ${r.created} new, ${r.updated} updated, ${r.reactivated} reactivated${r.skipped.length ? `, ${r.skipped.length} skipped` : ''}`,
    invalidate: INVALIDATE,
    onSuccess: (r) => {
      if (!r.skipped.length) {
        setText('');
        onClose();
      }
    },
  });
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogHeader title="Import ledger list" subtitle="Paste one ledger per line: Name, then a TAB or comma, then the parent group (e.g. copied from Tally's List of Ledgers)." onClose={onClose} />
      <DialogContent>
        <Alert severity="info" sx={{ mb: 2, borderRadius: 3 }}>
          Imported ledgers are marked <b>Imported</b> until the Bridge Agent (Phase 6) syncs and confirms them from Tally. Existing names are updated, never duplicated.
        </Alert>
        <TextField
          multiline
          minRows={10}
          maxRows={20}
          fullWidth
          placeholder={'Travelling Expenses\tIndirect Expenses\nStaff Welfare\tIndirect Expenses\nHDFC Bank Current A/c\tBank Accounts'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          slotProps={{ htmlInput: { style: { fontFamily: 'monospace', fontSize: 13 }, spellCheck: false } }}
        />
        {run.data && run.data.skipped.length > 0 && (
          <Alert severity="warning" sx={{ mt: 2, borderRadius: 3 }}>
            Skipped: {run.data.skipped.slice(0, 8).map((s) => `line ${s.line} (${s.reason})`).join(', ')}
            {run.data.skipped.length > 8 ? '…' : ''}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2.5 }}>
        <Button color="inherit" onClick={onClose}>
          Close
        </Button>
        <Button variant="contained" disabled={!text.trim() || run.isPending} startIcon={run.isPending ? <CircularProgress size={16} color="inherit" /> : <Upload size={16} />} onClick={() => run.mutate(undefined)}>
          Import
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function LedgersTable({ companyId }: { companyId: string }) {
  const canManage = useAuthStore((s) => s.hasPermission('ledgers.manage'));
  const list = useListState({ pageSize: 25, sort: 'name', order: 'asc', status: 'active', source: 'all' });
  const [importing, setImporting] = useState(false);
  const q = useQuery({ queryKey: ['ledgers', companyId, list.params], queryFn: () => ledgersApi.list({ ...list.params, companyId }), placeholderData: (p) => p });
  const toggle = useApiMutation((l: LedgerRow) => ledgersApi.update(l.id, { isActive: !l.isActive }), { success: 'Ledger updated', invalidate: INVALIDATE });
  return (
    <>
      <DataTable
        plain
        rows={q.data?.items}
        rowKey={(l) => l.id}
        loading={q.isFetching}
        error={q.error ? toApiError(q.error).message : null}
        onRetry={() => void q.refetch()}
        meta={q.data?.meta}
        onPageChange={list.setPage}
        sort={{ key: list.params.sort, order: list.params.order ?? 'asc' }}
        onSortChange={list.setSort}
        emptyTitle="No ledgers for this company"
        emptyText="Import the ledger list from Tally now; the Bridge Agent will keep it in sync from Phase 6."
        emptyAction={canManage ? <Button variant="contained" startIcon={<Upload size={16} />} onClick={() => setImporting(true)}>Import ledgers</Button> : undefined}
        toolbar={
          <SearchToolbar value={list.params.search ?? ''} onChange={list.setSearch} placeholder="Search ledger or group">
            <TextField select size="small" label="Status" value={list.params.status} onChange={(e) => list.set({ status: e.target.value })} sx={{ minWidth: 130 }}>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="inactive">Inactive</MenuItem>
              <MenuItem value="all">All</MenuItem>
            </TextField>
            <TextField select size="small" label="Source" value={list.params.source} onChange={(e) => list.set({ source: e.target.value })} sx={{ minWidth: 170 }}>
              <MenuItem value="all">All sources</MenuItem>
              {Object.entries(SOURCE_LABEL).map(([k, v]) => (
                <MenuItem key={k} value={k}>
                  {v.label}
                </MenuItem>
              ))}
            </TextField>
            {canManage && (
              <Button variant="contained" startIcon={<Upload size={16} />} onClick={() => setImporting(true)}>
                Import
              </Button>
            )}
          </SearchToolbar>
        }
        columns={[
          { key: 'name', header: 'Ledger', sortKey: 'name', render: (l) => <Typography variant="subtitle2">{l.name}</Typography> },
          { key: 'group', header: 'Parent group', sortKey: 'parentGroup', render: (l) => l.parentGroup ?? '-', hideBelow: 'sm' },
          { key: 'source', header: 'Source', render: (l) => <Chip size="small" variant="outlined" color={SOURCE_LABEL[l.source].color} label={SOURCE_LABEL[l.source].label} />, hideBelow: 'md' },
          { key: 'verified', header: 'Verified in Tally', render: (l) => (l.lastVerifiedAt ? timeAgo(l.lastVerifiedAt) : <Typography variant="caption" color="text.secondary">not yet</Typography>), hideBelow: 'lg' },
          { key: 'mappings', header: 'Mappings', align: 'right', render: (l) => formatNumber(l.mappings), hideBelow: 'sm' },
          { key: 'status', header: 'Status', render: (l) => <ActiveBadge active={l.isActive} /> },
          ...(canManage
            ? [
                {
                  key: 'actions',
                  header: '',
                  align: 'right' as const,
                  render: (l: LedgerRow) => (
                    <Tooltip title={l.isActive ? 'Deactivate (not in Tally any more)' : 'Reactivate'}>
                      <IconButton size="small" onClick={() => toggle.mutate(l)} color={l.isActive ? 'default' : 'success'}>
                        <Power size={16} />
                      </IconButton>
                    </Tooltip>
                  ),
                },
              ]
            : []),
        ]}
      />
      <ImportDialog companyId={companyId} open={importing} onClose={() => setImporting(false)} />
    </>
  );
}

// --- Mappings ----------------------------------------------------------------------

function LedgerAutocomplete({ companyId, value, onChange, error }: { companyId: string; value: string; onChange: (v: string) => void; error?: string }) {
  const [input, setInput] = useState(value);
  const q = useQuery({ queryKey: ['ledgers', companyId, 'ac', input], queryFn: () => ledgersApi.list({ companyId, search: input, pageSize: 30, sort: 'name', order: 'asc' }), placeholderData: (p) => p });
  const options = q.data?.items.map((l) => l.name) ?? [];
  const exists = options.some((o) => o.toLowerCase() === value.trim().toLowerCase());
  return (
    <Autocomplete
      freeSolo
      options={options}
      value={value}
      inputValue={input}
      onInputChange={(_, v) => {
        setInput(v);
        onChange(v);
      }}
      onChange={(_, v) => onChange(v ?? '')}
      renderInput={(p) => (
        <TextField
          {...p}
          label="Tally ledger"
          error={!!error}
          helperText={error ?? (value.trim() && !exists && !q.isFetching ? 'Not found among this company’s ledgers; validation will raise a master creation request.' : 'Pick an existing Tally ledger')}
        />
      )}
    />
  );
}

export function MappingDialog({ companyId, mapping, preset, onClose }: { companyId: string; mapping: LedgerMappingRow | null; preset?: { category: string }; onClose: () => void }) {
  const apps = useQuery({ queryKey: ['companies', 'detail', companyId, 'apps'], queryFn: () => companiesApi.applications(companyId) });
  const [category, setCategory] = useState(mapping?.sourceCategory ?? preset?.category ?? '');
  const [ledger, setLedger] = useState(mapping?.tallyLedgerName ?? '');
  const [appId, setAppId] = useState(mapping?.application?.id ?? '');
  const [costCentre, setCostCentre] = useState(mapping?.costCentre ?? '');
  const [active, setActive] = useState(mapping?.isActive ?? true);
  const save = useApiMutation(
    () => {
      const body = { applicationId: appId || null, sourceCategory: category.trim(), tallyLedgerName: ledger.trim(), costCentre: costCentre.trim() || null, isActive: active };
      return mapping ? ledgersApi.updateMapping(mapping.id, body) : ledgersApi.createMapping({ ...body, companyId });
    },
    { success: mapping ? 'Mapping updated' : 'Mapping created', invalidate: INVALIDATE, onSuccess: onClose },
  );
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogHeader title={mapping ? 'Edit ledger mapping' : 'Map category to ledger'} subtitle="Mappings are company-specific. An application-specific mapping overrides the company-wide one." onClose={onClose} />
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField label="Kissflow expense category" value={category} onChange={(e) => setCategory(e.target.value)} helperText="Exactly as it arrives in the payload, e.g. Food Claim" autoFocus={!preset} />
          <LedgerAutocomplete companyId={companyId} value={ledger} onChange={setLedger} />
          <TextField select label="Applies to" value={appId} onChange={(e) => setAppId(e.target.value)}>
            <MenuItem value="">All applications (company-wide)</MenuItem>
            {apps.data?.map((a) => (
              <MenuItem key={a.applicationId} value={a.applicationId}>
                Only {a.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Default cost centre" value={costCentre} onChange={(e) => setCostCentre(e.target.value)} helperText="Optional; used when the voucher configuration allocates cost centres" />
          <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />} label="Active" />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2.5 }}>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" disabled={!category.trim() || !ledger.trim() || save.isPending} onClick={() => save.mutate(undefined)}>
          Save mapping
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function MappingsPanel({ companyId }: { companyId: string }) {
  const canManage = useAuthStore((s) => s.hasPermission('ledgers.manage'));
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<LedgerMappingRow | null | 'new'>(null);
  const [deleting, setDeleting] = useState<LedgerMappingRow | null>(null);
  const q = useQuery({ queryKey: ['ledger-mappings', companyId, search], queryFn: () => ledgersApi.mappings(companyId, search), placeholderData: (p) => p });
  const remove = useApiMutation((m: LedgerMappingRow) => ledgersApi.deleteMapping(m.id), { success: 'Mapping deleted', invalidate: INVALIDATE, onSuccess: () => setDeleting(null) });
  return (
    <>
      <DataTable
        plain
        rows={q.data}
        rowKey={(m) => m.id}
        loading={q.isFetching}
        error={q.error ? toApiError(q.error).message : null}
        onRetry={() => void q.refetch()}
        emptyTitle="No ledger mappings"
        emptyText="Map each Kissflow expense category to the Tally ledger it should be debited to."
        toolbar={
          <SearchToolbar value={search} onChange={setSearch} placeholder="Search category or ledger">
            {canManage && (
              <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setEditing('new')}>
                Add mapping
              </Button>
            )}
          </SearchToolbar>
        }
        columns={[
          { key: 'cat', header: 'Kissflow category', render: (m) => <Typography variant="subtitle2">{m.sourceCategory}</Typography> },
          {
            key: 'ledger',
            header: 'Tally ledger',
            render: (m) => (
              <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
                <span>{m.tallyLedgerName}</span>
                {!m.ledgerExists && <Chip size="small" color="warning" variant="outlined" label="Ledger not in Tally list" />}
              </Stack>
            ),
          },
          { key: 'scope', header: 'Applies to', render: (m) => m.application?.name ?? <Typography variant="caption" color="text.secondary">All applications</Typography>, hideBelow: 'md' },
          { key: 'cc', header: 'Cost centre', render: (m) => m.costCentre ?? '-', hideBelow: 'lg' },
          { key: 'by', header: 'Updated', render: (m) => `${m.updatedBy ?? 'system'} · ${timeAgo(m.updatedAt)}`, hideBelow: 'lg' },
          { key: 'status', header: 'Status', render: (m) => <ActiveBadge active={m.isActive} /> },
          ...(canManage
            ? [
                {
                  key: 'actions',
                  header: '',
                  align: 'right' as const,
                  render: (m: LedgerMappingRow) => (
                    <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                      <IconButton size="small" onClick={() => setEditing(m)} aria-label="Edit">
                        <Pencil size={16} />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => setDeleting(m)} aria-label="Delete">
                        <Trash2 size={16} />
                      </IconButton>
                    </Stack>
                  ),
                },
              ]
            : []),
        ]}
      />
      {editing !== null && <MappingDialog companyId={companyId} mapping={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        danger
        title={`Delete mapping for “${deleting?.sourceCategory}”?`}
        message="Unposted expenses with this category will need a new mapping before they can be posted."
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

// --- Unmapped categories & missing ledgers ------------------------------------------------

export function UnmappedPanel({ companyId }: { companyId: string }) {
  const canManage = useAuthStore((s) => s.hasPermission('ledgers.manage'));
  const [mapping, setMapping] = useState<UnmappedCategory | null>(null);
  const q = useQuery({ queryKey: ['ledgers', companyId, 'unmapped'], queryFn: () => ledgersApi.unmapped(companyId) });
  return (
    <>
      <DataTable
        plain
        rows={q.data}
        rowKey={(u) => u.category}
        loading={q.isFetching}
        error={q.error ? toApiError(q.error).message : null}
        onRetry={() => void q.refetch()}
        emptyTitle="Every category is mapped"
        emptyText="No unposted expense uses a category without a ledger mapping."
        columns={[
          { key: 'cat', header: 'Category', render: (u) => <Typography variant="subtitle2">{u.category}</Typography> },
          { key: 'apps', header: 'Applications', render: (u) => u.applications ?? '-', hideBelow: 'md' },
          { key: 'exp', header: 'Expenses waiting', align: 'right', render: (u) => formatNumber(u.expenses) },
          { key: 'amt', header: 'Amount', align: 'right', render: (u) => formatMoney(u.amount, u.currency) },
          { key: 'seen', header: 'Last seen', render: (u) => timeAgo(u.lastSeenAt), hideBelow: 'sm' },
          ...(canManage
            ? [{ key: 'map', header: '', align: 'right' as const, render: (u: UnmappedCategory) => <Button size="small" startIcon={<Link2 size={15} />} onClick={() => setMapping(u)}>Map</Button> }]
            : []),
        ]}
      />
      {mapping && <MappingDialog companyId={companyId} mapping={null} preset={{ category: mapping.category }} onClose={() => setMapping(null)} />}
    </>
  );
}

function RequestDialog({ companyId, preset, onClose }: { companyId: string; preset: { name: string; parent: string } | null; onClose: () => void }) {
  const [name, setName] = useState(preset?.name ?? '');
  const [parent, setParent] = useState(preset?.parent ?? 'Indirect Expenses');
  const [type, setType] = useState<'LEDGER' | 'PARTY_LEDGER' | 'BANK_LEDGER'>('LEDGER');
  const [notes, setNotes] = useState('');
  const save = useApiMutation(() => ledgersApi.createRequest({ companyId, masterType: type, proposedName: name.trim(), proposedParent: parent.trim(), notes: notes || null }), {
    success: 'Master creation request raised for Finance review',
    invalidate: INVALIDATE,
    onSuccess: onClose,
  });
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogHeader title="Request a new ledger" subtitle="A Finance Approver reviews the name and group before anything is created in Tally." onClose={onClose} />
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField label="Ledger name (as it should appear in Tally)" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <TextField label="Under group" value={parent} onChange={(e) => setParent(e.target.value)} helperText="e.g. Indirect Expenses, Sundry Creditors, Duties & Taxes" />
          <TextField select label="Type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <MenuItem value="LEDGER">Ledger</MenuItem>
            <MenuItem value="PARTY_LEDGER">Party ledger</MenuItem>
            <MenuItem value="BANK_LEDGER">Bank ledger</MenuItem>
          </TextField>
          <TextField label="Notes for Finance" value={notes} onChange={(e) => setNotes(e.target.value)} multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2.5 }}>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" disabled={!name.trim() || !parent.trim() || save.isPending} onClick={() => save.mutate(undefined)}>
          Raise request
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function MissingLedgersPanel({ companyId }: { companyId: string }) {
  const canRequest = useAuthStore((s) => s.hasPermission('masters.request'));
  const [requesting, setRequesting] = useState<{ name: string; parent: string } | null>(null);
  const q = useQuery({ queryKey: ['ledgers', companyId, 'missing'], queryFn: () => ledgersApi.missing(companyId) });
  return (
    <>
      <DataTable
        plain
        rows={q.data}
        rowKey={(m) => m.name}
        loading={q.isFetching}
        error={q.error ? toApiError(q.error).message : null}
        onRetry={() => void q.refetch()}
        emptyTitle="No missing ledgers"
        emptyText="Every ledger referenced by mappings and voucher rules exists in this company's ledger list."
        columns={[
          { key: 'name', header: 'Ledger', render: (m) => <Typography variant="subtitle2">{m.name}</Typography> },
          { key: 'used', header: 'Used by', render: (m) => m.usedBy },
          { key: 'req', header: 'Request', render: (m) => (m.openRequest ? <Chip size="small" color="secondary" label={humanize(m.openRequest.status)} /> : <Typography variant="caption" color="text.secondary">none</Typography>) },
          ...(canRequest
            ? [
                {
                  key: 'act',
                  header: '',
                  align: 'right' as const,
                  render: (m: MissingLedger) =>
                    m.openRequest ? null : (
                      <Button size="small" startIcon={<BookPlus size={15} />} onClick={() => setRequesting({ name: m.name, parent: m.usedBy.startsWith('Credit') ? 'Current Liabilities' : m.usedBy.startsWith('Tax') ? 'Duties & Taxes' : 'Indirect Expenses' })}>
                        Request creation
                      </Button>
                    ),
                },
              ]
            : []),
        ]}
      />
      {requesting && <RequestDialog companyId={companyId} preset={requesting} onClose={() => setRequesting(null)} />}
    </>
  );
}

// --- Master requests ---------------------------------------------------------------

const STATUS_COLOR: Record<MasterStatus, 'warning' | 'info' | 'error' | 'success' | 'secondary' | 'default'> = {
  PENDING_REVIEW: 'warning',
  APPROVED: 'info',
  REJECTED: 'error',
  CREATING: 'secondary',
  CREATED: 'success',
  VERIFIED: 'success',
  FAILED: 'error',
};

export function MasterRequestsPanel({ companyId }: { companyId: string | null }) {
  const me = useAuthStore((s) => s.user);
  const canApprove = useAuthStore((s) => s.hasPermission('masters.approve'));
  const canRequest = useAuthStore((s) => s.hasPermission('masters.request'));
  const list = useListState({ pageSize: 25, status: 'open' });
  const [reviewing, setReviewing] = useState<{ r: MasterRequest; decision: 'approve' | 'reject' } | null>(null);
  const [notes, setNotes] = useState('');
  const [editing, setEditing] = useState<MasterRequest | null>(null);
  const [creating, setCreating] = useState<MasterRequest | null>(null);
  const [newRequest, setNewRequest] = useState(false);
  const q = useQuery({ queryKey: ['master-requests', companyId, list.params], queryFn: () => ledgersApi.requests({ ...list.params, companyId: companyId ?? undefined }), placeholderData: (p) => p });

  const review = useApiMutation((v: { r: MasterRequest; decision: 'approve' | 'reject' }) => (v.decision === 'approve' ? ledgersApi.approve(v.r.id, notes || undefined) : ledgersApi.reject(v.r.id, notes)), {
    success: (r) => (r.status === 'APPROVED' ? 'Approved; it will be created by the Bridge Agent (or mark it created once done in Tally)' : 'Request rejected'),
    invalidate: INVALIDATE,
    onSuccess: () => {
      setReviewing(null);
      setNotes('');
    },
  });
  const markCreated = useApiMutation((r: MasterRequest) => ledgersApi.markCreated(r.id), { success: 'Ledger registered; revalidate blocked expenses to continue', invalidate: INVALIDATE, onSuccess: () => setCreating(null) });
  const retryCreation = useApiMutation((r: MasterRequest) => ledgersApi.retryCreation(r.id), { success: 'Sent back to the Bridge Agent for creation', invalidate: INVALIDATE });

  return (
    <>
      <DataTable
        plain
        rows={q.data?.items}
        rowKey={(r) => r.id}
        loading={q.isFetching}
        error={q.error ? toApiError(q.error).message : null}
        onRetry={() => void q.refetch()}
        meta={q.data?.meta}
        onPageChange={list.setPage}
        emptyTitle="No master requests"
        emptyText="Requests appear when validation finds a missing ledger or when someone raises one."
        toolbar={
          <SearchToolbar value={list.params.search ?? ''} onChange={list.setSearch} placeholder="Search proposed ledger">
            <TextField select size="small" label="Status" value={list.params.status} onChange={(e) => list.set({ status: e.target.value })} sx={{ minWidth: 170 }}>
              <MenuItem value="open">Open</MenuItem>
              {(Object.keys(STATUS_COLOR) as MasterStatus[]).map((s) => (
                <MenuItem key={s} value={s}>
                  {humanize(s)}
                </MenuItem>
              ))}
              <MenuItem value="all">All</MenuItem>
            </TextField>
            {canRequest && companyId && (
              <Button variant="contained" startIcon={<BookPlus size={16} />} onClick={() => setNewRequest(true)}>
                Request ledger
              </Button>
            )}
          </SearchToolbar>
        }
        columns={[
          {
            key: 'name',
            header: 'Proposed master',
            render: (r) => (
              <>
                <Typography variant="subtitle2">{r.proposedName}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {humanize(r.masterType)} under {r.proposedParent ?? '-'}
                  {r.sourceValue ? ` · from “${r.sourceValue}”` : ''}
                </Typography>
              </>
            ),
          },
          ...(companyId ? [] : [{ key: 'company', header: 'Company', render: (r: MasterRequest) => r.company.name }]),
          { key: 'why', header: 'Reason', render: (r) => (r.status === 'FAILED' && r.details?.error ? `Tally: ${r.details.error}` : (r.details?.reason ?? r.details?.notes ?? '-')), hideBelow: 'lg' },
          { key: 'by', header: 'Raised by', render: (r) => `${r.requestedBy ?? 'Validation'} · ${timeAgo(r.createdAt)}`, hideBelow: 'md' },
          {
            key: 'status',
            header: 'Status',
            render: (r) => (
              <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
                <Chip size="small" color={STATUS_COLOR[r.status]} label={humanize(r.status)} />
                {r.reviewedBy && (
                  <Typography variant="caption" color="text.secondary">
                    {r.reviewedBy} {r.reviewNotes ? `· ${r.reviewNotes}` : ''}
                  </Typography>
                )}
              </Stack>
            ),
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (r) => {
              const own = r.requestedById === me?.uuid;
              return (
                <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                  {r.status === 'PENDING_REVIEW' && canRequest && (
                    <Tooltip title="Edit name or group">
                      <IconButton size="small" onClick={() => setEditing(r)}>
                        <Pencil size={16} />
                      </IconButton>
                    </Tooltip>
                  )}
                  {r.status === 'PENDING_REVIEW' && canApprove && (
                    <>
                      <Tooltip title={own ? 'You raised this request; another approver must review it' : 'Approve'}>
                        <span>
                          <IconButton size="small" color="success" disabled={own} onClick={() => setReviewing({ r, decision: 'approve' })}>
                            <Check size={17} />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title={own ? 'You raised this request' : 'Reject'}>
                        <span>
                          <IconButton size="small" color="error" disabled={own} onClick={() => setReviewing({ r, decision: 'reject' })}>
                            <X size={17} />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </>
                  )}
                  {r.status === 'APPROVED' && canApprove && (
                    <Tooltip title="I have created this ledger in Tally">
                      <IconButton size="small" color="primary" onClick={() => setCreating(r)}>
                        <Hammer size={16} />
                      </IconButton>
                    </Tooltip>
                  )}
                  {r.status === 'FAILED' && canApprove && (
                    <Tooltip title={`${r.details?.error ? `Tally: ${r.details.error}. ` : ''}Fix the cause (e.g. group name), then send it to the Bridge Agent again`}>
                      <span>
                        <IconButton size="small" color="warning" disabled={retryCreation.isPending} onClick={() => retryCreation.mutate(r)}>
                          <RotateCcw size={16} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}
                  {(r.status === 'CREATED' || r.status === 'VERIFIED') && <CircleCheck size={18} color="green" />}
                </Stack>
              );
            },
          },
        ]}
      />

      <Dialog open={Boolean(reviewing)} onClose={() => setReviewing(null)} maxWidth="xs" fullWidth>
        <DialogHeader title={reviewing?.decision === 'approve' ? 'Approve master creation' : 'Reject master creation'} subtitle={`${reviewing?.r.proposedName} under ${reviewing?.r.proposedParent}`} onClose={() => setReviewing(null)} />
        <DialogContent>
          {reviewing?.decision === 'approve' && (
            <Alert severity="info" sx={{ mb: 2, borderRadius: 3 }}>
              Approval authorizes creating exactly this ledger in <b>{reviewing.r.company.name}</b>. Edit the name or group first if needed.
            </Alert>
          )}
          <TextField label={reviewing?.decision === 'reject' ? 'Reason (required)' : 'Notes (optional)'} value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth multiline minRows={2} />
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button color="inherit" onClick={() => setReviewing(null)}>
            Cancel
          </Button>
          <Button variant="contained" color={reviewing?.decision === 'approve' ? 'success' : 'error'} disabled={review.isPending || (reviewing?.decision === 'reject' && !notes.trim())} onClick={() => reviewing && review.mutate(reviewing)}>
            {reviewing?.decision === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>

      {editing && <EditRequestDialog request={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(creating)}
        title={`Mark “${creating?.proposedName}” as created?`}
        message={
          <>
            Confirm this ledger now exists in <b>{creating?.company.name}</b> under <b>{creating?.proposedParent}</b>. It is registered as unverified until the Bridge Agent reads it back from Tally.
          </>
        }
        confirmLabel="Mark created"
        loading={markCreated.isPending}
        onConfirm={() => creating && markCreated.mutate(creating)}
        onClose={() => setCreating(null)}
      />
      {newRequest && companyId && <RequestDialog companyId={companyId} preset={null} onClose={() => setNewRequest(false)} />}
    </>
  );
}

function EditRequestDialog({ request, onClose }: { request: MasterRequest; onClose: () => void }) {
  const [name, setName] = useState(request.proposedName);
  const [parent, setParent] = useState(request.proposedParent ?? '');
  const save = useApiMutation(() => ledgersApi.editRequest(request.id, { proposedName: name.trim(), proposedParent: parent.trim() }), { success: 'Request updated', invalidate: INVALIDATE, onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogHeader title="Edit proposed master" onClose={onClose} />
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Ledger name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="Under group" value={parent} onChange={(e) => setParent(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2.5 }}>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" disabled={!name.trim() || !parent.trim() || save.isPending} onClick={() => save.mutate(undefined)}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}