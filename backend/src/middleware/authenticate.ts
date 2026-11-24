import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import { User, UserSession } from '../models';
import { loadAuthContext } from '../services/auth/authContext';
import { verifyAccessToken } from '../services/auth/tokens';
import { ApiError } from '../utils/http';

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) throw ApiError.unauthorized();

  let claims;
  try {
    claims = verifyAccessToken(header.slice(7).trim());
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw ApiError.unauthorized('Access token expired', 'TOKEN_EXPIRED');
    throw ApiError.unauthorized('Invalid access token', 'TOKEN_INVALID');
  }

  // Revoked sessions (logout, password reset, reuse detection) lose access immediately.
  const session = await UserSession.findOne({
    where: { uuid: claims.sid, revokedAt: { [Op.is]: null }, expiresAt: { [Op.gt]: new Date() } },
    include: [{ model: User, as: 'user', attributes: ['id', 'uuid'], required: true }],
  });
  const sessionUser = (session as (UserSession & { user?: User }) | null)?.user;
  if (!session || !sessionUser || sessionUser.uuid !== claims.sub) throw ApiError.unauthorized('Session is no longer valid', 'SESSION_INVALID');

  const ctx = await loadAuthContext(sessionUser.id, session.id);
  if (!ctx) throw ApiError.unauthorized('Account is not available', 'SESSION_INVALID');
  req.auth = ctx;
  next();
}

/** Requires every listed permission. */
export function requirePermission(...permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) throw ApiError.unauthorized();
    const missing = permissions.filter((p) => !req.auth!.permissions.has(p));
    if (missing.length) throw ApiError.forbidden();
    next();
  };
}
