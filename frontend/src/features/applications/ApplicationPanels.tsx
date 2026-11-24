import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, FormControlLabel, IconButton, MenuItem, Radio, RadioGroup, Stack, Switch, TextField, Tooltip, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, Link2, Pencil, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import type { Application, ApplicationCompanyLink, ApplicationType, AuthMethod, IntegrationMode, VoucherKind } from '@/api/adminTypes';
import { applicationsApi, companiesApi, intakeApi } from '@/api/adminEndpoints';
import { toApiError } from '@/api/client';
import { ConfirmDialog, CopyField, DialogHeader, SecretDialog } from '@/components/common/Dialogs';
import { DataTable } from '@/components/data/DataTable';
import { applyServerErrors, useApiMutation } from '@/hooks/useApiMutation';
import { formatDateTime, formatNumber, timeAgo } from '@/utils/format';
import { ActiveBadge } from '../shared/Badges';
import { APPLICATION_TYPE_LABELS, AUTH_LABELS, AUTH_OPTIONS, MODE_LABELS, VOUCHER_KIND_LABELS } from './appMeta';

const detailKey = (id: string) => ['applications', 'detail', id];

// --- Basics edit dialog ----------------------------------------------------

const basicsSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(150),
  description: z.string().max(1000),
  applicationType: z.string(),
  kissflowAccount: z.string().max(150),
  kissflowAppId: z.string().max(150),
  kissflowProcessId: z.string().max(150),
  defaultVoucherKind: z.string(),
});

export function ApplicationEditDialog({ app, open, onClose }: { app: Application; open: boolean; onClose: () => void }) {
  const { register, control, handleSubmit, setError, formState: { errors } } = useForm<z.infer<typeof basicsSchema>>({
    resolver: zodResolver(basicsSchema),
    values: {
      name: app.name,
      description: app.description ?? '',
      applicationType: app.applicationType,
      kissflowAccount: app.kissflowAccount ?? '',
      kissflowAppId: app.kissflowAppId ?? '',
      kissflowProcessId: app.kissflowProcessId ?? '',
      defaultVoucherKind: app.defaultVoucherKind ?? '',
    },
  });
  const save = useApiMutation(
    (v: z.infer<typeof basicsSchema>) =>
      applicationsApi.update(app.id, {
        name: v.name,
        description: v.description || null,
        applicationType: v.applicationType as ApplicationType,
        kissflowAccount: v.kissflowAccount || null,
        kissflowAppId: v.kissflowAppId || null,
        kissflowProcessId: v.kissflowProcessId || null,
        defaultVoucherKind: (v.defaultVoucherKind || null) as VoucherKind | null,
      }),
    { success: 'Application updated', invalidate: [['applications']], onSuccess: onClose },
  );
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogHeader title={`Edit ${app.name}`} subtitle={`Code ${app.code} cannot be changed because it is part of the webhook URL.`} onClose={onClose} />
      <DialogContent>
        <Box component="form" id="app-edit" onSubmit={handleSubmit((v) => save.mutate(v, { onError: (e) => applyServerErrors(e, setError as never) }))} sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, pt: 1 }}>
          <TextField {...register('name')} label="Name" error={!!errors.name} helperText={errors.name?.message} sx={{ gridColumn: '1 / -1' }} />
          <TextField {...register('description')} label="Description" multiline minRows={2} sx={{ gridColumn: '1 / -1' }} />
          <Controller
            name="applicationType"
            control={control}
            render={({ field }) => (
              <TextField {...field} select label="Application type">
                {Object.entries(APPLICATION_TYPE_LABELS).map(([k, v]) => (
                  <MenuItem key={k} value={k}>
                    {v}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Controller
            name="defaultVoucherKind"
            control={control}
            render={({ field }) => (
              <TextField {...field} select label="Default voucher type">
                <MenuItem value="">None</MenuItem>
                {Object.entries(VOUCHER_KIND_LABELS).map(([k, v]) => (
                  <MenuItem key={k} value={k} disabled={['SALES', 'CREDIT_NOTE', 'DEBIT_NOTE'].includes(k)}>
                    {v}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <TextField {...register('kissflowAccount')} label="Kissflow account" />
          <TextField {...register('kissflowAppId')} label="Kissflow application ID" />
          <TextField {...register('kissflowProcessId')} label="Process / flow ID" />
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2.5 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button type="submit" form="app-edit" variant="contained" disabled={save.isPending} startIcon={save.isPending ? <CircularProgress size={16} color="inherit" /> : <Save size={16} />}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// --- Integration configuration ---------------------------------------------

const integrationSchema = z.object({
  integrationMode: z.enum(['WEBHOOK', 'API', 'MANUAL']),
  authMethod: z.enum(['HMAC_SHA256', 'BEARER_TOKEN', 'API_KEY', 'NONE']),
  apiEndpoint: z.string().max(500),
  apiKeyId: z.string().max(200),
  apiKeySecret: z.string().max(500),
  bearerToken: z.string().max(4000),
});

export function IntegrationPanel({ app, canManage }: { app: Application; canManage: boolean }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const { control, register, handleSubmit, setValue, reset } = useForm<z.infer<typeof integrationSchema>>({
    resolver: zodResolver(integrationSchema),
    values: { integrationMode: app.integrationMode, authMethod: app.authMethod, apiEndpoint: app.apiEndpoint ?? '', apiKeyId: '', apiKeySecret: '', bearerToken: '' },
  });
  const v = useWatch({ control });

  const save = useApiMutation(
    (f: z.infer<typeof integrationSchema>) =>
      applicationsApi.update(app.id, {
        integrationMode: f.integrationMode,
        authMethod: f.authMethod,
        apiEndpoint: f.integrationMode === 'API' ? f.apiEndpoint : null,
        credentials:
          f.integrationMode === 'API' && (f.apiKeyId || f.apiKeySecret || f.bearerToken)
            ? f.authMethod === 'API_KEY'
              ? { apiKeyId: f.apiKeyId, apiKeySecret: f.apiKeySecret }
              : { bearerToken: f.bearerToken }
            : undefined,
      }),
    {
      success: 'Integration configuration saved',
      invalidate: [['applications']],
      onSuccess: (r) => {
        reset();
        if (r.webhookSecret) setSecret(r.webhookSecret);
      },
    },
  );
  const rotate = useApiMutation(() => applicationsApi.regenerateSecret(app.id), {
    success: 'New secret generated; the previous secret no longer works',
    invalidate: [detailKey(app.id)],
    onSuccess: (r) => {
      setConfirmRotate(false);
      setSecret(r.webhookSecret);
    },
  });

  const setMode = (mode: IntegrationMode) => {
    setValue('integrationMode', mode, { shouldDirty: true });
    setValue('authMethod', AUTH_OPTIONS[mode][0]!, { shouldDirty: true });
  };
  const storedCreds = app.credentials ?? [];

  return (
    <Box sx={{ p: 3 }}>
      <Stack spacing={3} sx={{ maxWidth: 860 }}>
        {app.integrationMode === 'WEBHOOK' && app.webhookUrl && (
          <Alert severity="info" sx={{ borderRadius: 3 }}>
            <b>Kissflow setup:</b> in the Kissflow integration, add a <b>Run JavaScript</b> step that builds the Tally Monitor payload (see <code>docs/KISSFLOW-SETUP.md</code>), then an <b>HTTP</b> step: method <code>POST</code>, the URL below, header <code>Content-Type: application/json</code>{' '}
            {app.authMethod === 'BEARER_TOKEN' ? (
              <>
                and <code>Authorization: Bearer &lt;webhook token&gt;</code>
              </>
            ) : (
              <>
                and <code>X-Signature: hex(HMAC-SHA256(secret, body))</code>
              </>
            )}
            , body = the Run Script output. Successful deliveries return <code>202</code>; duplicates return <code>200</code>; every request is listed under API Logs.
          </Alert>
        )}
        {app.integrationMode === 'API' && canManage && <SyncCard app={app} />}
        {app.integrationMode === 'WEBHOOK' && app.webhookUrl && (
          <Stack spacing={2}>
            <Typography variant="h6">Webhook endpoint</Typography>
            <CopyField label="Webhook URL" value={app.webhookUrl} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
              <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                {app.authMethod === 'HMAC_SHA256'
                  ? 'Kissflow must sign each request body with HMAC-SHA256 using the signing secret and send it in the X-Signature header.'
                  : 'Kissflow must send the token in the Authorization: Bearer header.'}{' '}
                {storedCreds.find((c) => c.type === 'WEBHOOK_SECRET') ? `Current secret ${storedCreds.find((c) => c.type === 'WEBHOOK_SECRET')!.hint}, created ${formatDateTime(storedCreds.find((c) => c.type === 'WEBHOOK_SECRET')!.createdAt)}.` : 'No secret yet.'}
              </Typography>
              {canManage && (
                <Button variant="outlined" color="warning" startIcon={<KeyRound size={16} />} onClick={() => setConfirmRotate(true)}>
                  Regenerate secret
                </Button>
              )}
            </Stack>
          </Stack>
        )}

        <Box component="form" onSubmit={handleSubmit((f) => save.mutate(f))}>
          <Typography variant="h6" sx={{ mb: 1.5 }}>
            Integration mode
          </Typography>
          <RadioGroup row value={v.integrationMode} onChange={(e) => setMode(e.target.value as IntegrationMode)}>
            {(Object.keys(MODE_LABELS) as IntegrationMode[]).map((m) => (
              <FormControlLabel key={m} value={m} control={<Radio />} label={MODE_LABELS[m].label} disabled={!canManage} />
            ))}
          </RadioGroup>
          <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5 }}>
            Authentication
          </Typography>
          <Controller
            name="authMethod"
            control={control}
            render={({ field }) => (
              <RadioGroup row value={field.value} onChange={(e) => field.onChange(e.target.value as AuthMethod)}>
                {AUTH_OPTIONS[v.integrationMode ?? 'WEBHOOK'].map((a) => (
                  <FormControlLabel key={a} value={a} control={<Radio />} label={AUTH_LABELS[a]} disabled={!canManage} />
                ))}
              </RadioGroup>
            )}
          />
          {v.integrationMode === 'API' && (
            <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, mt: 2 }}>
              <TextField {...register('apiEndpoint')} label="Kissflow API endpoint" disabled={!canManage} sx={{ gridColumn: '1 / -1' }} />
              {storedCreds.some((c) => c.type === 'API_KEY' || c.type === 'BEARER_TOKEN') && (
                <Alert severity="success" sx={{ gridColumn: '1 / -1', borderRadius: 3 }}>
                  Credentials stored ({storedCreds.filter((c) => c.type !== 'WEBHOOK_SECRET').map((c) => `${c.label ?? c.type} ${c.hint ?? ''}`).join(', ')}). Enter new values only to replace them.
                </Alert>
              )}
              {v.authMethod === 'API_KEY' ? (
                <>
                  <TextField {...register('apiKeyId')} label="New access key ID" autoComplete="off" disabled={!canManage} />
                  <TextField {...register('apiKeySecret')} label="New access key secret" type="password" autoComplete="new-password" disabled={!canManage} />
                </>
              ) : (
                <TextField {...register('bearerToken')} label="New bearer token" type="password" autoComplete="new-password" disabled={!canManage} sx={{ gridColumn: '1 / -1' }} />
              )}
            </Box>
          )}
          {canManage && (
            <Button type="submit" variant="contained" sx={{ mt: 3 }} disabled={save.isPending} startIcon={save.isPending ? <CircularProgress size={16} color="inherit" /> : <Save size={16} />}>
              Save configuration
            </Button>
          )}
        </Box>
      </Stack>
      <ConfirmDialog
        open={confirmRotate}
        title="Regenerate webhook secret?"
        message="The current secret stops working immediately. Update the Kissflow integration with the new secret right away to avoid rejected requests."
        confirmLabel="Regenerate"
        loading={rotate.isPending}
        onConfirm={() => rotate.mutate(undefined)}
        onClose={() => setConfirmRotate(false)}
      />
      <SecretDialog
        open={Boolean(secret)}
        title="New webhook secret"
        description="Update the Kissflow integration with this secret."
        fields={[{ label: 'Webhook URL', value: app.webhookUrl ?? '' }, { label: app.authMethod === 'HMAC_SHA256' ? 'HMAC signing secret' : 'Bearer token', value: secret ?? '', secret: true }]}
        onClose={() => setSecret(null)}
      />
    </Box>
  );
}

function SyncCard({ app }: { app: Application }) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof intakeApi.sync>> | null>(null);
  const sync = useApiMutation(() => intakeApi.sync(app.id), {
    invalidate: [['expenses'], ['jobs'], ['applications'], ['receipts'], ['dashboard']],
    onSuccess: (r) => setResult(r),
  });
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, p: 2, borderRadius: 3, border: (t) => `1px dashed ${t.palette.divider}` }}>
      <Box sx={{ flex: 1 }}>
        <Typography variant="subtitle1">Pull from Kissflow API</Typography>
        <Typography variant="body2" color="text.secondary">
          {result
            ? `Fetched ${result.fetched}: ${result.accepted} accepted, ${result.duplicate} duplicate, ${result.rejected} rejected, ${result.failed} failed.`
            : 'Fetches the first page (up to 200 items) from the endpoint and runs each item through the same intake pipeline as webhooks.'}
        </Typography>
      </Box>
      <Button variant="contained" startIcon={sync.isPending ? <CircularProgress size={16} color="inherit" /> : <RefreshCw size={16} />} disabled={sync.isPending || app.status !== 'ACTIVE'} onClick={() => sync.mutate(undefined)}>
        Sync now
      </Button>
    </Stack>
  );
}

// --- Connected companies ---------------------------------------------------

export function CompanyLinksPanel({ app, canManage }: { app: Application; canManage: boolean }) {
  const links = useQuery({ queryKey: [...detailKey(app.id), 'companies'], queryFn: () => applicationsApi.companies(app.id) });
  const allCompanies = useQuery({ queryKey: ['companies', 'all-active'], queryFn: () => companiesApi.list({ pageSize: 100, status: 'active', sort: 'name', order: 'asc' }), enabled: canManage });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ApplicationCompanyLink | null>(null);
  const [removing, setRemoving] = useState<ApplicationCompanyLink | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [key, setKey] = useState('');
  const invalidate = [['applications'], ['companies']];

  const add = useApiMutation(() => applicationsApi.addCompany(app.id, { companyId, sourceCompanyKey: key.trim() }), {
    success: 'Company connected',
    invalidate,
    onSuccess: () => {
      setAdding(false);
      setCompanyId('');
      setKey('');
    },
  });
  const update = useApiMutation((v: { link: ApplicationCompanyLink; body: { sourceCompanyKey?: string; isActive?: boolean } }) => applicationsApi.updateCompany(app.id, v.link.companyId, v.body), {
    success: 'Connection updated',
    invalidate,
    onSuccess: () => setEditing(null),
  });
  const remove = useApiMutation((link: ApplicationCompanyLink) => applicationsApi.removeCompany(app.id, link.companyId), {
    success: (r) => (r.mode === 'DEACTIVATED' ? 'Connection deactivated (kept for transaction history)' : 'Company disconnected'),
    invalidate,
    onSuccess: () => setRemoving(null),
  });

  const available = (allCompanies.data?.items ?? []).filter((c) => !links.data?.some((l) => l.companyId === c.id));

  return (
    <>
      <DataTable
        plain
        rows={links.data}
        loading={links.isFetching}
        error={links.error ? toApiError(links.error).message : null}
        onRetry={() => void links.refetch()}
        rowKey={(l) => l.companyId}
        emptyTitle="No companies connected"
        emptyText="Connect at least one company before activating this application."
        toolbar={
          canManage && (
            <Stack direction="row" sx={{ p: 2.5, justifyContent: 'flex-end' }}>
              <Button variant="contained" startIcon={<Link2 size={16} />} onClick={() => setAdding(true)} disabled={!allCompanies.data}>
                Connect company
              </Button>
            </Stack>
          )
        }
        columns={[
          {
            key: 'company',
            header: 'Company',
            render: (l) => (
              <>
                <Typography variant="subtitle2">{l.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {l.code} · Tally: {l.tallyCompanyName}
                </Typography>
              </>
            ),
          },
          { key: 'key', header: 'Source company key', render: (l) => <code>{l.sourceCompanyKey}</code> },
          { key: 'expenses', header: 'Expenses', align: 'right', render: (l) => formatNumber(l.expenses), hideBelow: 'sm' },
          { key: 'last', header: 'Last received', render: (l) => timeAgo(l.lastReceivedAt), hideBelow: 'md' },
          { key: 'status', header: 'Status', render: (l) => <ActiveBadge active={l.isActive && l.companyActive} inactiveLabel={l.companyActive ? 'Inactive' : 'Company inactive'} /> },
          ...(canManage
            ? [
                {
                  key: 'actions',
                  header: '',
                  align: 'right' as const,
                  render: (l: ApplicationCompanyLink) => (
                    <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => setEditing(l)}>
                          <Pencil size={16} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Disconnect">
                        <IconButton size="small" color="error" onClick={() => setRemoving(l)}>
                          <Trash2 size={16} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  ),
                },
              ]
            : []),
        ]}
      />

      <Dialog open={adding} onClose={() => setAdding(false)} maxWidth="xs" fullWidth>
        <DialogHeader title="Connect company" subtitle={app.name} onClose={() => setAdding(false)} />
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            <TextField
              select
              label="Company"
              value={companyId}
              onChange={(e) => {
                setCompanyId(e.target.value);
                const c = available.find((x) => x.id === e.target.value);
                if (c && !key) setKey(c.name.toUpperCase());
              }}
            >
              {available.length === 0 && <MenuItem disabled>All active companies are connected</MenuItem>}
              {available.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Source company key" value={key} onChange={(e) => setKey(e.target.value)} helperText="Value in the Kissflow payload that identifies this company" />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button color="inherit" onClick={() => setAdding(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => add.mutate(undefined)} disabled={!companyId || !key.trim() || add.isPending}>
            Connect
          </Button>
        </DialogActions>
      </Dialog>

      {editing && (
        <LinkEditDialog link={editing} pending={update.isPending} onClose={() => setEditing(null)} onSave={(body) => update.mutate({ link: editing, body })} />
      )}
      <ConfirmDialog
        open={Boolean(removing)}
        danger
        title={`Disconnect ${removing?.name}?`}
        message={removing?.expenses ? 'This connection has transaction history, so it will be deactivated rather than deleted. New expenses for this company will be rejected.' : 'New expenses for this company will be rejected.'}
        confirmLabel="Disconnect"
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
        onClose={() => setRemoving(null)}
      />
    </>
  );
}

function LinkEditDialog({ link, pending, onClose, onSave }: { link: ApplicationCompanyLink; pending: boolean; onClose: () => void; onSave: (b: { sourceCompanyKey: string; isActive: boolean }) => void }) {
  const [key, setKey] = useState(link.sourceCompanyKey);
  const [active, setActive] = useState(link.isActive);
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogHeader title="Edit connection" subtitle={link.name} onClose={onClose} />
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Source company key" value={key} onChange={(e) => setKey(e.target.value)} />
          <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />} label="Connection active" />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2.5 }}>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" disabled={!key.trim() || pending} onClick={() => onSave({ sourceCompanyKey: key.trim(), isActive: active })}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
