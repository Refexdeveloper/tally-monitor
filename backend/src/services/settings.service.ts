import type { Request } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { SystemSetting } from '../models';
import { ApiError } from '../utils/http';
import { audit } from './audit.service';
import type { AuthContext } from './auth/authContext';
import { iso } from './common';

interface SettingDef {
  label: string;
  schema: z.ZodType;
  type: 'integer' | 'boolean';
  unit?: string;
  min?: number;
  max?: number;
  /** Safety rails that must not be switched off from the UI. */
  locked?: { value: unknown; reason: string };
}

export const SETTING_DEFS: Record<string, SettingDef> = {
  'queue.max_attempts': { label: 'Maximum automatic attempts', type: 'integer', min: 1, max: 20, schema: z.number().int().min(1).max(20) },
  'queue.retry_base_seconds': { label: 'Retry base delay', type: 'integer', unit: 'seconds', min: 5, max: 3600, schema: z.number().int().min(5).max(3600) },
  'queue.retry_max_seconds': { label: 'Retry maximum delay', type: 'integer', unit: 'seconds', min: 60, max: 86400, schema: z.number().int().min(60).max(86400) },
  'queue.lock_ttl_seconds': { label: 'Job lock lease', type: 'integer', unit: 'seconds', min: 30, max: 3600, schema: z.number().int().min(30).max(3600) },
  'queue.serialize_per_company': { label: 'Serialize postings per company', type: 'boolean', schema: z.boolean() },
  'queue.auto_validate': { label: 'Auto-validate received jobs', type: 'boolean', schema: z.boolean() },
  'posting.require_finance_approval': {
    label: 'Require Finance approval policy',
    type: 'boolean',
    schema: z.boolean(),
    locked: { value: true, reason: 'Unapproved financial transactions must never be posted. Configure thresholds per voucher configuration instead.' },
  },
  'masters.allow_auto_creation': {
    label: 'Automatic master creation',
    type: 'boolean',
    schema: z.boolean(),
    locked: { value: false, reason: 'Ledgers and other masters are only created after explicit Finance approval.' },
  },
};

export const settingUpdateSchema = z.object({ value: z.unknown() });

const DEFAULTS: Record<string, unknown> = {
  'queue.max_attempts': 5,
  'queue.retry_base_seconds': 60,
  'queue.retry_max_seconds': 3600,
  'queue.lock_ttl_seconds': 300,
  'queue.serialize_per_company': true,
  'queue.auto_validate': true,
};

/** Reads a validated setting, falling back to the built-in default. */
export async function getSetting<T>(key: keyof typeof DEFAULTS & string): Promise<T> {
  const row = await SystemSetting.findOne({ where: { settingKey: key } });
  const parsed = SETTING_DEFS[key]?.schema.safeParse(row?.value);
  return (parsed?.success ? parsed.data : DEFAULTS[key]) as T;
}

export async function listSettings() {
  const rows = await SystemSetting.findAll({ order: [['category', 'ASC'], ['settingKey', 'ASC']] });
  const settings = rows
    .filter((r) => SETTING_DEFS[r.settingKey])
    .map((r) => {
      const def = SETTING_DEFS[r.settingKey]!;
      return {
        key: r.settingKey,
        category: r.category,
        label: def.label,
        description: r.description,
        type: def.type,
        unit: def.unit ?? null,
        min: def.min ?? null,
        max: def.max ?? null,
        value: def.locked ? def.locked.value : r.value,
        locked: def.locked ? { reason: def.locked.reason } : null,
        updatedAt: iso(r.updatedAt),
      };
    });
  return {
    settings,
    // Environment-level security policy; changed through deployment configuration, not the UI.
    security: {
      accessTokenTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
      sessionTtlHours: env.REFRESH_TTL_HOURS,
      rememberMeTtlDays: env.REFRESH_REMEMBER_TTL_DAYS,
      maxFailedAttempts: env.AUTH_MAX_FAILED_ATTEMPTS,
      lockoutMinutes: env.AUTH_LOCKOUT_MINUTES,
      passwordResetTtlMinutes: env.PASSWORD_RESET_TTL_MINUTES,
      agentHeartbeatTimeoutSeconds: env.AGENT_HEARTBEAT_TIMEOUT_SECONDS,
      tallyHealthStaleSeconds: env.TALLY_HEALTH_STALE_SECONDS,
    },
  };
}

export async function updateSetting(ctx: AuthContext, key: string, value: unknown, req: Request) {
  const def = SETTING_DEFS[key];
  if (!def) throw ApiError.notFound('Unknown setting');
  if (def.locked) throw ApiError.badRequest(def.locked.reason);
  const parsed = def.schema.safeParse(value);
  if (!parsed.success) throw new ApiError(422, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid value');
  const setting = await SystemSetting.findOne({ where: { settingKey: key } });
  if (!setting) throw ApiError.notFound('Setting has not been seeded; run npm run db:seed');

  if (key === 'queue.retry_base_seconds' || key === 'queue.retry_max_seconds') {
    const other = await SystemSetting.findOne({ where: { settingKey: key === 'queue.retry_base_seconds' ? 'queue.retry_max_seconds' : 'queue.retry_base_seconds' } });
    const base = key === 'queue.retry_base_seconds' ? Number(parsed.data) : Number(other?.value);
    const max = key === 'queue.retry_max_seconds' ? Number(parsed.data) : Number(other?.value);
    if (Number.isFinite(base) && Number.isFinite(max) && base > max) throw ApiError.badRequest('Retry base delay cannot exceed the maximum delay');
  }

  const previous = setting.value;
  await setting.update({ value: parsed.data, updatedBy: ctx.user.id });
  await audit({ action: 'SETTING_CHANGED', userId: ctx.user.id, entityType: 'setting', metadata: { key, previous, value: parsed.data } }, req);
  return (await listSettings()).settings.find((s) => s.key === key)!;
}
