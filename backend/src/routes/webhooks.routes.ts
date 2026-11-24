import express, { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { Application, ApplicationCredential } from '../models';
import { ingest, rejectIntake, type AuthResult, type IntakeMeta } from '../services/ingestion.service';
import { decryptSecret, hmacSha256, timingSafeEqualStr } from '../utils/crypto';

/**
 * Public Kissflow intake: POST /api/v1/webhooks/:applicationCode
 * Authenticates on the raw bytes, persists, and acknowledges. Never calls Tally.
 */
export const webhooksRouter = Router();

const MAX_CLOCK_SKEW_SECONDS = 300;
const KEPT_HEADERS = ['content-type', 'user-agent', 'x-request-id', 'idempotency-key', 'x-timestamp', 'x-kissflow-event', 'x-kissflow-account-id'];

const webhookLimiter = rateLimit({
  windowMs: 60_000,
  limit: 600,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req: Request) => `wh:${String(req.params.applicationCode ?? '').toUpperCase()}`,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many webhook requests for this application' } },
});

function keptHeaders(req: Request) {
  return Object.fromEntries(KEPT_HEADERS.map((h) => [h, req.header(h)]).filter(([, v]) => v)) as Record<string, string>;
}

async function authenticate(app: Application, req: Request, raw: Buffer): Promise<{ result: AuthResult; message?: string }> {
  if (app.authMethod === 'NONE') return { result: 'INVALID', message: 'Webhook authentication is not configured for this application' };
  const cred = await ApplicationCredential.unscoped().findOne({ where: { applicationId: app.id, credentialType: 'WEBHOOK_SECRET', isActive: true }, order: [['createdAt', 'DESC']] });
  if (!cred) return { result: 'INVALID', message: 'No webhook secret is configured; regenerate one in Tally Monitor' };
  const secret = decryptSecret(cred.encryptedValue, env.encryptionKey);

  if (app.authMethod === 'BEARER_TOKEN') {
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : req.header('x-webhook-token');
    if (!token) return { result: 'MISSING', message: 'Missing Authorization: Bearer token' };
    return timingSafeEqualStr(token, secret) ? { result: 'VALID' } : { result: 'INVALID', message: 'Invalid webhook token' };
  }

  // HMAC-SHA256 of the raw body (or "<timestamp>.<body>" when X-Timestamp is sent).
  const provided = req.header('x-signature')?.replace(/^sha256=/i, '').trim().toLowerCase();
  if (!provided) return { result: 'MISSING', message: 'Missing X-Signature header' };
  const ts = req.header('x-timestamp');
  let signed: Buffer = raw;
  if (ts) {
    const seconds = Number(ts) > 1e12 ? Number(ts) / 1000 : Number(ts);
    if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > MAX_CLOCK_SKEW_SECONDS) {
      return { result: 'INVALID', message: 'X-Timestamp is missing, malformed or outside the allowed 5 minute window' };
    }
    signed = Buffer.concat([Buffer.from(`${ts}.`), raw]);
  }
  return timingSafeEqualStr(provided, hmacSha256(secret, signed)) ? { result: 'VALID' } : { result: 'INVALID', message: 'Signature does not match' };
}

webhooksRouter.post('/:applicationCode', webhookLimiter, express.raw({ type: () => true, limit: '2mb' }), async (req: Request, res: Response) => {
  const startedAt = Date.now();
  const code = String(req.params.applicationCode ?? '').toUpperCase();
  const app = /^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(code) ? await Application.findOne({ where: { code } }) : null;
  // Unknown codes are not logged, so the endpoint cannot be used to fill the database.
  if (!app) {
    res.status(404).json({ success: false, error: { code: 'UNKNOWN_APPLICATION', message: 'Unknown application' }, requestId: req.requestId });
    return;
  }

  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const meta: IntakeMeta = { source: 'WEBHOOK', authResult: 'MISSING', ip: req.ip ?? null, headers: keptHeaders(req), rawSize: raw.length, startedAt };
  const respond = (o: { httpStatus: number; status: string; code?: string; message: string; details?: unknown; receiptId?: string; expenseId?: string; jobId?: string; warnings?: unknown }) => {
    const ok = o.httpStatus < 300;
    res.status(o.httpStatus).json(
      ok
        ? { success: true, data: { status: o.status, receiptId: o.receiptId, expenseId: o.expenseId, jobId: o.jobId, warnings: o.warnings ?? [] }, requestId: req.requestId }
        : { success: false, error: { code: o.code, message: o.message, details: o.details }, receiptId: o.receiptId, requestId: req.requestId },
    );
  };

  if (app.integrationMode !== 'WEBHOOK') {
    respond(await rejectIntake(app, meta, 409, 'WRONG_INTEGRATION_MODE', `Application ${app.code} is configured for ${app.integrationMode} integration, not webhooks`));
    return;
  }

  const auth = await authenticate(app, req, raw);
  meta.authResult = auth.result;
  if (auth.result !== 'VALID') {
    respond(await rejectIntake(app, meta, 401, auth.result === 'MISSING' ? 'AUTH_MISSING' : 'AUTH_INVALID', auth.message ?? 'Unauthorized'));
    return;
  }
  await app.update({ lastRequestAt: new Date() });

  const text = raw.toString('utf8');
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    respond(await rejectIntake(app, meta, 400, 'INVALID_JSON', 'Body is not valid JSON', text.slice(0, 65_536)));
    return;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    respond(await rejectIntake(app, meta, 422, 'INVALID_BODY', 'Send exactly one item as a JSON object per request', text.slice(0, 65_536)));
    return;
  }

  respond(await ingest(app, payload, meta));
});
