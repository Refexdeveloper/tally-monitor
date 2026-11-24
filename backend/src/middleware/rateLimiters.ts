import type { Request } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const json = (code: string, message: string) => ({ success: false, error: { code, message } });

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 600,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: json('RATE_LIMITED', 'Too many requests. Please slow down.'),
});

/** Per IP + email so one attacker cannot lock out everybody behind a shared NAT as quickly. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req: Request) => `${ipKeyGenerator(req.ip ?? '')}:${String(req.body?.email ?? '').toLowerCase()}`,
  message: json('RATE_LIMITED', 'Too many sign-in attempts. Please wait a few minutes and try again.'),
});

export const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: json('RATE_LIMITED', 'Too many requests. Please try again later.'),
});
