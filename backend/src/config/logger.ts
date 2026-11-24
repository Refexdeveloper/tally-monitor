import winston from 'winston';
import { env } from './env';

const SENSITIVE_KEYS = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|credential/i;

/** Recursively masks values whose keys look sensitive so they never reach logs. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.test(k) ? '[REDACTED]' : redact(v, depth + 1);
  }
  return out;
}

const redactFormat = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (SENSITIVE_KEYS.test(key)) info[key] = '[REDACTED]';
    else if (typeof info[key] === 'object') info[key] = redact(info[key]);
  }
  return info;
});

// Cloud Logging reads the "severity" field from structured JSON on stdout.
const cloudSeverity = winston.format((info) => {
  const map: Record<string, string> = { error: 'ERROR', warn: 'WARNING', info: 'INFO', http: 'INFO', verbose: 'DEBUG', debug: 'DEBUG' };
  info.severity = map[info.level] ?? 'DEFAULT';
  return info;
});

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  defaultMeta: { service: 'tally-monitor-api' },
  format: env.isProduction
    ? winston.format.combine(redactFormat(), cloudSeverity(), winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json())
    : winston.format.combine(
        redactFormat(),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, service: _s, stack, ...rest }) => {
          const meta = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
          return `${timestamp} ${level} ${message}${meta}${stack ? `\n${stack}` : ''}`;
        }),
      ),
  transports: [new winston.transports.Console()],
});
