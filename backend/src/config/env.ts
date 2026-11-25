import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env'), quiet: true });

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  /** Public base URL of this API; used to show webhook URLs. Defaults to APP_PUBLIC_URL (same-origin /api). */
  PUBLIC_API_URL: z.string().url().optional(),
  /** Host suffixes the API may call when testing Kissflow API connections (SSRF guard). */
  KISSFLOW_ALLOWED_HOSTS: z.string().default('kissflow.com'),
  CORS_ORIGINS: z.string().default('http://localhost:4000'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug']).default('info'),

  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().default(''),
  DB_SOCKET_PATH: z.string().optional(),
  DB_SSL: bool,
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TTL_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  REFRESH_REMEMBER_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  AUTH_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  AUTH_LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(240).default(30),
  COOKIE_SECURE: bool,

  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'ENCRYPTION_KEY must be 32 bytes, base64-encoded'),

  AGENT_HEARTBEAT_TIMEOUT_SECONDS: z.coerce.number().int().min(15).default(90),
  QUEUE_WORKER_ENABLED: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  QUEUE_WORKER_INTERVAL_SECONDS: z.coerce.number().int().min(2).max(300).default(10),
  TALLY_HEALTH_STALE_SECONDS: z.coerce.number().int().min(30).default(300),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: bool,
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('Tally Monitor <no-reply@example.com>'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid backend configuration. Check backend/.env (see .env.example):\n${details}`);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  corsOrigins: raw.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
  publicApiUrl: (raw.PUBLIC_API_URL ?? raw.APP_PUBLIC_URL).replace(/\/+$/, ''),
  kissflowAllowedHosts: raw.KISSFLOW_ALLOWED_HOSTS.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean),
  cookieSecure: raw.NODE_ENV === 'production' || raw.COOKIE_SECURE,
  encryptionKey: Buffer.from(raw.ENCRYPTION_KEY, 'base64'),
};

export type Env = typeof env;
