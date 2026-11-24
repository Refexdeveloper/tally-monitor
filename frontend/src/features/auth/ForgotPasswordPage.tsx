import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, CircularProgress, InputAdornment, Link, Stack, TextField, Typography } from '@mui/material';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail, Send } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link as RouterLink } from 'react-router';
import { z } from 'zod';
import { toApiError } from '@/api/client';
import { authApi } from '@/api/endpoints';
import { MascotIllustration } from '@/components/illustrations/MascotIllustration';
import { AuthLayout } from './AuthLayout';

const schema = z.object({ email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address') });

export function ForgotPasswordPage() {
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null);
    try {
      const res = await authApi.forgotPassword(email);
      setSent(res.message);
    } catch (err) {
      setError(toApiError(err).message);
    }
  });

  return (
    <AuthLayout>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
          <MascotIllustration size={130} mood={sent ? 'happy' : 'thinking'} />
        </Box>
        <Typography variant="h3" sx={{ mb: 1, textAlign: 'center' }}>
          Forgot your password?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4, textAlign: 'center' }}>
          Enter the email linked to your account and we'll send you a secure reset link.
        </Typography>
        {sent ? (
          <Alert severity="success" sx={{ borderRadius: 3 }}>
            {sent}
          </Alert>
        ) : (
          <Box component="form" noValidate onSubmit={onSubmit}>
            <Stack spacing={2.5}>
              {error && <Alert severity="error" sx={{ borderRadius: 3 }}>{error}</Alert>}
              <TextField
                {...register('email')}
                label="Email address"
                type="email"
                autoComplete="email"
                autoFocus
                error={Boolean(errors.email)}
                helperText={errors.email?.message}
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><Mail size={18} /></InputAdornment> } }}
              />
              <Button type="submit" size="large" variant="contained" disabled={isSubmitting} startIcon={isSubmitting ? <CircularProgress size={18} color="inherit" /> : <Send size={18} />}>
                {isSubmitting ? 'Sending...' : 'Send reset link'}
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
