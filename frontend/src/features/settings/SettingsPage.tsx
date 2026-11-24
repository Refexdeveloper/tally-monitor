import { Box, Button, Card, Chip, InputAdornment, Skeleton, Stack, Switch, TextField, Tooltip, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Lock, Save, Settings, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type { SettingDto } from '@/api/adminTypes';
import { settingsApi } from '@/api/adminEndpoints';
import { toApiError } from '@/api/client';
import { IconTile } from '@/components/common/IconTile';
import { PageHeader } from '@/components/common/PageHeader';
import { ErrorState } from '@/components/common/States';
import { useApiMutation } from '@/hooks/useApiMutation';
import { useAuthStore } from '@/stores/auth';
import { brand } from '@/theme/theme';
import { humanize, timeAgo } from '@/utils/format';

function SettingRow({ s, canManage }: { s: SettingDto; canManage: boolean }) {
  const theme = useTheme();
  const [draft, setDraft] = useState(String(s.value));
  const save = useApiMutation((value: unknown) => settingsApi.update(s.key, value), { success: `${s.label} updated`, invalidate: [['settings']] });
  const editable = canManage && !s.locked;
  const num = Number(draft);
  const invalid = s.type === 'integer' && (!Number.isInteger(num) || (s.min !== null && num < s.min) || (s.max !== null && num > s.max));

  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ py: 2, alignItems: { sm: 'center' }, borderBottom: `1px dashed ${theme.palette.divider}`, '&:last-child': { borderBottom: 0 } }}>
      <Box sx={{ flex: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="subtitle2">{s.label}</Typography>
          {s.locked && (
            <Tooltip title={s.locked.reason}>
              <Chip size="small" icon={<Lock size={12} />} label="Locked" color="secondary" variant="outlined" />
            </Tooltip>
          )}
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {s.locked ? s.locked.reason : s.description}
        </Typography>
        <Typography variant="caption" color="text.disabled">
          {s.key} · updated {timeAgo(s.updatedAt)}
        </Typography>
      </Box>
      {s.type === 'boolean' ? (
        <Switch checked={Boolean(s.value)} disabled={!editable || save.isPending} onChange={(e) => save.mutate(e.target.checked)} />
      ) : (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          <TextField
            size="small"
            type="number"
            value={draft}
            disabled={!editable}
            onChange={(e) => setDraft(e.target.value)}
            error={invalid}
            helperText={s.min !== null ? `${s.min}–${s.max}` : undefined}
            sx={{ width: 160 }}
            slotProps={{ input: { endAdornment: s.unit ? <InputAdornment position="end">{s.unit === 'seconds' ? 's' : s.unit}</InputAdornment> : undefined } }}
          />
          {editable && (
            <Button size="small" variant="contained" disabled={invalid || draft === String(s.value) || save.isPending} onClick={() => save.mutate(num)} sx={{ minWidth: 0, height: 40 }} aria-label={`Save ${s.label}`}>
              <Save size={16} />
            </Button>
          )}
        </Stack>
      )}
    </Stack>
  );
}

const SECURITY_LABELS: Record<string, [string, string]> = {
  accessTokenTtlSeconds: ['Access token lifetime', 'seconds'],
  sessionTtlHours: ['Session lifetime', 'hours'],
  rememberMeTtlDays: ['"Remember me" lifetime', 'days'],
  maxFailedAttempts: ['Failed sign-ins before lockout', 'attempts'],
  lockoutMinutes: ['Lockout duration', 'minutes'],
  passwordResetTtlMinutes: ['Reset link validity', 'minutes'],
  agentHeartbeatTimeoutSeconds: ['Agent offline after', 'seconds without heartbeat'],
  tallyHealthStaleSeconds: ['Tally status stale after', 'seconds'],
};

export function SettingsPage() {
  const theme = useTheme();
  const canManage = useAuthStore((s) => s.hasPermission('settings.manage'));
  const q = useQuery({ queryKey: ['settings'], queryFn: settingsApi.list });

  if (q.error) return <ErrorState message={toApiError(q.error).message} onRetry={() => void q.refetch()} />;
  const groups = q.data ? [...new Set(q.data.settings.map((s) => s.category))] : [];

  return (
    <>
      <PageHeader icon={<IconTile icon={Settings} color={brand.indigo.main} size={52} />} title="Settings" subtitle={canManage ? 'Queue, posting and integration policies' : 'Read-only: you need settings.manage to change these'} />
      {!q.data ? (
        <Skeleton variant="rounded" height={420} sx={{ borderRadius: 5 }} />
      ) : (
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: '1.6fr 1fr' }, alignItems: 'start' }}>
          <Stack spacing={3}>
            {groups.map((g, i) => (
              <Card key={g} component={motion.div} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} sx={{ p: 3 }}>
                <Typography variant="h6">{humanize(g)}</Typography>
                {q.data.settings
                  .filter((s) => s.category === g)
                  .map((s) => (
                    <SettingRow key={`${s.key}:${String(s.value)}`} s={s} canManage={canManage} />
                  ))}
              </Card>
            ))}
          </Stack>
          <Card sx={{ p: 3, background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.08)}, transparent)` }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1 }}>
              <ShieldCheck size={22} color={theme.palette.primary.main} />
              <Typography variant="h6">Security policy</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Set through deployment configuration (environment variables or Secret Manager), not from the UI.
            </Typography>
            {Object.entries(q.data.security).map(([k, v]) => (
              <Stack key={k} direction="row" sx={{ justifyContent: 'space-between', py: 1, borderBottom: `1px dashed ${theme.palette.divider}` }}>
                <Typography variant="body2">{SECURITY_LABELS[k]?.[0] ?? k}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {v} {SECURITY_LABELS[k]?.[1]}
                </Typography>
              </Stack>
            ))}
          </Card>
        </Box>
      )}
    </>
  );
}
