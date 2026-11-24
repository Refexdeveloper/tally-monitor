import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { clearSessionCookies, REFRESH_COOKIE, requireCsrf, setSessionCookies } from '../middleware/csrf';
import { loginLimiter, sensitiveLimiter } from '../middleware/rateLimiters';
import { validate } from '../middleware/validate';
import * as authService from '../services/auth/auth.service';
import type { IssuedSession } from '../services/auth/auth.service';
import { toProfile } from '../services/auth/authContext';
import { passwordSchema } from '../services/auth/passwordPolicy';
import { ApiError, ok } from '../utils/http';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(255),
  password: z.string().min(1, 'Password is required').max(128),
  rememberMe: z.boolean().optional().default(false),
});

function respondWithSession(res: Response, issued: IssuedSession) {
  setSessionCookies(res, issued.refreshToken, issued.refreshExpiresAt, issued.rememberMe);
  res.setHeader('Cache-Control', 'no-store');
  return ok(res, { accessToken: issued.accessToken, expiresIn: issued.expiresIn, user: issued.profile });
}

authRouter.post('/login', loginLimiter, validate('body', loginSchema), async (req: Request, res: Response) => {
  const { email, password, rememberMe } = req.body as z.infer<typeof loginSchema>;
  const issued = await authService.login(email, password, rememberMe, req);
  respondWithSession(res, issued);
});

authRouter.post('/refresh', requireCsrf, async (req: Request, res: Response) => {
  const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!token) throw ApiError.unauthorized('No active session', 'SESSION_INVALID');
  try {
    respondWithSession(res, await authService.refresh(token, req));
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) clearSessionCookies(res);
    throw err;
  }
});

authRouter.post('/logout', requireCsrf, async (req: Request, res: Response) => {
  await authService.logout(null, req.cookies?.[REFRESH_COOKIE] as string | undefined, req);
  clearSessionCookies(res);
  ok(res, { loggedOut: true });
});

authRouter.get('/me', authenticate, async (req: Request, res: Response) => {
  ok(res, await toProfile(req.auth!));
});

authRouter.post(
  '/forgot-password',
  sensitiveLimiter,
  validate('body', z.object({ email: z.string().trim().toLowerCase().email().max(255) })),
  async (req: Request, res: Response) => {
    await authService.requestPasswordReset((req.body as { email: string }).email, req);
    // Same response whether or not the account exists.
    ok(res, { message: 'If an account exists for this email, a reset link has been sent.' }, undefined, 202);
  },
);

authRouter.post(
  '/reset-password',
  sensitiveLimiter,
  validate('body', z.object({ token: z.string().min(20).max(200), password: passwordSchema })),
  async (req: Request, res: Response) => {
    const { token, password } = req.body as { token: string; password: string };
    await authService.resetPassword(token, password, req);
    clearSessionCookies(res);
    ok(res, { message: 'Password updated. Please sign in with your new password.' });
  },
);
