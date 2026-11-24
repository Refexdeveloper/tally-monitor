import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

/** Minimal .env loader (KEY=VALUE, # comments, optional quotes). Real environment variables win. */
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));
const int = (v, d, min, max) => {
  const n = v === undefined || v === '' ? d : Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Value ${v} must be between ${min} and ${max}`);
  return n;
};
const resolveDir = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));

export function loadConfig({ requireApi = true } = {}) {
  loadEnvFile(process.env.TM_AGENT_ENV_FILE ?? path.join(ROOT, '.env'));
  const errors = [];
  const apiUrl = (process.env.TM_API_URL ?? '').trim().replace(/\/+$/, '').replace(/\/api\/v1$/, '');
  let secret = process.env.TM_AGENT_SECRET ?? '';
  if (!secret && process.env.TM_AGENT_SECRET_FILE) {
    try {
      secret = fs.readFileSync(process.env.TM_AGENT_SECRET_FILE, 'utf8').trim();
    } catch (err) {
      errors.push(`Cannot read TM_AGENT_SECRET_FILE: ${err.message}`);
    }
  }
  if (requireApi) {
    if (!apiUrl) errors.push('TM_API_URL is required');
    else {
      try {
        const u = new URL(apiUrl);
        const local = ['localhost', '127.0.0.1', '::1'].includes(u.hostname);
        if (u.protocol !== 'https:' && !local && !bool(process.env.ALLOW_INSECURE_HTTP, false)) {
          errors.push('TM_API_URL must use HTTPS (plain HTTP only for localhost, or set ALLOW_INSECURE_HTTP=true for a LAN test)');
        }
      } catch {
        errors.push('TM_API_URL is not a valid URL');
      }
    }
    if (!process.env.TM_AGENT_KEY) errors.push('TM_AGENT_KEY is required');
    if (!secret) errors.push('TM_AGENT_SECRET (or TM_AGENT_SECRET_FILE) is required');
  }

  let cfg;
  try {
    cfg = {
      apiUrl,
      insecureHttp: apiUrl.startsWith('http://'),
      agentKey: process.env.TM_AGENT_KEY ?? '',
      agentSecret: secret,
      postingEnabled: bool(process.env.POSTING_ENABLED, false),
      masterCreationEnabled: bool(process.env.MASTER_CREATION_ENABLED, false),
      ledgerSyncEnabled: bool(process.env.LEDGER_SYNC_ENABLED, true),
      allowedCompanies: (process.env.ALLOWED_COMPANIES ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      tallyHostOverride: (process.env.TALLY_HOST_OVERRIDE ?? '').trim() || null,
      tallyTimeoutMs: int(process.env.TALLY_TIMEOUT_MS, 60_000, 5_000, 600_000),
      tallyHealthTimeoutMs: int(process.env.TALLY_HEALTH_TIMEOUT_MS, 8_000, 1_000, 60_000),
      costCategory: process.env.COST_CATEGORY?.trim() || 'Primary Cost Category',
      pollSeconds: int(process.env.POLL_SECONDS, 10, 2, 600),
      heartbeatSeconds: int(process.env.HEARTBEAT_SECONDS, 30, 5, 600),
      ledgerSyncMinutes: int(process.env.LEDGER_SYNC_MINUTES, 30, 1, 1440),
      logDir: resolveDir(process.env.LOG_DIR ?? './logs'),
      stateDir: resolveDir(process.env.STATE_DIR ?? './state'),
      logLevel: (process.env.LOG_LEVEL ?? 'info').toLowerCase(),
      logRetentionDays: int(process.env.LOG_RETENTION_DAYS, 30, 1, 3650),
    };
  } catch (err) {
    errors.push(err.message);
  }
  if (errors.length) {
    const e = new Error(`Invalid configuration:\n  - ${errors.join('\n  - ')}`);
    e.code = 'CONFIG_INVALID';
    throw e;
  }
  return cfg;
}

export function isCompanyAllowed(cfg, tallyCompanyName) {
  if (!cfg.allowedCompanies.length) return true;
  return cfg.allowedCompanies.some((c) => c.toLowerCase() === String(tallyCompanyName).trim().toLowerCase());
}

/** Config with secrets masked, for logs and diagnostics. */
export function describeConfig(cfg) {
  return { ...cfg, agentSecret: cfg.agentSecret ? `•••• (${cfg.agentSecret.length} chars)` : '(missing)' };
}
