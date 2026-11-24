import { Box, Button, Card, MenuItem, Pagination, Skeleton, Stack, TextField, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AppWindow, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Application } from '@/api/adminTypes';
import { applicationsApi } from '@/api/adminEndpoints';
import { toApiError } from '@/api/client';
import { SecretDialog } from '@/components/common/Dialogs';
import { IconTile } from '@/components/common/IconTile';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState } from '@/components/common/States';
import { SearchToolbar } from '@/components/data/SearchToolbar';
import { useListState } from '@/hooks/useListState';
import { useAuthStore } from '@/stores/auth';
import { brand } from '@/theme/theme';
import { formatCompact, formatDate, formatMoney, formatNumber, timeAgo } from '@/utils/format';
import { ApplicationStatusBadge } from '../shared/Badges';
import { appIcon, MODE_LABELS } from './appMeta';
import { ApplicationWizard } from './ApplicationWizard';

function AppCard({ app, index, onOpen }: { app: Application; index: number; onOpen: () => void }) {
  const color = app.color ?? brand.indigo.main;
  const Icon = appIcon(app.icon);
  return (
    <Card
      component={motion.div}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      whileHover={{ y: -5 }}
      onClick={onOpen}
      sx={{ p: 2.5, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2, transition: 'box-shadow .2s', '&:hover': { boxShadow: `0 18px 36px -18px ${alpha(color, 0.7)}` } }}
    >
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
        <IconTile icon={Icon} color={color} size={48} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" noWrap>
            {app.name}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div">
            {app.code} · {MODE_LABELS[app.integrationMode].label}
            {app.kissflowAppId ? ` · ${app.kissflowAppId}` : ''}
          </Typography>
        </Box>
        <ApplicationStatusBadge status={app.status} />
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ minHeight: 40, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {app.description || 'No description'}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, p: 1.5, borderRadius: 3, bgcolor: alpha(color, 0.07) }}>
        {[
          ['Companies', formatNumber(app.stats.connectedCompanies)],
          ['Expenses', formatCompact(app.stats.expenses)],
          ['Pending jobs', formatNumber(app.stats.openJobs)],
        ].map(([l, v]) => (
          <Box key={l} sx={{ textAlign: 'center' }}>
            <Typography variant="h6">{v}</Typography>
            <Typography variant="caption" color="text.secondary">
              {l}
            </Typography>
          </Box>
        ))}
      </Box>
      <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
        <Typography variant="caption" color="text.secondary">
          {formatMoney(app.stats.expenseAmount, 'INR', { compact: true })} received
        </Typography>
        <Typography variant="caption" color="text.secondary" title={`Created ${formatDate(app.createdAt)}`}>
          Last success {timeAgo(app.lastSuccessAt)}
        </Typography>
      </Stack>
    </Card>
  );
}

export function ApplicationsPage() {
  const navigate = useNavigate();
  const canManage = useAuthStore((s) => s.hasPermission('applications.manage'));
  const list = useListState({ pageSize: 12, status: 'all', mode: 'all', sort: 'createdAt' });
  const [wizard, setWizard] = useState(false);
  const [secret, setSecret] = useState<{ app: Application; secret: string } | null>(null);
  const q = useQuery({ queryKey: ['applications', list.params], queryFn: () => applicationsApi.list(list.params), placeholderData: (p) => p });

  return (
    <>
      <PageHeader
        icon={<IconTile icon={AppWindow} color={brand.indigo.main} size={52} />}
        title="Applications"
        subtitle={q.data ? `${formatNumber(q.data.meta.total)} Kissflow applications` : 'Kissflow applications integrated with Tally Monitor'}
        actions={
          canManage && (
            <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setWizard(true)}>
              Add application
            </Button>
          )
        }
      />
      <Card sx={{ mb: 3 }}>
        <SearchToolbar value={list.params.search ?? ''} onChange={list.setSearch} placeholder="Search name, code or Kissflow app ID">
          <TextField select size="small" label="Status" value={list.params.status} onChange={(e) => list.set({ status: e.target.value })} sx={{ minWidth: 140 }}>
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="ACTIVE">Active</MenuItem>
            <MenuItem value="DRAFT">Draft</MenuItem>
            <MenuItem value="INACTIVE">Inactive</MenuItem>
          </TextField>
          <TextField select size="small" label="Mode" value={list.params.mode} onChange={(e) => list.set({ mode: e.target.value })} sx={{ minWidth: 150 }}>
            <MenuItem value="all">All modes</MenuItem>
            <MenuItem value="WEBHOOK">Webhook</MenuItem>
            <MenuItem value="API">API</MenuItem>
            <MenuItem value="MANUAL">Manual</MenuItem>
          </TextField>
        </SearchToolbar>
      </Card>

      {q.error ? (
        <ErrorState message={toApiError(q.error).message} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' } }}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} variant="rounded" height={250} sx={{ borderRadius: 5 }} />
          ))}
        </Box>
      ) : q.data.items.length === 0 ? (
        <Card>
          <EmptyState
            title={list.params.search ? 'No matching applications' : 'No applications yet'}
            description={list.params.search ? 'Try a different search or filter.' : 'Register a Kissflow application to start receiving expenses.'}
            action={
              canManage && !list.params.search ? (
                <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => setWizard(true)}>
                  Add application
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', xl: 'repeat(3, 1fr)' }, opacity: q.isFetching ? 0.7 : 1 }}>
            {q.data.items.map((app, i) => (
              <AppCard key={app.id} app={app} index={i} onOpen={() => navigate(`/applications/${app.id}`)} />
            ))}
          </Box>
          {q.data.meta.totalPages > 1 && (
            <Stack sx={{ alignItems: 'center', mt: 3 }}>
              <Pagination count={q.data.meta.totalPages} page={q.data.meta.page} onChange={(_, p) => list.setPage(p, list.params.pageSize ?? 12)} color="primary" shape="rounded" />
            </Stack>
          )}
        </>
      )}

      <ApplicationWizard
        open={wizard}
        onClose={() => setWizard(false)}
        onCreated={(app, s) => {
          setWizard(false);
          if (s) setSecret({ app, secret: s });
          else navigate(`/applications/${app.id}`);
        }}
      />
      <SecretDialog
        open={Boolean(secret)}
        title="Webhook credentials"
        description={`Configure the Kissflow integration for ${secret?.app.name} with this URL and secret.`}
        fields={secret ? [{ label: 'Webhook URL', value: secret.app.webhookUrl ?? '' }, { label: secret.app.authMethod === 'HMAC_SHA256' ? 'HMAC signing secret' : 'Bearer token', value: secret.secret, secret: true }] : []}
        onClose={() => {
          const id = secret?.app.id;
          setSecret(null);
          if (id) navigate(`/applications/${id}`);
        }}
      />
    </>
  );
}
