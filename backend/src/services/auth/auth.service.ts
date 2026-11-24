import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { Op, type Transaction } from 'sequelize';
import { env } from '../../config/env';
import { PasswordResetToken, sequelize, User, UserSession } from '../../models';
import { randomToken, sha256 } from '../../utils/crypto';
import { ApiError } from '../../utils/http';
import { audit } from '../audit.service';
import { sendPasswordResetEmail } from '../mail.service';
import { loadAuthContext, toProfile } from './authContext';
import { signAccessToken } from './tokens';

const BCRYPT_ROUNDS = 12;
/** Concurrent refreshes (e.g. two tabs) within this window are not treated as token theft. */
const ROTATION_GRACE_MS = 20_000;
// Equalizes timing for unknown emails so account existence is not observable.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), BCRYPT_ROUNDS);

export interface IssuedSession {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  rememberMe: boolean;
  profile: Awaited<ReturnType<typeof toProfile>>;
}

function sessionLifetimeMs(rememberMe: boolean) {
  return rememberMe ? env.REFRESH_REMEMBER_TTL_DAYS * 86_400_000 : env.REFRESH_TTL_HOURS * 3_600_000;
}

async function issueSession(user: User, opts: { rememberMe: boolean; familyId?: string; expiresAt?: Date; req: Request; transaction?: Transaction }) {
  const refreshToken = randomToken(48);
  const session = await UserSession.create(
    {
    userId: user.id,
    familyId: opts.familyId ?? crypto.randomUUID(),
    tokenHash: sha256(refreshToken),
    rememberMe: opts.rememberMe,
    expiresAt: opts.expiresAt ?? new Date(Date.now() + sessionLifetimeMs(opts.rememberMe)),
    revokedAt: null,
    revokedReason: null,
    replacedById: null,
    lastUsedAt: new Date(),
    ipAddress: opts.req.ip ?? null,
    userAgent: opts.req.header('user-agent')?.slice(0, 500) ?? null,
    },
    { transaction: opts.transaction },
  );
  const ctx = await loadAuthContext(user.id, session.id);
  if (!ctx) throw ApiError.unauthorized('Account is not available');
  return {
    session,
    issued: {
      accessToken: signAccessToken(user.uuid, session.uuid),
      expiresIn: env.JWT_ACCESS_TTL_SECONDS,
      refreshToken,
      refreshExpiresAt: session.expiresAt,
      rememberMe: opts.rememberMe,
      profile: await toProfile(ctx),
    } satisfies IssuedSession,
  };
}

export async function login(email: string, password: string, rememberMe: boolean, req: Request): Promise<IssuedSession> {
  const user = await User.scope('withPassword').findOne({ where: { email: email.trim().toLowerCase() } });
  const invalid = () => new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    await audit({ action: 'LOGIN_FAILED', actorType: 'SYSTEM', metadata: { reason: 'UNKNOWN_EMAIL' } }, req);
    throw invalid();
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await audit({ action: 'LOGIN_BLOCKED_LOCKED', userId: user.id, entityType: 'user', entityUuid: user.uuid }, req);
    throw new ApiError(423, 'ACCOUNT_LOCKED', `Too many failed attempts. Try again after ${user.lockedUntil.toISOString()}.`, {
      lockedUntil: user.lockedUntil.toISOString(),
    });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const lock = attempts >= env.AUTH_MAX_FAILED_ATTEMPTS;
    await user.update({
      failedLoginAttempts: lock ? 0 : attempts,
      lockedUntil: lock ? new Date(Date.now() + env.AUTH_LOCKOUT_MINUTES * 60_000) : user.lockedUntil,
    });
    await audit(
      { action: lock ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED', userId: user.id, entityType: 'user', entityUuid: user.uuid, metadata: { attempts } },
      req,
    );
    throw invalid();
  }

  if (!user.isActive) {
    await audit({ action: 'LOGIN_BLOCKED_INACTIVE', userId: user.id, entityType: 'user', entityUuid: user.uuid }, req);
    throw new ApiError(403, 'ACCOUNT_DISABLED', 'This account has been disabled. Contact your administrator.');
  }

  await user.update({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: req.ip ?? null });
  const { session, issued } = await issueSession(user, { rememberMe, req });
  await audit({ action: 'LOGIN_SUCCESS', userId: user.id, entityType: 'session', entityUuid: session.uuid, metadata: { rememberMe } }, req);
  return issued;
}

export async function refresh(refreshToken: string, req: Request): Promise<IssuedSession> {
  const existing = await UserSession.findOne({ where: { tokenHash: sha256(refreshToken) } });
  if (!existing) throw ApiError.unauthorized('Session expired. Please sign in again.', 'SESSION_INVALID');

  if (existing.revokedAt) {
    const sinceRevoked = Date.now() - existing.revokedAt.getTime();
    if (existing.revokedReason === 'ROTATED' && sinceRevoked < ROTATION_GRACE_MS) {
      throw new ApiError(409, 'REFRESH_RACE', 'Session was refreshed by another request');
    }
    // A rotated token presented again outside the grace window indicates theft: revoke the whole family.
    await UserSession.update(
      { revokedAt: new Date(), revokedReason: 'REUSE_DETECTED' },
      { where: { familyId: existing.familyId, revokedAt: { [Op.is]: null } } },
    );
    await audit({ action: 'REFRESH_TOKEN_REUSE_DETECTED', userId: existing.userId, entityType: 'session', entityUuid: existing.uuid }, req);
    throw ApiError.unauthorized('Session expired. Please sign in again.', 'SESSION_INVALID');
  }

  if (existing.expiresAt <= new Date()) throw ApiError.unauthorized('Session expired. Please sign in again.', 'SESSION_EXPIRED');

  const user = await User.findByPk(existing.userId);
  if (!user || !user.isActive) {
    await existing.update({ revokedAt: new Date(), revokedReason: 'USER_INACTIVE' });
    throw ApiError.unauthorized('Account is not available', 'SESSION_INVALID');
  }

  return sequelize.transaction(async (transaction) => {
    // Conditional update guarantees only one concurrent request rotates this token.
    const [claimed] = await UserSession.update(
      { revokedAt: new Date(), revokedReason: 'ROTATED', lastUsedAt: new Date() },
      { where: { id: existing.id, revokedAt: { [Op.is]: null } }, transaction },
    );
    if (claimed === 0) throw new ApiError(409, 'REFRESH_RACE', 'Session was refreshed by another request');

    // Absolute expiry is preserved across rotations.
    const { session, issued } = await issueSession(user, {
      rememberMe: existing.rememberMe,
      familyId: existing.familyId,
      expiresAt: existing.expiresAt,
      req,
      transaction,
    });
    await UserSession.update({ replacedById: session.id }, { where: { id: existing.id }, transaction });
    return issued;
  });
}

export async function logout(sessionId: number | null, refreshToken: string | undefined, req: Request) {
  const where = sessionId ? { id: sessionId } : refreshToken ? { tokenHash: sha256(refreshToken) } : null;
  if (!where) return;
  const session = await UserSession.findOne({ where });
  if (!session) return;
  await UserSession.update(
    { revokedAt: new Date(), revokedReason: 'LOGOUT' },
    { where: { familyId: session.familyId, revokedAt: { [Op.is]: null } } },
  );
  await audit({ action: 'LOGOUT', userId: session.userId, entityType: 'session', entityUuid: session.uuid }, req);
}

export async function requestPasswordReset(email: string, req: Request) {
  const user = await User.findOne({ where: { email: email.trim().toLowerCase() } });
  if (!user || !user.isActive) {
    await audit({ action: 'PASSWORD_RESET_REQUESTED', actorType: 'SYSTEM', metadata: { matched: false } }, req);
    return;
  }
  const token = randomToken(32);
  await sequelize.transaction(async (transaction) => {
    await PasswordResetToken.update({ usedAt: new Date() }, { where: { userId: user.id, usedAt: { [Op.is]: null } }, transaction });
    await PasswordResetToken.create(
      {
        userId: user.id,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60_000),
        usedAt: null,
        requestedIp: req.ip ?? null,
      },
      { transaction },
    );
  });
  const url = new URL('/reset-password', env.APP_PUBLIC_URL);
  url.searchParams.set('token', token);
  await sendPasswordResetEmail(user.email, user.fullName, url.toString());
  await audit({ action: 'PASSWORD_RESET_REQUESTED', userId: user.id, entityType: 'user', entityUuid: user.uuid }, req);
}

export async function resetPassword(token: string, newPassword: string, req: Request) {
  const record = await PasswordResetToken.findOne({ where: { tokenHash: sha256(token) } });
  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    throw new ApiError(400, 'RESET_TOKEN_INVALID', 'This reset link is invalid or has expired. Request a new one.');
  }
  const user = await User.findByPk(record.userId);
  if (!user || !user.isActive) throw new ApiError(400, 'RESET_TOKEN_INVALID', 'This reset link is invalid or has expired.');

  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await sequelize.transaction(async (transaction) => {
    await user.update({ passwordHash: hash, passwordChangedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null }, { transaction });
    await record.update({ usedAt: new Date() }, { transaction });
    await UserSession.update(
      { revokedAt: new Date(), revokedReason: 'PASSWORD_RESET' },
      { where: { userId: user.id, revokedAt: { [Op.is]: null } }, transaction },
    );
    await audit({ action: 'PASSWORD_RESET_COMPLETED', userId: user.id, entityType: 'user', entityUuid: user.uuid }, req, transaction);
  });
}
