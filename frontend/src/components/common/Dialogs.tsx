import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { motion } from 'framer-motion';
import { CircleAlert, CircleCheck, CircleX, Copy, KeyRound, TriangleAlert, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { CheckResult } from '@/api/adminTypes';
import { toast } from '@/stores/toast';
import { formatDateTime } from '@/utils/format';

export function DialogHeader({ title, subtitle, onClose }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void }) {
  return (
    <DialogTitle component="div" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, pr: 1.5 }}>
      <Box sx={{ flex: 1 }}>
        <Typography variant="h5">{title}</Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" component="div">
            {subtitle}
          </Typography>
        )}
      </Box>
      <IconButton onClick={onClose} aria-label="Close" size="small">
        <X size={18} />
      </IconButton>
    </DialogTitle>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  loading = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const color = danger ? theme.palette.error.main : theme.palette.warning.main;
  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogContent sx={{ pt: 4, textAlign: 'center' }}>
        <Box sx={{ width: 64, height: 64, mx: 'auto', mb: 2, borderRadius: 4, display: 'grid', placeItems: 'center', bgcolor: alpha(color, 0.14), color }}>
          <TriangleAlert size={30} />
        </Box>
        <Typography variant="h5" sx={{ mb: 1 }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" component="div">
          {message}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ p: 2.5, justifyContent: 'center', gap: 1 }}>
        <Button onClick={onClose} disabled={loading} color="inherit">
          Cancel
        </Button>
        <Button variant="contained" color={danger ? 'error' : 'warning'} onClick={onConfirm} disabled={loading} startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function CopyField({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied to clipboard`);
    } catch {
      toast.error('Copy failed. Select the text and copy it manually.');
    }
  };
  return (
    <TextField
      label={label}
      value={value}
      fullWidth
      slotProps={{
        input: {
          readOnly: true,
          sx: { fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: 13, ...(secret ? { letterSpacing: 0.3 } : {}) },
          endAdornment: (
            <Tooltip title="Copy">
              <IconButton onClick={copy} edge="end" aria-label={`Copy ${label}`}>
                <Copy size={17} />
              </IconButton>
            </Tooltip>
          ),
        },
      }}
    />
  );
}

/** Displays a newly generated secret exactly once. */
export function SecretDialog({ open, title, description, fields, onClose }: { open: boolean; title: string; description: ReactNode; fields: { label: string; value: string; secret?: boolean }[]; onClose: () => void }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const close = () => {
    setAcknowledged(false);
    onClose();
  };
  return (
    <Dialog open={open} maxWidth="sm" fullWidth>
      <DialogContent sx={{ pt: 4 }}>
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Box
              component={motion.div}
              initial={{ rotate: -20, scale: 0.6 }}
              animate={{ rotate: 0, scale: 1 }}
              sx={{ width: 48, height: 48, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: 'success.lighter', color: 'success.dark' }}
            >
              <KeyRound size={24} />
            </Box>
            <Typography variant="h5">{title}</Typography>
          </Stack>
          <Alert severity="warning" sx={{ borderRadius: 3 }}>
            {description} This is the only time the secret is shown. Store it in a password manager or secret store now.
          </Alert>
          {fields.map((f) => (
            <CopyField key={f.label} {...f} />
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2.5, justifyContent: 'space-between' }}>
        <Button onClick={() => setAcknowledged(true)} color={acknowledged ? 'success' : 'inherit'} startIcon={acknowledged ? <CircleCheck size={16} /> : undefined}>
          {acknowledged ? 'Saved' : 'I have stored it securely'}
        </Button>
        <Button variant="contained" onClick={close} disabled={!acknowledged}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const CHECK_META = {
  PASS: { icon: CircleCheck, color: 'success' as const },
  WARN: { icon: CircleAlert, color: 'warning' as const },
  FAIL: { icon: CircleX, color: 'error' as const },
};

export function CheckResultsDialog({ open, title, result, onClose }: { open: boolean; title: string; result: CheckResult | null; onClose: () => void }) {
  const theme = useTheme();
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogHeader title={title} subtitle={result ? `Tested ${formatDateTime(result.testedAt)}` : undefined} onClose={onClose} />
      <DialogContent>
        {result && (
          <Stack spacing={1.5}>
            <Alert severity={result.ok ? 'success' : 'error'} sx={{ borderRadius: 3 }}>
              {result.ok ? 'All required checks passed.' : 'Some required checks failed. Review the details below.'}
            </Alert>
            {result.checks.map((c, i) => {
              const meta = CHECK_META[c.status];
              const Icon = meta.icon;
              const color = theme.palette[meta.color].main;
              return (
                <Stack
                  key={c.name}
                  direction="row"
                  spacing={1.5}
                  component={motion.div}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  sx={{ p: 1.5, borderRadius: 3, bgcolor: alpha(color, 0.08), alignItems: 'flex-start' }}
                >
                  <Box sx={{ color, mt: '2px' }}>
                    <Icon size={20} />
                  </Box>
                  <Box>
                    <Typography variant="subtitle2">{c.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {c.message}
                    </Typography>
                  </Box>
                </Stack>
              );
            })}
            {result.note && (
              <Typography variant="caption" color="text.secondary">
                {result.note}
              </Typography>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2.5 }}>
        <Button variant="contained" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
