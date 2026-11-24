import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, IconButton, InputAdornment, Link, Stack, TextField, Typography } from '@mui/material';
import { motion, useAnimationControls } from 'framer-motion';
import { Eye, EyeOff, Lock, LogIn, Mail } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { toApiError } from '@/api/client';
import { authApi } from '@/api/endpoints';
import { useAuthStore } from '@/stores/auth';
import { toast } from '@/stores/toast';
import { AuthLayout } from './AuthLayout';

const schema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((s) => s.setSession);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shake = useAnimationControls();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '', rememberMe: false } });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const session = await authApi.login(values);
      setSession(session.accessToken, session.user);
      toast.success(`Welcome back, ${session.user.fullName.split(' ')[0]}!`);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (err) {
      const apiErr = toApiError(err);
      setError(apiErr.message);
      void shake.start({ x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.4 } });
    }
  });

  return (
    <AuthLayout>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <motion.div animate={shake}>
        <Typography variant="h3" sx={{ mb: 1 }}>
          Sign in
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          Welcome back! Sign in to monitor your Kissflow to TallyPrime integrations.
        </Typography>

        <Box component="form" noValidate onSubmit={onSubmit}>
          <Stack spacing={2.5}>
            {error && (
              <Alert severity="error" variant="outlined" sx={{ borderRadius: 3 }} role="alert">
                {error}
              </Alert>
            )}
            <Controller
              name="email"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Email address"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  fullWidth
                  error={Boolean(errors.email)}
                  helperText={errors.email?.message}
                  slotProps={{ input: { startAdornment: <InputAdornment position="start"><Mail size={18} /></InputAdornment> } }}
                />
              )}
            />
            <Controller
              name="password"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  fullWidth
                  error={Boolean(errors.password)}
                  helperText={errors.password?.message}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <Lock size={18} />
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton onClick={() => setShowPassword((v) => !v)} edge="end" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              )}
            />
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <Controller
                name="rememberMe"
                control={control}
                render={({ field }) => <FormControlLabel control={<Checkbox checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />} label="Remember me" />}
              />
              <Link component={RouterLink} to="/forgot-password" variant="body2" underline="hover" sx={{ fontWeight: 600 }}>
                Forgot password?
              </Link>
            </Stack>
            <Button
              type="submit"
              size="large"
              variant="contained"
              fullWidth
              disabled={isSubmitting}
              startIcon={isSubmitting ? <CircularProgress size={18} color="inherit" /> : <LogIn size={18} />}
              sx={{ transition: 'transform .15s', '&:active': { transform: 'scale(0.98)' } }}
            >
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </Button>
          </Stack>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 4, textAlign: 'center' }}>
          Access is restricted to authorized finance and integration staff. All activity is audited.
        </Typography>
      </motion.div>
      </motion.div>
    </AuthLayout>
  );
}
