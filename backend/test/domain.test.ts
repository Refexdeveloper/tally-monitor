import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, InvalidTransitionError, JOB_STATUSES, JOB_TRANSITIONS, retryDelaySeconds } from '../src/domain/jobStatus';
import { companyScope } from '../src/services/access';
import type { AuthContext } from '../src/services/auth/authContext';
import { passwordSchema } from '../src/services/auth/passwordPolicy';
import { decryptSecret, encryptSecret, hmacSha256, timingSafeEqualStr } from '../src/utils/crypto';

describe('job state machine', () => {
  it('defines transitions for every status', () => {
    expect(Object.keys(JOB_TRANSITIONS).sort()).toEqual([...JOB_STATUSES].sort());
  });

  it('only targets known statuses', () => {
    for (const targets of Object.values(JOB_TRANSITIONS)) for (const t of targets) expect(JOB_STATUSES).toContain(t);
  });

  it('treats POSTED and CANCELLED as terminal', () => {
    expect(JOB_TRANSITIONS.POSTED).toHaveLength(0);
    expect(JOB_TRANSITIONS.CANCELLED).toHaveLength(0);
  });

  it('never lets an in-flight posting return to READY_TO_POST or be cancelled blindly', () => {
    expect(canTransition('PROCESSING', 'READY_TO_POST')).toBe(false);
    expect(canTransition('PROCESSING', 'CANCELLED')).toBe(false);
    expect(canTransition('RECONCILIATION_REQUIRED', 'PROCESSING')).toBe(false);
  });

  it('requires approval path before posting', () => {
    expect(canTransition('RECEIVED', 'PROCESSING')).toBe(false);
    expect(canTransition('AWAITING_APPROVAL', 'PROCESSING')).toBe(false);
    expect(canTransition('AWAITING_APPROVAL', 'READY_TO_POST')).toBe(true);
  });

  it('throws a typed error on invalid transitions', () => {
    expect(() => assertTransition('POSTED', 'RETRY_PENDING')).toThrow(InvalidTransitionError);
    expect(() => assertTransition('FAILED', 'RETRY_PENDING')).not.toThrow();
  });

  it('computes capped exponential backoff', () => {
    const mid = () => 0.5;
    expect(retryDelaySeconds(1, 60, 3600, mid)).toBe(60);
    expect(retryDelaySeconds(3, 60, 3600, mid)).toBe(240);
    expect(retryDelaySeconds(20, 60, 3600, mid)).toBe(3600);
  });
});

describe('secret encryption', () => {
  const key = crypto.randomBytes(32);

  it('round-trips with AES-256-GCM', () => {
    const cipher = encryptSecret('kissflow-api-secret', key);
    expect(cipher.startsWith('v1.')).toBe(true);
    expect(cipher).not.toContain('kissflow-api-secret');
    expect(decryptSecret(cipher, key)).toBe('kissflow-api-secret');
  });

  it('detects tampering and wrong keys', () => {
    const cipher = encryptSecret('value', key);
    const parts = cipher.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptSecret(parts.join('.'), key)).toThrow();
    expect(() => decryptSecret(cipher, crypto.randomBytes(32))).toThrow();
  });

  it('produces stable HMAC signatures and constant-time comparison', () => {
    const sig = hmacSha256('secret', '{"a":1}');
    expect(sig).toBe(crypto.createHmac('sha256', 'secret').update('{"a":1}').digest('hex'));
    expect(timingSafeEqualStr(sig, sig)).toBe(true);
    expect(timingSafeEqualStr(sig, sig.slice(1))).toBe(false);
  });
});

describe('password policy', () => {
  it('rejects weak passwords', () => {
    for (const p of ['short', 'alllowercase123!', 'NoNumbersHere!!', 'NoSymbols12345']) expect(passwordSchema.safeParse(p).success).toBe(false);
  });
  it('accepts strong passwords', () => {
    expect(passwordSchema.safeParse('Tally#Monitor2026').success).toBe(true);
  });
});

describe('company scope', () => {
  const ctx = (companyIds: AuthContext['companyIds']) => ({ companyIds }) as AuthContext;

  it('allows all companies for ALL scope', () => {
    expect(companyScope(ctx('ALL'), 'e.company_id')).toEqual({ sql: '1=1', replacements: {} });
  });
  it('denies everything when no companies are assigned', () => {
    expect(companyScope(ctx([]), 'e.company_id').sql).toBe('1=0');
  });
  it('parameterizes assigned companies', () => {
    expect(companyScope(ctx([3, 7]), 'j.company_id')).toEqual({ sql: 'j.company_id IN (:scopeCompanyIds)', replacements: { scopeCompanyIds: [3, 7] } });
  });
  it('rejects unsafe column expressions', () => {
    expect(() => companyScope(ctx('ALL'), 'company_id; DROP TABLE users')).toThrow();
  });
});
