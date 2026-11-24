import { Alert, Button, Dialog, DialogActions, DialogContent, IconButton, ListItemIcon, Menu, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Ban, CircleCheck, CirclePause, CirclePlay, FileSearch, MoreVertical, RefreshCw, RotateCcw, ShieldCheck, XCircle, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { queueApi } from '@/api/queueEndpoints';
import type { JobStatus } from '@/api/types';
import { DialogHeader } from '@/components/common/Dialogs';
import { useApiMutation } from '@/hooks/useApiMutation';
import { useAuthStore } from '@/stores/auth';

export interface ActionableJob {
  id: string;
  status: JobStatus;
  isPaused: boolean;
}

type ActionKey = 'approve' | 'reject' | 'retry' | 'revalidate' | 'pause' | 'resume' | 'cancel' | 'reconcile';

const META: Record<ActionKey, { label: string; icon: LucideIcon; color?: 'success' | 'error' | 'warning' | 'primary' }> = {
  approve: { label: 'Approve for posting', icon: CircleCheck, color: 'success' },
  reject: { label: 'Reject', icon: XCircle, color: 'error' },
  retry: { label: 'Retry now', icon: RotateCcw, color: 'primary' },
  revalidate: { label: 'Validate again', icon: RefreshCw },
  pause: { label: 'Pause', icon: CirclePause, color: 'warning' },
  resume: { label: 'Resume', icon: CirclePlay, color: 'success' },
  cancel: { label: 'Cancel job', icon: Ban, color: 'error' },
  reconcile: { label: 'Reconcile with Tally', icon: FileSearch, color: 'warning' },
};

const REVALIDATABLE: JobStatus[] = ['RECEIVED', 'VALIDATION_FAILED', 'MAPPING_REQUIRED', 'MASTER_CREATION_REQUIRED', 'AWAITING_APPROVAL', 'READY_TO_POST', 'RETRY_PENDING', 'FAILED'];
const CANCELLABLE: JobStatus[] = ['RECEIVED', 'VALIDATION_FAILED', 'MAPPING_REQUIRED', 'MASTER_CREATION_REQUIRED', 'AWAITING_APPROVAL', 'READY_TO_POST', 'RETRY_PENDING', 'FAILED'];

export function useAvailableActions(job: ActionableJob): ActionKey[] {
  const can = useAuthStore((s) => s.hasPermission);
  const a: ActionKey[] = [];
  if (can('jobs.approve') && job.status === 'AWAITING_APPROVAL' && !job.isPaused) a.push('approve', 'reject');
  if (can('vouchers.post') && job.status === 'RECONCILIATION_REQUIRED') a.push('reconcile');
  if (can('jobs.manage')) {
    if (job.status === 'FAILED' || job.status === 'RETRY_PENDING') a.push('retry');
    if (REVALIDATABLE.includes(job.status)) a.push('revalidate');
    if (!['PROCESSING', 'POSTED', 'CANCELLED'].includes(job.status)) a.push(job.isPaused ? 'resume' : 'pause');
    if (CANCELLABLE.includes(job.status)) a.push('cancel');
  }
  return a;
}

const INVALIDATE = [['jobs'], ['expenses'], ['queue'], ['dashboard'], ['master-requests']];

function ReasonDialog({ title, message, label, confirm, danger, onSubmit, onClose, pending }: { title: string; message: string; label: string; confirm: string; danger?: boolean; pending: boolean; onSubmit: (v: string) => void; onClose: () => void }) {
  const [value, setValue] = useState('');
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogHeader title={title} onClose={onClose} />
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {message}
        </Typography>
        <TextField label={label} value={value} onChange={(e) => setValue(e.target.value)} fullWidth multiline minRows={2} autoFocus />
      </DialogContent>
      <DialogActions sx={{ p: 2.5 }}>
        <Button color="inherit" onClick={onClose}>
          Close
        </Button>
        <Button variant="contained" color={danger ? 'error' : 'primary'} disabled={pending || (label.includes('required') && value.trim().length < 3)} onClick={() => onSubmit(value.trim())}>
          {confirm}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ReconcileDialog({ jobId, onClose, onDone }: { jobId: string; onClose: () => void; onDone: () => void }) {
  const [resolution, setResolution] = useState<'FOUND' | 'NOT_FOUND'>('FOUND');
  const [notes, setNotes] = useState('');
  const [voucherNumber, setVoucherNumber] = useState('');
  const [voucherDate, setVoucherDate] = useState('');
  const [masterId, setMasterId] = useState('');
  const run = useApiMutation(
    () =>
      queueApi.reconcile(
        jobId,
        resolution === 'FOUND'
          ? { resolution, notes, voucherNumber, voucherDate, ...(masterId ? { tallyMasterId: masterId } : {}) }
          : { resolution, notes },
      ),
    { success: resolution === 'FOUND' ? 'Reconciled as posted' : 'Reconciled as absent; the job will be posted again', invalidate: INVALIDATE, onSuccess: onDone },
  );
  const valid = notes.trim().length >= 5 && (resolution === 'NOT_FOUND' || (voucherNumber.trim() && /^\d{4}-\d{2}-\d{2}$/.test(voucherDate)));
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogHeader title="Reconcile with Tally" subtitle="The outcome of this posting is uncertain. Check Tally before deciding." onClose={onClose} />
      <DialogContent>
        <Stack spacing={2.5}>
          <Alert severity="warning" sx={{ borderRadius: 3 }}>
            Search the company's Day Book in TallyPrime for this voucher's reference. Never mark it absent without checking: posting again could create a duplicate voucher.
          </Alert>
          <ToggleButtonGroup exclusive fullWidth value={resolution} onChange={(_, v) => v && setResolution(v)}>
            <ToggleButton value="FOUND">Voucher exists in Tally</ToggleButton>
            <ToggleButton value="NOT_FOUND">Confirmed not in Tally</ToggleButton>
          </ToggleButtonGroup>
          {resolution === 'FOUND' && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Voucher number" value={voucherNumber} onChange={(e) => setVoucherNumber(e.target.value)} fullWidth />
              <TextField label="Voucher date" type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
              <TextField label="MasterID (optional)" value={masterId} onChange={(e) => setMasterId(e.target.value.replace(/\D/g, ''))} fullWidth />
            </Stack>
          )}
          <TextField label="Evidence (required)" value={notes} onChange={(e) => setNotes(e.target.value)} multiline minRows={2} helperText="How did you verify this? e.g. Day Book searched by reference on 2 Nov" />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2.5 }}>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" color="warning" startIcon={<ShieldCheck size={16} />} disabled={!valid || run.isPending} onClick={() => run.mutate(undefined)}>
          Record reconciliation
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function JobActionDialogs({ job, action, onClose }: { job: ActionableJob; action: ActionKey | null; onClose: () => void }) {
  const opts = (success: string) => ({ success, invalidate: INVALIDATE, onSuccess: onClose });
  const approve = useApiMutation((notes: string) => queueApi.approve(job.id, notes), opts('Approved; the Bridge Agent will post it'));
  const reject = useApiMutation((reason: string) => queueApi.reject(job.id, reason), opts('Rejected; the job is cancelled'));
  const cancel = useApiMutation((reason: string) => queueApi.cancel(job.id, reason), opts('Job cancelled'));

  if (action === 'retry' || action === 'revalidate' || action === 'pause' || action === 'resume') return <SimpleAction job={job} action={action} onClose={onClose} />;
  if (action === 'approve')
    return <ReasonDialog title="Approve for posting" message="You confirm the voucher preview is correct. The approval is tied to this exact voucher; any change requires approval again." label="Notes (optional)" confirm="Approve" pending={approve.isPending} onSubmit={(v) => approve.mutate(v)} onClose={onClose} />;
  if (action === 'reject') return <ReasonDialog title="Reject posting" message="The job is cancelled and will not be posted to Tally." label="Reason (required)" confirm="Reject" danger pending={reject.isPending} onSubmit={(v) => reject.mutate(v)} onClose={onClose} />;
  if (action === 'cancel') return <ReasonDialog title="Cancel job" message="The expense will not be posted. This cannot be undone." label="Reason (required)" confirm="Cancel job" danger pending={cancel.isPending} onSubmit={(v) => cancel.mutate(v)} onClose={onClose} />;
  if (action === 'reconcile') return <ReconcileDialog jobId={job.id} onClose={onClose} onDone={onClose} />;
  return null;
}

const SIMPLE_SUCCESS = { retry: 'Retry scheduled now', pause: 'Job paused', resume: 'Job resumed' } as const;

/** One-click actions run exactly once per mount (the ref also guards StrictMode's double effect). */
function SimpleAction({ job, action, onClose }: { job: ActionableJob; action: 'retry' | 'revalidate' | 'pause' | 'resume'; onClose: () => void }) {
  const started = useRef(false);
  const run = useApiMutation(() => queueApi[action](job.id) as Promise<{ status?: string }>, {
    success: (r) => (action === 'revalidate' ? `Validated: ${String(r.status ?? '').toLowerCase().replace(/_/g, ' ')}` : SIMPLE_SUCCESS[action]),
    invalidate: INVALIDATE,
  });
  const { mutate } = run;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    mutate(undefined, { onSettled: onClose });
  }, [mutate, onClose]);
  return null;
}

export function JobActionsMenu({ job }: { job: ActionableJob }) {
  const actions = useAvailableActions(job);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [action, setAction] = useState<ActionKey | null>(null);
  if (!actions.length) return null;
  return (
    <>
      <IconButton size="small" onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget); }} aria-label="Job actions">
        <MoreVertical size={17} />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} onClick={(e) => e.stopPropagation()}>
        {actions.map((k) => {
          const Icon = META[k].icon;
          return (
            <MenuItem key={k} onClick={() => { setAnchor(null); setAction(k); }} sx={{ color: META[k].color ? `${META[k].color}.main` : undefined }}>
              <ListItemIcon sx={{ color: 'inherit' }}>
                <Icon size={17} />
              </ListItemIcon>
              {META[k].label}
            </MenuItem>
          );
        })}
      </Menu>
      {action && <ActionRunner job={job} action={action} onClose={() => setAction(null)} />}
    </>
  );
}

/** Mounts a fresh dialog/mutation per action so simple actions fire exactly once. */
function ActionRunner({ job, action, onClose }: { job: ActionableJob; action: ActionKey; onClose: () => void }) {
  return <JobActionDialogs job={job} action={action} onClose={onClose} />;
}

export function JobActionButtons({ job }: { job: ActionableJob }) {
  const actions = useAvailableActions(job);
  const [action, setAction] = useState<ActionKey | null>(null);
  return (
    <>
      {actions.map((k) => {
        const Icon = META[k].icon;
        const primary = k === 'approve' || k === 'reconcile';
        return (
          <Button key={k} size="small" variant={primary ? 'contained' : 'outlined'} color={META[k].color ?? 'inherit'} startIcon={<Icon size={16} />} onClick={() => setAction(k)}>
            {META[k].label}
          </Button>
        );
      })}
      {action && <ActionRunner key={action} job={job} action={action} onClose={() => setAction(null)} />}
    </>
  );
}
