import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, ButtonBase, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, FormControlLabel, MenuItem, Radio, RadioGroup, Stack, Step, StepLabel, Stepper, TextField, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import type { Application, ApplicationInput, ApplicationType, AuthMethod, IntegrationMode, VoucherKind } from '@/api/adminTypes';
import { applicationsApi, companiesApi } from '@/api/adminEndpoints';
import { DialogHeader } from '@/components/common/Dialogs';
import { applyServerErrors, useApiMutation } from '@/hooks/useApiMutation';
import { APP_COLORS, APP_ICONS, APPLICATION_TYPE_LABELS, AUTH_LABELS, AUTH_OPTIONS, MODE_LABELS, VOUCHER_KIND_LABELS } from './appMeta';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Application name is required').max(150),
    code: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/, 'Use 2-64 letters, digits, "-" or "_"'),
    description: z.string().max(1000),
    applicationType: z.string(),
    icon: z.string(),
    color: z.string(),
    kissflowAccount: z.string().max(150),
    kissflowAppId: z.string().max(150),
    kissflowProcessId: z.string().max(150),
    defaultVoucherKind: z.string(),
    integrationMode: z.enum(['WEBHOOK', 'API', 'MANUAL']),
    authMethod: z.enum(['HMAC_SHA256', 'BEARER_TOKEN', 'API_KEY', 'NONE']),
    apiEndpoint: z.string().max(500),
    apiKeyId: z.string().max(200),
    apiKeySecret: z.string().max(500),
    bearerToken: z.string().max(4000),
    companies: z.array(z.object({ companyId: z.string(), name: z.string(), selected: z.boolean(), sourceCompanyKey: z.string().max(150) })),
    activate: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.integrationMode === 'API') {
      if (!/^https:\/\/.+/.test(v.apiEndpoint)) ctx.addIssue({ code: 'custom', path: ['apiEndpoint'], message: 'Enter the HTTPS Kissflow API endpoint' });
      if (v.authMethod === 'API_KEY' && (!v.apiKeyId || !v.apiKeySecret)) ctx.addIssue({ code: 'custom', path: ['apiKeySecret'], message: 'Access key ID and secret are required' });
      if (v.authMethod === 'BEARER_TOKEN' && !v.bearerToken) ctx.addIssue({ code: 'custom', path: ['bearerToken'], message: 'Bearer token is required' });
    }
    v.companies.forEach((c, i) => {
      if (c.selected && !c.sourceCompanyKey.trim()) ctx.addIssue({ code: 'custom', path: ['companies', i, 'sourceCompanyKey'], message: 'Required' });
    });
    if (v.activate && !v.companies.some((c) => c.selected)) ctx.addIssue({ code: 'custom', path: ['activate'], message: 'Select at least one company to activate' });
  });
type FormValues = z.infer<typeof schema>;

const STEPS = ['Basics', 'Kissflow', 'Integration', 'Companies', 'Review'] as const;
const STEP_FIELDS: (keyof FormValues)[][] = [
  ['name', 'code', 'description', 'applicationType'],
  ['kissflowAccount', 'kissflowAppId', 'kissflowProcessId', 'defaultVoucherKind'],
  ['integrationMode', 'authMethod', 'apiEndpoint', 'apiKeyId', 'apiKeySecret', 'bearerToken'],
  ['companies'],
  ['activate'],
];

export function ApplicationWizard({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (app: Application, secret: string | null) => void }) {
  const theme = useTheme();
  const [step, setStep] = useState(0);
  const companies = useQuery({ queryKey: ['companies', 'all-active'], queryFn: () => companiesApi.list({ pageSize: 100, status: 'active', sort: 'name', order: 'asc' }), enabled: open });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: {
      name: '',
      code: '',
      description: '',
      applicationType: 'EXPENSE_CLAIM',
      icon: 'receipt',
      color: APP_COLORS[0]!,
      kissflowAccount: '',
      kissflowAppId: '',
      kissflowProcessId: '',
      defaultVoucherKind: 'JOURNAL',
      integrationMode: 'WEBHOOK',
      authMethod: 'HMAC_SHA256',
      apiEndpoint: '',
      apiKeyId: '',
      apiKeySecret: '',
      bearerToken: '',
      companies: (companies.data?.items ?? []).map((c) => ({ companyId: c.id, name: `${c.name} (${c.code})`, selected: false, sourceCompanyKey: c.name.toUpperCase() })),
      activate: false,
    },
    resetOptions: { keepDirtyValues: true },
  });
  const { control, register, handleSubmit, trigger, setValue, setError, formState: { errors } } = form;
  const { fields } = useFieldArray({ control, name: 'companies' });
  const values = useWatch({ control });

  const reset = () => {
    setStep(0);
    form.reset();
  };
  const close = () => {
    reset();
    onClose();
  };

  const create = useApiMutation(
    (v: FormValues) => {
      const body: ApplicationInput = {
        name: v.name,
        code: v.code.toUpperCase(),
        description: v.description || null,
        applicationType: v.applicationType as ApplicationType,
        icon: v.icon,
        color: v.color,
        kissflowAccount: v.kissflowAccount || null,
        kissflowAppId: v.kissflowAppId || null,
        kissflowProcessId: v.kissflowProcessId || null,
        defaultVoucherKind: (v.defaultVoucherKind || null) as VoucherKind | null,
        integrationMode: v.integrationMode,
        authMethod: v.authMethod,
        apiEndpoint: v.integrationMode === 'API' ? v.apiEndpoint : null,
        credentials:
          v.integrationMode === 'API'
            ? v.authMethod === 'API_KEY'
              ? { apiKeyId: v.apiKeyId, apiKeySecret: v.apiKeySecret }
              : { bearerToken: v.bearerToken }
            : undefined,
        companies: v.companies.filter((c) => c.selected).map((c) => ({ companyId: c.companyId, sourceCompanyKey: c.sourceCompanyKey.trim() })),
        status: v.activate ? 'ACTIVE' : 'DRAFT',
      };
      return applicationsApi.create(body);
    },
    {
      success: 'Application registered',
      invalidate: [['applications'], ['companies'], ['dashboard']],
      onSuccess: (r) => {
        reset();
        onCreated(r.application, r.webhookSecret);
      },
    },
  );

  const next = async () => {
    if (await trigger(STEP_FIELDS[step])) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const submit = handleSubmit((v) =>
    create.mutate(v, {
      onError: (err) => {
        const e = applyServerErrors(err, setError as never);
        if (e.code === 'DUPLICATE') setStep(0);
      },
    }),
  );

  const setMode = (mode: IntegrationMode) => {
    setValue('integrationMode', mode);
    setValue('authMethod', AUTH_OPTIONS[mode][0]!);
  };
  const selectedCompanies = (values.companies ?? []).filter((c) => c?.selected);
  const Icon = APP_ICONS[values.icon ?? 'receipt'] ?? APP_ICONS.app!;

  return (
    <Dialog open={open} onClose={create.isPending ? undefined : close} maxWidth="md" fullWidth>
      <DialogHeader title="Add application" subtitle="Register a Kissflow application and connect it to your group companies." onClose={close} />
      <Box sx={{ px: 3, pb: 1 }}>
        <Stepper activeStep={step} alternativeLabel>
          {STEPS.map((s) => (
            <Step key={s}>
              <StepLabel>{s}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </Box>
      <DialogContent sx={{ minHeight: 360 }}>
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}>
            {step === 0 && (
              <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, pt: 1 }}>
                <TextField {...register('name')} label="Application name" required autoFocus error={!!errors.name} helperText={errors.name?.message} />
                <TextField {...register('code')} label="Application code" required error={!!errors.code} helperText={errors.code?.message ?? 'Used in the webhook URL, e.g. EMS'} slotProps={{ htmlInput: { style: { textTransform: 'uppercase' } } }} />
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
                <TextField {...register('description')} label="Description" multiline minRows={1} />
                <Box sx={{ gridColumn: '1 / -1' }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Icon & colour
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center' }} useFlexGap>
                    {Object.entries(APP_ICONS).map(([key, I]) => (
                      <ButtonBase
                        key={key}
                        onClick={() => setValue('icon', key)}
                        aria-label={`Icon ${key}`}
                        sx={{ width: 44, height: 44, borderRadius: 2.5, border: `2px solid ${values.icon === key ? values.color : theme.palette.divider}`, color: values.icon === key ? values.color : 'text.secondary' }}
                      >
                        <I size={20} />
                      </ButtonBase>
                    ))}
                    <Box sx={{ width: 16 }} />
                    {APP_COLORS.map((c) => (
                      <ButtonBase key={c} onClick={() => setValue('color', c)} aria-label={`Colour ${c}`} sx={{ width: 30, height: 30, borderRadius: '50%', bgcolor: c, boxShadow: values.color === c ? `0 0 0 3px ${theme.palette.background.paper}, 0 0 0 5px ${c}` : 'none' }}>
                        {values.color === c && <Check size={16} color="#fff" />}
                      </ButtonBase>
                    ))}
                  </Stack>
                </Box>
              </Box>
            )}

            {step === 1 && (
              <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, pt: 1 }}>
                <TextField {...register('kissflowAccount')} label="Kissflow account / workspace" helperText="e.g. your-company (from your-company.kissflow.com)" />
                <TextField {...register('kissflowAppId')} label="Kissflow application ID" helperText="e.g. EMS_001_A00" />
                <TextField {...register('kissflowProcessId')} label="Process / flow ID" helperText="Optional" />
                <Controller
                  name="defaultVoucherKind"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} select label="Default voucher type" helperText="Can be overridden per company in Phase 4">
                      <MenuItem value="">None</MenuItem>
                      {Object.entries(VOUCHER_KIND_LABELS).map(([k, v]) => (
                        <MenuItem key={k} value={k} disabled={['SALES', 'CREDIT_NOTE', 'DEBIT_NOTE'].includes(k)}>
                          {v}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                />
              </Box>
            )}

            {step === 2 && (
              <Stack spacing={2.5} sx={{ pt: 1 }}>
                <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' } }}>
                  {(Object.keys(MODE_LABELS) as IntegrationMode[]).map((m) => {
                    const active = values.integrationMode === m;
                    return (
                      <ButtonBase
                        key={m}
                        onClick={() => setMode(m)}
                        sx={{
                          p: 2,
                          borderRadius: 3,
                          textAlign: 'left',
                          alignItems: 'flex-start',
                          flexDirection: 'column',
                          border: `2px solid ${active ? theme.palette.primary.main : theme.palette.divider}`,
                          bgcolor: active ? alpha(theme.palette.primary.main, 0.06) : 'transparent',
                        }}
                      >
                        <Typography variant="subtitle1" color={active ? 'primary' : 'text.primary'}>
                          {MODE_LABELS[m].label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {MODE_LABELS[m].text}
                        </Typography>
                      </ButtonBase>
                    );
                  })}
                </Box>
                <Controller
                  name="authMethod"
                  control={control}
                  render={({ field }) => (
                    <RadioGroup row value={field.value} onChange={(e) => field.onChange(e.target.value as AuthMethod)}>
                      {AUTH_OPTIONS[values.integrationMode ?? 'WEBHOOK'].map((a) => (
                        <FormControlLabel key={a} value={a} control={<Radio />} label={AUTH_LABELS[a]} />
                      ))}
                    </RadioGroup>
                  )}
                />
                {values.integrationMode === 'WEBHOOK' && (
                  <Alert severity="info" sx={{ borderRadius: 3 }}>
                    A unique webhook URL and a strong {values.authMethod === 'HMAC_SHA256' ? 'signing secret' : 'token'} are generated when you finish. The secret is shown only once.
                  </Alert>
                )}
                {values.integrationMode === 'API' && (
                  <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                    <TextField {...register('apiEndpoint')} label="Kissflow API endpoint" placeholder="https://your-company.kissflow.com/process/2/..." error={!!errors.apiEndpoint} helperText={errors.apiEndpoint?.message} sx={{ gridColumn: '1 / -1' }} />
                    {values.authMethod === 'API_KEY' ? (
                      <>
                        <TextField {...register('apiKeyId')} label="Access key ID" autoComplete="off" />
                        <TextField {...register('apiKeySecret')} label="Access key secret" type="password" autoComplete="new-password" error={!!errors.apiKeySecret} helperText={errors.apiKeySecret?.message ?? 'Encrypted with AES-256-GCM'} />
                      </>
                    ) : (
                      <TextField {...register('bearerToken')} label="Bearer token" type="password" autoComplete="new-password" error={!!errors.bearerToken} helperText={errors.bearerToken?.message ?? 'Encrypted with AES-256-GCM'} sx={{ gridColumn: '1 / -1' }} />
                    )}
                  </Box>
                )}
                {values.integrationMode === 'MANUAL' && (
                  <Alert severity="info" sx={{ borderRadius: 3 }}>
                    Manual import (Phase 3) lets you upload test payloads to design field mappings before going live.
                  </Alert>
                )}
              </Stack>
            )}

            {step === 3 && (
              <Stack spacing={1} sx={{ pt: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Select the companies this application posts into. The <b>source company key</b> is the value in the Kissflow payload (for example the entity field) that identifies each company.
                </Typography>
                {companies.isLoading && <CircularProgress size={24} />}
                {!companies.isLoading && fields.length === 0 && <Alert severity="warning">No active companies yet. You can connect companies later from the application page.</Alert>}
                {fields.map((f, i) => (
                  <Stack key={f.id} direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' }, p: 1, borderRadius: 2, bgcolor: values.companies?.[i]?.selected ? alpha(theme.palette.primary.main, 0.05) : 'transparent' }}>
                    <Controller
                      name={`companies.${i}.selected`}
                      control={control}
                      render={({ field }) => <FormControlLabel control={<Checkbox checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />} label={f.name} sx={{ flex: 1, minWidth: 0 }} />}
                    />
                    <TextField
                      {...register(`companies.${i}.sourceCompanyKey`)}
                      size="small"
                      label="Source company key"
                      disabled={!values.companies?.[i]?.selected}
                      error={!!errors.companies?.[i]?.sourceCompanyKey}
                      helperText={errors.companies?.[i]?.sourceCompanyKey?.message}
                      sx={{ width: { sm: 280 } }}
                    />
                  </Stack>
                ))}
              </Stack>
            )}

            {step === 4 && (
              <Stack spacing={2.5} sx={{ pt: 1 }}>
                <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                  <Box sx={{ width: 56, height: 56, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: alpha(values.color ?? '#4F46E5', 0.15), color: values.color }}>
                    <Icon size={28} />
                  </Box>
                  <Box>
                    <Typography variant="h5">{values.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {values.code?.toUpperCase()} · {APPLICATION_TYPE_LABELS[(values.applicationType ?? 'OTHER') as ApplicationType]}
                    </Typography>
                  </Box>
                </Stack>
                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                  <Typography variant="body2">
                    <b>Integration:</b> {MODE_LABELS[values.integrationMode ?? 'WEBHOOK'].label} · {AUTH_LABELS[values.authMethod ?? 'NONE']}
                  </Typography>
                  <Typography variant="body2">
                    <b>Kissflow app:</b> {values.kissflowAppId || '-'}
                  </Typography>
                  <Typography variant="body2">
                    <b>Default voucher:</b> {values.defaultVoucherKind ? VOUCHER_KIND_LABELS[values.defaultVoucherKind as VoucherKind] : '-'}
                  </Typography>
                  <Typography variant="body2">
                    <b>Companies:</b> {selectedCompanies.length ? selectedCompanies.map((c) => c?.name).join(', ') : 'None yet'}
                  </Typography>
                </Box>
                <Controller
                  name="activate"
                  control={control}
                  render={({ field }) => (
                    <Box>
                      <FormControlLabel control={<Checkbox checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />} label="Activate now (otherwise saved as Draft)" />
                      {errors.activate && (
                        <Typography variant="caption" color="error" sx={{ display: 'block' }}>
                          {errors.activate.message}
                        </Typography>
                      )}
                    </Box>
                  )}
                />
              </Stack>
            )}
          </motion.div>
        </AnimatePresence>
      </DialogContent>
      <DialogActions sx={{ p: 2.5, justifyContent: 'space-between' }}>
        <Button onClick={() => (step === 0 ? close() : setStep((s) => s - 1))} startIcon={step === 0 ? undefined : <ArrowLeft size={16} />} color="inherit" disabled={create.isPending}>
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="contained" endIcon={<ArrowRight size={16} />} onClick={() => void next()}>
            Continue
          </Button>
        ) : (
          <Button variant="contained" onClick={() => void submit()} disabled={create.isPending} startIcon={create.isPending ? <CircularProgress size={16} color="inherit" /> : <Check size={16} />}>
            Register application
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
