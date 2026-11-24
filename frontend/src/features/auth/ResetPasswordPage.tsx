import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, CircularProgress, LinearProgress, Link, Stack, TextField, Typography } from '@mui/material';
import { motion } from 'framer-motion';
import { ArrowLeft, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { toApiError } from '@/api/client';
import { authApi } from '@/api/endpoints';
import { toast } from '@/stores/toast';
import { AuthLayout } from './AuthLayout';

const password = z
  .string()
  .min(12, 'At least 12 characters')
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v), 'Use upper and lower case letters')
  .refine((v) => /\d/.test(v), 'Include a number')
  .refine((v) => /[^A-Za-z0-9]/.test(v), 'Include a symbol');

const schema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });

function strength(value: string) {
  const checks = [value.length >= 12, /[a-z]/.test(value) && /[A-Z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value), value.length >= 16];
  return checks.filter(Boolean).length * 20;
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } });
  const score = strength(watch('password'));

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const res = await authApi.resetPassword(token, values.password);
      toast.success(res.message, 'Password updated');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(toApiError(err).message);
    }
  });

  return (
    <AuthLayout>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <Typography variant="h3" sx={{ mb: 1 }}>
          Choose a new password
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          Use at least 12 characters with upper and lower case letters, a number and a symbol. All active sessions will be signed out.
        </Typography>
        {!token ? (
          <Alert severity="warning" sx={{ borderRadius: 3 }}>
            This reset link is incomplete. Request a new link from the sign-in page.
          </Alert>
        ) : (
          <Box component="form" noValidate onSubmit={onSubmit}>
            <Stack spacing={2.5}>
              {error && <Alert severity="error" sx={{ borderRadius: 3 }}>{error}</Alert>}
              <Box>
                <TextField {...register('password')} label="New password" type="password" autoComplete="new-password" fullWidth error={Boolean(errors.password)} helperText={errors.password?.message} />
                <LinearProgress
                  variant="determinate"
                  value={score}
                  color={score >= 80 ? 'success' : score >= 60 ? 'warning' : 'error'}
                  sx={{ mt: 1, height: 6, borderRadius: 3 }}
                  aria-label="Password strength"
                />
              </Box>
              <TextField {...register('confirm')} label="Confirm password" type="password" autoComplete="new-password" error={Boolean(errors.confirm)} helperText={errors.confirm?.message} />
              <Button type="submit" size="large" variant="contained" disabled={isSubmitting} startIcon={isSubmitting ? <CircularProgress size={18} color="inherit" /> : <KeyRound size={18} />}>
                {isSubmitting ? 'Updating...' : 'Update password'}
              </Button>
            </Stack>
          </Box>
        )}
        <Link component={RouterLink} to="/login" underline="hover" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, mt: 3, fontWeight: 600 }}>
          <ArrowLeft size={16} /> Back to sign in
        </Link>
      </motion.div>
    </AuthLayout>
  );
}
