import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

const ISSUER = 'tally-monitor';
const AUDIENCE = 'tally-monitor-web';

export interface AccessTokenClaims {
  sub: string;
  sid: string;
  typ: 'access';
}

export function signAccessToken(userUuid: string, sessionUuid: string): string {
  return jwt.sign({ sid: sessionUuid, typ: 'access' }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    subject: userUuid,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
  if (typeof payload !== 'object' || payload.typ !== 'access' || typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
    throw new jwt.JsonWebTokenError('Malformed access token');
  }
  return { sub: payload.sub, sid: payload.sid, typ: 'access' };
}
