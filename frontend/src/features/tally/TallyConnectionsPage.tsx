import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, Card, Chip, CircularProgress, Dialog, DialogActions, DialogContent, Divider, FormControlLabel, IconButton, MenuItem, Skeleton, Stack, Switch, TextField, Tooltip, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertTriangle, Bot, CheckCircle2, KeyRound, Pencil, PlugZap, Plus, Server, ShieldOff, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Agent, CheckResult, TallyServer } from '@/api/adminTypes';
import { tallyApi } from '@/api/adminEndpoints';
import { toApiError } from '@/api/client';
import { CheckResultsDialog, ConfirmDialog, DialogHeader, SecretDialog } from '@/components/common/Dialogs';
import { IconTile } from '@/components/common/IconTile';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState } from '@/components/common/States';
import { DataTable } from '@/components/data/DataTable';
import { applyServerErrors, useApiMutation } from '@/hooks/useApiMutation';
import { useAuthStore } from '@/stores/auth';
import { brand } from '@/theme/theme';
import { timeAgo } from '@/utils/format';
import { AgentStatusBadge, ServerStatusBadge } from '../shared/Badges';

const serverSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(120),
  host: z.string().trim().min(1, 'Host is required').max(255).regex(/^[A-Za-z0-9.-]+$/, 'Hostname or IPv4 address'),
  port: z.coerce.number<string>().int().min(1).max(65535),
  protocol: z.enum(['HTTP', 'HTTPS']),
  tallyRelease: z.string().max(32),
  integrationAgentId: z.string(),
  isActive: z.boolean(),
});
type ServerForm = z.input<typeof serverSchema>;

function ServerDialog({ open, server, agents, onClose }: { open: boolean; server: TallyServer | null; agents: Agent[]; onClose: () => void }) {
  const { register, control, handleSubmit, setError, formState: { errors } } = useForm<ServerForm, unknown, z.output<typeof serverSchema>>({
    resolver: zodResolver(serverSchema),
    values: {
      name: server?.name ?? '',
      host: server?.host ?? '',
      port: String(server?.port ?? 9000),
      protocol: server?.protocol ?? 'HTTP',
      tallyRelease: server?.tallyRelease ?? '7.1',
      integrationAgentId: server?.agent?.id ?? '',
      isActive: server?.isActive ?? true,
    },
  });
  const save = useApiMutation(
    (v: z.output<typeof serverSchema>) => {
      const body = { ...v, tallyRelease: v.tallyRelease || null, integrationAgentId: v.integrationAgentId || null };
      return server ? tallyApi.updateServer(server.id, body) : tallyApi.createServer(body);
    },
    { success: server ? 'Tally connection updated' : 'Tally connection added', invalidate: [['tally'], ['companies'], ['dashboard']], onSuccess: onClose },
  );
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogHeader title={server ? `Edit ${server.name}` : 'Add Tally connection'} subtitle="Internal TallyPrime endpoint, reached only through a Bridge Agent." onClose={onClose} />
      <DialogContent>
        <Box component="form" id="server-form" onSubmit={handleSubmit((v) => save.mutate(v, { onError: (e) => applyServerErrors(e, setError as never) }))} sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr' }, pt: 1 }}>
          <TextField {...register('name')} label="Connection name" error={!!errors.name} helperText={errors.name?.message} sx={{ gridColumn: '1 / -1' }} autoFocus />
          <TextField {...register('host')} label="Server IP / host" placeholder="192.168.1.127" error={!!errors.host} helperText={errors.host?.message} />
          <TextField {...register('port')} label="HTTP port" type="number" error={!!errors.port} helperText={errors.port?.message} />
          <Controller
            name="protocol"
            control={control}
            render={({ field }) => (
              <TextField {...field} select label="Protocol">
                <MenuItem value="HTTP">HTTP</MenuItem>
                <MenuItem value="HTTPS">HTTPS</MenuItem>
              </TextField>
            )}
          />
          <TextField {...register('tallyRelease')} label="Tally release" placeholder="7.1" />
          <Controller
            name="integrationAgentId"
            control={control}
            render={({ field }) => (
              <TextField {...field} select label="Bridge Agent" helperText={agents.length ? 'Agent on the same network as TallyPrime' : 'Register an agent below first'} sx={{ gridColumn: '1 / -1' }}>
                <MenuItem value="">Not assigned</MenuItem>
                {agents.filter((a) => a.status !== 'REVOKED').map((a) => (
                  <MenuItem key={a.id} value={a.id}>
                    {a.name} ({a.agentKey})
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
          <Controller name="isActive" control={control} render={({ field }) => <FormControlLabel control={<Switch checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />} label="Active" />} />
          <Alert severity="info" sx={{ gridColumn: '1 / -1', borderRadius: 3 }}>
            This address is stored server-side and used only by the Bridge Agent. TallyPrime's port is never exposed to the internet.
          </Alert>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2.5 }}>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" form="server-form" variant="contained" disabled={save.isPending} startIcon={save.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {server ? 'Save' : 'Add connection'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ServerCard({ s, index, canManage, onEdit, onTest, testing }: { s: TallyServer; index: number; canManage: boolean; onEdit: () => void; onTest: () => void; testing: boolean }) {
  const theme = useTheme();
  return (
    <Card component={motion.div} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <IconTile icon={Server} color={brand.orange.main} size={44} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" noWrap>
            {s.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
            {s.protocol.toLowerCase()}://{s.host}:{s.port} {s.tallyRelease ? `· TallyPrime ${s.tallyRelease}` : ''}
          </Typography>
        </Box>
        <ServerStatusBadge status={s.effectiveStatus} />
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, p: 1.5, borderRadius: 3, bgcolor: alpha(theme.palette.text.secondary, 0.06) }}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Bridge Agent
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {s.agent ? `${s.agent.name} · ${s.agent.online ? 'online' : 'offline'}` : 'Not assigned'}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Last health check
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {s.lastHealthCheckAt ? timeAgo(s.lastHealthCheckAt) : 'Never'}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Last successful connection
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {s.lastSuccessAt ? timeAgo(s.lastSuccessAt) : 'Never'}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Companies
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {s.companies.length}
          </Typography>
        </Box>
      </Box>
      {s.lastError && (
        <Alert severity="error" sx={{ borderRadius: 3 }}>
          {s.lastError}
        </Alert>
      )}
      <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }} useFlexGap>
        {s.companies.map((c) => (
          <Chip
            key={c.id}
            size="small"
            label={c.tallyCompanyName}
            variant="outlined"
            color={c.loadedInTally === true ? 'success' : c.loadedInTally === false ? 'warning' : 'default'}
            icon={c.loadedInTally === true ? <CheckCircle2 size={14} /> : c.loadedInTally === false ? <AlertTriangle size={14} /> : undefined}
            title={`${c.name} (${c.code})${c.loadedInTally === false ? ' · not open in TallyPrime: postings for this company will wait' : c.loadedInTally ? ' · open in TallyPrime' : ''}`}
          />
        ))}
        {s.companies.length === 0 && (
          <Typography variant="caption" color="text.secondary">
            No companies mapped yet. Assign this server from a company's Tally configuration.
          </Typography>
        )}
      </Stack>
      {s.companies.some((c) => c.loadedInTally === false) && (
        <Alert severity="warning" sx={{ borderRadius: 3 }}>
          Some mapped companies are not open in TallyPrime. Open them in Tally, or correct the exact Tally company name in the company's settings.
        </Alert>
      )}
      {s.discoveredCompanies && (
        <Typography variant="caption" color="text.secondary">
          Open in TallyPrime{s.discoveredAt ? ` (${timeAgo(s.discoveredAt)})` : ''}:{' '}
          {s.discoveredCompanies.length
            ? s.discoveredCompanies
                .map((n) => (s.companies.some((c) => c.tallyCompanyName.trim().toLowerCase() === n.trim().toLowerCase()) ? n : `${n} (not mapped)`))
                .join(' · ')
            : 'none'}
        </Typography>
      )}
      {canManage && (
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', mt: 'auto' }}>
          <Button size="small" startIcon={<PlugZap size={16} />} onClick={onTest} disabled={testing}>
            {testing ? 'Testing...' : 'Test'}
          </Button>
          <Button size="small" variant="outlined" startIcon={<Pencil size={16} />} onClick={onEdit}>
            Edit
          </Button>
        </Stack>
      )}
    </Card>
  );
}

export function TallyConnectionsPage() {
  const canManage = useAuthStore((s) => s.hasPermission('tally.manage'));
  const canAgents = useAuthStore((s) => s.hasPermission('agents.manage'));
  const servers = useQuery({ queryKey: ['tally', 'servers'], queryFn: tallyApi.servers, refetchInterval: 30_000 });
  const agents = useQuery({ queryKey: ['tally', 'agents'], queryFn: tallyApi.agents, refetchInterval: 30_000 });
  const [editing, setEditing] = useState<TallyServer | null | 'new'>(null);
  const [testResult, setTestResult] = useState<{ name: string; result: CheckResult } | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [agentName, setAgentName] = useState('');
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [secret, setSecret] = useState<{ title: string; agentKey: string; agentSecret: string } | null>(null);
  const [revoking, setRevoking] = useState<Agent | null>(null);
  const [rotating, setRotating] = useState<Agent | null>(null);

  const test = useApiMutation((s: TallyServer) => tallyApi.testServer(s.id), {
    onSuccess: (r, s) => {
      setTestingId(null);
      setTestResult({ name: s.name, result: r });
    },
  });
  const createAgent = useApiMutation(() => tallyApi.createAgent({ name: agentName.trim() }), {
    success: 'Bridge Agent registered',
    invalidate: [['tally']],
    onSuccess: (r) => {
      setCreatingAgent(false);
      setAgentName('');
      setSecret({ title: `Credentials for ${r.agent.name}`, agentKey: r.agent.agentKey, agentSecret: r.agentSecret });
    },
  });
  const rotate = useApiMutation((a: Agent) => tallyApi.rotateAgent(a.id), {
    success: 'Agent secret rotated',
    invalidate: [['tally']],
    onSuccess: (r, a) => {
      setRotating(null);
      setSecret({ title: `New secret for ${a.name}`, agentKey: r.agentKey, agentSecret: r.agentSecret });
    },
  });
  const revoke = useApiMutation((a: Agent) => tallyApi.revokeAgent(a.id), { success: 'Agent revoked', invalidate: [['tally'], ['dashboard']], onSuccess: () => setRevoking(null) });

  const online = servers.data?.filter((s) => s.effectiveStatus === 'ONLINE').length ?? 0;
  const agentsOnline = agents.data?.filter((a) => a.status === 'ONLINE').length ?? 0;

  return (
    <>
      <PageHeader
        icon={<IconTile icon={Server} color={brand.orange.main} size={52} />}
        title="Tally Connections"
        subtitle={servers.data ? `${servers.data.length} servers · ${online} online · ${agentsOnline}/${agents.data?.length ?? 0} agents online` : 'TallyPrime servers and Bridge Agents'}
        actions={
          canManage && (
            <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setEditing('new')}>
              Add connection
            </Button>
          )
        }
      />

      <Alert severity="info" icon={<ShieldCheck size={20} />} sx={{ mb: 3, borderRadius: 4 }}>
        Cloud services cannot reach internal addresses such as 192.168.x.x. The Bridge Agent runs inside your network, connects outbound to Tally Monitor and is the only component that talks to TallyPrime. Statuses below are what the agent last reported.
      </Alert>

      {servers.error ? (
        <ErrorState message={toApiError(servers.error).message} onRetry={() => void servers.refetch()} />
      ) : !servers.data ? (
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' } }}>
          <Skeleton variant="rounded" height={280} sx={{ borderRadius: 5 }} />
          <Skeleton variant="rounded" height={280} sx={{ borderRadius: 5 }} />
        </Box>
      ) : servers.data.length === 0 ? (
        <Card>
          <EmptyState
            title="No Tally connections yet"
            description="Add your internal TallyPrime server (for example 192.168.1.127:9000) and assign a Bridge Agent to it."
            action={
              canManage ? (
                <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setEditing('new')}>
                  Add connection
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' } }}>
          {servers.data.map((s, i) => (
            <ServerCard
              key={s.id}
              s={s}
              index={i}
              canManage={canManage}
              testing={testingId === s.id}
              onEdit={() => setEditing(s)}
              onTest={() => {
                setTestingId(s.id);
                test.mutate(s, { onError: () => setTestingId(null) });
              }}
            />
          ))}
        </Box>
      )}

      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mt: 5, mb: 2 }}>
        <Box>
          <Typography variant="h4">Bridge Agents</Typography>
          <Typography variant="body2" color="text.secondary">
            Each agent has a unique, revocable identity. Install it on a Windows machine that can reach TallyPrime (Phase 6).
          </Typography>
        </Box>
        {canAgents && (
          <Button variant="outlined" startIcon={<Bot size={18} />} onClick={() => setCreatingAgent(true)}>
            Register agent
          </Button>
        )}
      </Stack>
      <DataTable
        rows={agents.data}
        loading={agents.isFetching}
        error={agents.error ? toApiError(agents.error).message : null}
        onRetry={() => void agents.refetch()}
        rowKey={(a) => a.id}
        emptyTitle="No agents registered"
        emptyText="Register an agent to get its key and secret, then install it on your internal network."
        columns={[
          {
            key: 'name',
            header: 'Agent',
            render: (a) => (
              <>
                <Typography variant="subtitle2">{a.name}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                  {a.agentKey}
                </Typography>
              </>
            ),
          },
          { key: 'status', header: 'Status', render: (a) => <AgentStatusBadge status={a.status} /> },
          { key: 'host', header: 'Host', hideBelow: 'md', render: (a) => (a.hostname ? `${a.hostname}${a.agentVersion ? ` · v${a.agentVersion}` : ''}` : '-') },
          { key: 'servers', header: 'Servers', align: 'right', hideBelow: 'sm', render: (a) => a.servers },
          { key: 'heartbeat', header: 'Last heartbeat', render: (a) => (a.lastHeartbeatAt ? timeAgo(a.lastHeartbeatAt) : 'Never') },
          ...(canAgents
            ? [
                {
                  key: 'actions',
                  header: '',
                  align: 'right' as const,
                  render: (a: Agent) =>
                    a.status === 'REVOKED' ? null : (
                      <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                        <Tooltip title="Rotate secret">
                          <IconButton size="small" onClick={() => setRotating(a)}>
                            <KeyRound size={16} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Revoke">
                          <IconButton size="small" color="error" onClick={() => setRevoking(a)}>
                            <ShieldOff size={16} />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    ),
                },
              ]
            : []),
        ]}
      />

      <ServerDialog open={editing !== null} server={editing === 'new' ? null : editing} agents={agents.data ?? []} onClose={() => setEditing(null)} />
      <CheckResultsDialog open={Boolean(testResult)} title={`Connection test · ${testResult?.name ?? ''}`} result={testResult?.result ?? null} onClose={() => setTestResult(null)} />

      <Dialog open={creatingAgent} onClose={() => setCreatingAgent(false)} maxWidth="xs" fullWidth>
        <DialogHeader title="Register Bridge Agent" subtitle="A key and secret are generated for the agent." onClose={() => setCreatingAgent(false)} />
        <DialogContent>
          <TextField label="Agent name" value={agentName} onChange={(e) => setAgentName(e.target.value)} fullWidth autoFocus placeholder="Head office Tally server" sx={{ mt: 1 }} />
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2.5 }}>
          <Button color="inherit" onClick={() => setCreatingAgent(false)}>
            Cancel
          </Button>
          <Button variant="contained" disabled={agentName.trim().length < 2 || createAgent.isPending} onClick={() => createAgent.mutate(undefined)}>
            Register
          </Button>
        </DialogActions>
      </Dialog>

      <SecretDialog
        open={Boolean(secret)}
        title={secret?.title ?? ''}
        description="Configure the Bridge Agent with this key and secret."
        fields={secret ? [{ label: 'Agent key', value: secret.agentKey }, { label: 'Agent secret', value: secret.agentSecret, secret: true }] : []}
        onClose={() => setSecret(null)}
      />
      <ConfirmDialog
        open={Boolean(rotating)}
        title={`Rotate secret for ${rotating?.name}?`}
        message="The agent will be disconnected until it is reconfigured with the new secret."
        confirmLabel="Rotate"
        loading={rotate.isPending}
        onConfirm={() => rotating && rotate.mutate(rotating)}
        onClose={() => setRotating(null)}
      />
      <ConfirmDialog
        open={Boolean(revoking)}
        danger
        title={`Revoke ${revoking?.name}?`}
        message="The agent can never authenticate again. Servers assigned to it will stop processing until another agent is assigned."
        confirmLabel="Revoke"
        loading={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking)}
        onClose={() => setRevoking(null)}
      />
    </>
  );
}
