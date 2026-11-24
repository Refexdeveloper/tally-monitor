import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { randomToken, timingSafeEqualStr } from '../utils/crypto';
import { ApiError } from '../utils/http';

export const REFRESH_COOKIE = 'tm_rt';
export const CSRF_COOKIE = 'tm_csrf';
export const CSRF_HEADER = 'x-csrf-token';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

function baseCookie(): CookieOptions {
  return { secure: env.cookieSecure, sameSite: 'strict' };
}

/**
 * Sets the HTTP-only refresh cookie plus a readable CSRF cookie
 * (double-submit pattern). Non "remember me" sessions use browser-session cookies.
 */
export function setSessionCookies(res: Response, refreshToken: string, expiresAt: Date, rememberMe: boolean) {
  const lifetime = rememberMe ? { expires: expiresAt } : {};
  res.cookie(REFRESH_COOKIE, refreshToken, { ...baseCookie(), httpOnly: true, path: REFRESH_COOKIE_PATH, ...lifetime });
  res.cookie(CSRF_COOKIE, randomToken(24), { ...baseCookie(), httpOnly: false, path: '/', ...lifetime });
}

export function clearSessionCookies(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { ...baseCookie(), httpOnly: true, path: REFRESH_COOKIE_PATH });
  res.clearCookie(CSRF_COOKIE, { ...baseCookie(), path: '/' });
}

/** Protects cookie-authenticated endpoints (refresh, logout). */
export function requireCsrf(req: Request, _res: Response, next: NextFunction) {
  const cookie = req.cookies?.[CSRF_COOKIE] as string | undefined;
  const header = req.header(CSRF_HEADER);
  if (!cookie || !header || !timingSafeEqualStr(cookie, header)) {
    throw new ApiError(403, 'CSRF_FAILED', 'Security token missing or invalid. Please sign in again.');
  }
  next();
}
