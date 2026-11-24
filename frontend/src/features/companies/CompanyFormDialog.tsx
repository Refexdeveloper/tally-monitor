import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, FormControlLabel, MenuItem, Switch, TextField } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Company, CompanyInput } from '@/api/adminTypes';
import { companiesApi, tallyApi } from '@/api/adminEndpoints';
import { DialogHeader } from '@/components/common/Dialogs';
import { applyServerErrors, useApiMutation } from '@/hooks/useApiMutation';
import { useAuthStore } from '@/stores/auth';

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const schema = z.object({
  name: z.string().trim().min(2, 'Company name is required').max(200),
  code: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/, 'Use 2-32 letters, digits, "-" or "_"'),
  gstin: z.string().trim().refine((v) => v === '' || GSTIN.test(v.toUpperCase()), 'Enter a valid 15-character GSTIN'),
  tallyCompanyName: z.string().trim().min(1, 'Exact Tally company name is required').max(255),
  tallyServerId: z.string(),
  integrationAgentId: z.string(),
  defaultCurrency: z.string().trim().regex(/^[A-Za-z]{3}$/, 'Use a 3-letter currency code'),
  financialYearStart: z.string(),
  isActive: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

export function CompanyFormDialog({ open, company, onClose, onSaved }: { open: boolean; company?: Company | null; onClose: () => void; onSaved?: (c: Company) => void }) {
  const canSeeTally = useAuthStore((s) => s.hasPermission('tally.view'));
  const servers = useQuery({ queryKey: ['tally', 'servers'], queryFn: tallyApi.servers, enabled: open && canSeeTally });
  const agents = useQuery({ queryKey: ['tally', 'agents'], queryFn: tallyApi.agents, enabled: open && canSeeTally });

  const { control, register, handleSubmit, setError, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: {
      name: company?.name ?? '',
      code: company?.code ?? '',
      gstin: company?.gstin ?? '',
      tallyCompanyName: company?.tallyCompanyName ?? '',
      tallyServerId: company?.tallyServer?.id ?? '',
      integrationAgentId: company?.agent?.overridden ? company.agent.id : '',
      defaultCurrency: company?.defaultCurrency ?? 'INR',
      financialYearStart: company?.financialYearStart ?? '',
      isActive: company?.isActive ?? true,
    },
  });

  const save = useApiMutation(
    (v: FormValues) => {
      const body: CompanyInput = {
        name: v.name,
        code: v.code.toUpperCase(),
        gstin: v.gstin ? v.gstin.toUpperCase() : null,
        tallyCompanyName: v.tallyCompanyName,
        defaultCurrency: v.defaultCurrency.toUpperCase(),
        financialYearStart: v.financialYearStart || null,
        isActive: v.isActive,
        ...(canSeeTally ? { tallyServerId: v.tallyServerId || null, integrationAgentId: v.integrationAgentId || null } : {}),
      };
      return company ? companiesApi.update(company.id, body) : companiesApi.create(body);
    },
    {
      success: company ? 'Company updated' : 'Company created',
      invalidate: [['companies'], ['dashboard'], ['tally']],
      onSuccess: (c) => {
        onSaved?.(c);
        onClose();
      },
    },
  );

  const onSubmit = handleSubmit((v) => save.mutate(v, { onError: (err) => applyServerErrors(err, setError as never) }));
  const activeAgents = agents.data?.filter((a) => a.status !== 'REVOKED') ?? [];

  return (
    <Dialog open={open} onClose={save.isPending ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogHeader title={company ? `Edit ${company.name}` : 'Add company'} subtitle="Each company keeps its own ledgers, vouchers, queue and posting history." onClose={onClose} />
      <DialogContent>
        <Box component="form" id="company-form" onSubmit={onSubmit} noValidate sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, pt: 1 }}>
          <TextField {...register('name')} label="Company name" required error={!!errors.name} helperText={errors.name?.message} sx={{ gridColumn: { sm: '1 / -1' } }} autoFocus />
          <TextField {...register('code')} label="Company code" required error={!!errors.code} helperText={errors.code?.message ?? 'Short unique code, e.g. AUR'} slotProps={{ htmlInput: { style: { textTransform: 'uppercase' } } }} />
          <TextField {...register('gstin')} label="GSTIN" error={!!errors.gstin} helperText={errors.gstin?.message ?? 'Optional'} slotProps={{ htmlInput: { style: { textTransform: 'uppercase' }, maxLength: 15 } }} />
          <TextField
            {...register('tallyCompanyName')}
            label="Tally company name (exact)"
            required
            error={!!errors.tallyCompanyName}
            helperText={errors.tallyCompanyName?.message ?? 'Must match the company name in TallyPrime character for character'}
            sx={{ gridColumn: { sm: '1 / -1' } }}
          />
          {canSeeTally && (
            <>
              <Controller
                name="tallyServerId"
                control={control}
                render={({ field }) => (
                  <TextField {...field} select label="Tally server" helperText={servers.data?.length ? 'Where this company lives' : 'Add a Tally connection first'}>
                    <MenuItem value="">Not assigned</MenuItem>
                    {servers.data?.filter((s) => s.isActive || s.id === field.value).map((s) => (
                      <MenuItem key={s.id} value={s.id}>
                        {s.name} ({s.host}:{s.port})
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
              <Controller
                name="integrationAgentId"
                control={control}
                render={({ field }) => (
                  <TextField {...field} select label="Integration agent override" helperText="Defaults to the server's agent">
                    <MenuItem value="">Use the server's agent</MenuItem>
                    {activeAgents.map((a) => (
                      <MenuItem key={a.id} value={a.id}>
                        {a.name}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
            </>
          )}
          <TextField {...register('defaultCurrency')} label="Default currency" error={!!errors.defaultCurrency} helperText={errors.defaultCurrency?.message} slotProps={{ htmlInput: { maxLength: 3, style: { textTransform: 'uppercase' } } }} />
          <TextField {...register('financialYearStart')} label="Financial year start" type="date" slotProps={{ inputLabel: { shrink: true } }} helperText="e.g. 1 April" />
          <Controller
            name="isActive"
            control={control}
            render={({ field }) => <FormControlLabel control={<Switch checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />} label="Active" sx={{ gridColumn: { sm: '1 / -1' } }} />}
          />
          {company && (
            <Alert severity="info" sx={{ gridColumn: '1 / -1', borderRadius: 3 }}>
              Changing the Tally company name is blocked while jobs for this company are processing or awaiting reconciliation.
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2.5 }}>
        <Button onClick={onClose} color="inherit" disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" form="company-form" variant="contained" disabled={save.isPending} startIcon={save.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {company ? 'Save changes' : 'Create company'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
