import { zodResolver } from '@hookform/resolvers/zod';
import { Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, FormControlLabel, FormGroup, FormHelperText, Radio, RadioGroup, Stack, Switch, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import type { AppUser, PermissionDto, RoleDto } from '@/api/adminTypes';
import { companiesApi, usersApi } from '@/api/adminEndpoints';
import { DialogHeader } from '@/components/common/Dialogs';
import { applyServerErrors, useApiMutation } from '@/hooks/useApiMutation';
import { useAuthStore } from '@/stores/auth';
import { humanize } from '@/utils/format';

const strongPassword = z
  .string()
  .min(12, 'At least 12 characters')
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v), 'Use upper and lower case letters')
  .refine((v) => /\d/.test(v), 'Include a number')
  .refine((v) => /[^A-Za-z0-9]/.test(v), 'Include a symbol');

const userSchema = (creating: boolean) =>
  z
    .object({
      email: z.string().trim(),
      fullName: z.string().trim().min(2, 'Full name is required').max(150),
      password: z.string(),
      roles: z.array(z.string()).min(1, 'Assign at least one role'),
      companyScope: z.enum(['ALL', 'ASSIGNED']),
      companyIds: z.array(z.string()),
      isActive: z.boolean(),
    })
    .superRefine((v, ctx) => {
      if (creating) {
        if (!z.string().email().safeParse(v.email).success) ctx.addIssue({ code: 'custom', path: ['email'], message: 'Enter a valid email address' });
        const p = strongPassword.safeParse(v.password);
        if (!p.success) ctx.addIssue({ code: 'custom', path: ['password'], message: p.error.issues[0]!.message });
      }
      if (v.companyScope === 'ASSIGNED' && v.companyIds.length === 0) ctx.addIssue({ code: 'custom', path: ['companyIds'], message: 'Select at least one company or grant access to all companies' });
    });
type UserForm = z.infer<ReturnType<typeof userSchema>>;

export function UserFormDialog({ open, user, roles, onClose }: { open: boolean; user: AppUser | null; roles: RoleDto[]; onClose: () => void }) {
  const creating = !user;
  const me = useAuthStore((s) => s.user);
  const iAmSuper = me?.roles.some((r) => r.code === 'SUPER_ADMIN') ?? false;
  const iHaveAll = me?.companyScope === 'ALL';
  const companies = useQuery({ queryKey: ['companies', 'all'], queryFn: () => companiesApi.list({ pageSize: 100, sort: 'name', order: 'asc' }), enabled: open });

  const { register, control, handleSubmit, setError, formState: { errors } } = useForm<UserForm>({
    resolver: zodResolver(userSchema(creating)),
    values: {
      email: user?.email ?? '',
      fullName: user?.fullName ?? '',
      password: '',
      roles: user?.roles.map((r) => r.code) ?? ['VIEWER'],
      companyScope: user?.companyScope ?? 'ASSIGNED',
      companyIds: user?.companies.map((c) => c.id) ?? [],
      isActive: user?.isActive ?? true,
    },
  });
  const scope = useWatch({ control, name: 'companyScope' });

  const save = useApiMutation(
    (v: UserForm) => {
      const common = { fullName: v.fullName, roles: v.roles, companyScope: v.companyScope, companyIds: v.companyScope === 'ASSIGNED' ? v.companyIds : [], isActive: v.isActive };
      return creating ? usersApi.create({ ...common, email: v.email, password: v.password }) : usersApi.update(user.id, common);
    },
    { success: creating ? 'User created' : 'User updated', invalidate: [['users'], ['roles']], onSuccess: onClose },
  );
  const companyOptions = companies.data?.items ?? [];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogHeader title={creating ? 'Add user' : `Edit ${user.fullName}`} subtitle={creating ? 'The user signs in with this temporary password and can reset it any time.' : user.email} onClose={onClose} />
      <DialogContent>
        <Box component="form" id="user-form" onSubmit={handleSubmit((v) => save.mutate(v, { onError: (e) => applyServerErrors(e, setError as never) }))}>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {creating && <TextField {...register('email')} label="Email address" type="email" autoComplete="off" error={!!errors.email} helperText={errors.email?.message} autoFocus />}
            <TextField {...register('fullName')} label="Full name" error={!!errors.fullName} helperText={errors.fullName?.message} />
            {creating && <TextField {...register('password')} label="Temporary password" type="password" autoComplete="new-password" error={!!errors.password} helperText={errors.password?.message ?? '12+ characters with upper/lower case, a number and a symbol'} />}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                Roles
              </Typography>
              <Controller
                name="roles"
                control={control}
                render={({ field }) => (
                  <FormGroup row>
                    {roles.map((r) => (
                      <FormControlLabel
                        key={r.code}
                        label={r.name}
                        disabled={r.code === 'SUPER_ADMIN' && !iAmSuper}
                        control={<Checkbox checked={field.value.includes(r.code)} onChange={(e) => field.onChange(e.target.checked ? [...field.value, r.code] : field.value.filter((c) => c !== r.code))} />}
                      />
                    ))}
                  </FormGroup>
                )}
              />
              {errors.roles && <FormHelperText error>{errors.roles.message}</FormHelperText>}
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                Company access
              </Typography>
              <Controller
                name="companyScope"
                control={control}
                render={({ field }) => (
                  <RadioGroup row value={field.value} onChange={(e) => field.onChange(e.target.value)}>
                    <FormControlLabel value="ASSIGNED" control={<Radio />} label="Selected companies" />
                    <FormControlLabel value="ALL" control={<Radio />} label="All companies" disabled={!iHaveAll} />
                  </RadioGroup>
                )}
              />
              {scope === 'ASSIGNED' && (
                <Controller
                  name="companyIds"
                  control={control}
                  render={({ field }) => (
                    <Autocomplete
                      multiple
                      options={companyOptions.map((c) => c.id)}
                      getOptionLabel={(id) => companyOptions.find((c) => c.id === id)?.name ?? user?.companies.find((c) => c.id === id)?.name ?? id}
                      value={field.value}
                      onChange={(_, v) => field.onChange(v)}
                      loading={companies.isLoading}
                      renderInput={(p) => <TextField {...p} label="Companies" error={!!errors.companyIds} helperText={errors.companyIds?.message} />}
                    />
                  )}
                />
              )}
            </Box>
            <Controller name="isActive" control={control} render={({ field }) => <FormControlLabel control={<Switch checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />} label="Account active" />} />
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2.5 }}>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" form="user-form" variant="contained" disabled={save.isPending} startIcon={save.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {creating ? 'Create user' : 'Save changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function PasswordResetDialog({ user, onClose }: { user: AppUser | null; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const check = strongPassword.safeParse(password);
  const save = useApiMutation(() => usersApi.setPassword(user!.id, password), {
    success: 'Password updated and all sessions signed out',
    onSuccess: () => {
      setPassword('');
      onClose();
    },
  });
  return (
    <Dialog open={Boolean(user)} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogHeader title="Set new password" subtitle={user?.email} onClose={onClose} />
      <DialogContent>
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          fullWidth
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={password.length > 0 && !check.success}
          helperText={password.length > 0 && !check.success ? check.error.issues[0]!.message : 'The user is signed out everywhere.'}
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions sx={{ p: 2.5 }}>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" disabled={!check.success || save.isPending} onClick={() => save.mutate(undefined)}>
          Update password
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function RoleEditorDialog({ role, permissions, open, onClose }: { role: RoleDto | null; permissions: PermissionDto[]; open: boolean; onClose: () => void }) {
  const creating = !role;
  const [code, setCode] = useState('');
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selected, setSelected] = useState<string[]>(role?.permissions ?? []);
  const modules = [...new Set(permissions.map((p) => p.module))];

  const save = useApiMutation(
    () => (creating ? usersApi.createRole({ code, name, description: description || null, permissions: selected }) : usersApi.updateRole(role.id, { name, description: description || null, permissions: selected })),
    { success: creating ? 'Role created' : 'Role permissions saved', invalidate: [['roles'], ['users']], onSuccess: onClose },
  );
  const toggle = (code: string) => setSelected((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]));
  const codeValid = /^[A-Za-z][A-Za-z0-9_]{2,63}$/.test(code);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogHeader title={creating ? 'Create role' : `Permissions · ${role.name}`} subtitle={`${selected.length} of ${permissions.length} permissions granted`} onClose={onClose} />
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: creating ? '1fr 1fr' : '1fr' } }}>
            {creating && <TextField label="Role code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} error={code.length > 0 && !codeValid} helperText="e.g. AUDITOR" />}
            <TextField label="Role name" value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} sx={{ gridColumn: '1 / -1' }} />
          </Box>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' } }}>
            {modules.map((m) => {
              const perms = permissions.filter((p) => p.module === m);
              const all = perms.every((p) => selected.includes(p.code));
              return (
                <Box key={m} sx={{ p: 1.5, borderRadius: 3, border: (t) => `1px solid ${t.palette.divider}` }}>
                  <FormControlLabel
                    label={<Typography variant="subtitle2">{humanize(m)}</Typography>}
                    control={
                      <Checkbox
                        checked={all}
                        indeterminate={!all && perms.some((p) => selected.includes(p.code))}
                        onChange={() => setSelected((s) => (all ? s.filter((c) => !perms.some((p) => p.code === c)) : [...new Set([...s, ...perms.map((p) => p.code)])]))}
                      />
                    }
                  />
                  {perms.map((p) => (
                    <FormControlLabel
                      key={p.code}
                      sx={{ display: 'flex', ml: 2 }}
                      label={
                        <Typography variant="body2" title={p.code}>
                          {p.description ?? p.code}
                        </Typography>
                      }
                      control={<Checkbox size="small" checked={selected.includes(p.code)} onChange={() => toggle(p.code)} />}
                    />
                  ))}
                </Box>
              );
            })}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2.5, justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={0.5}>
          {selected.length === 0 && <Chip size="small" color="warning" label="No permissions selected" />}
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button color="inherit" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="contained" disabled={save.isPending || name.trim().length < 2 || (creating && !codeValid)} onClick={() => save.mutate(undefined)}>
            {creating ? 'Create role' : 'Save permissions'}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
