import fs from 'node:fs';
import path from 'node:path';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const SECRET = /(secret|token|authorization|password)/i;

function redact(value, depth = 0) {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SECRET.test(k) ? '[REDACTED]' : redact(v, depth + 1)]));
}

/** Daily JSON-lines log files plus readable console output; old files are pruned. */
export function createLogger({ dir, level = 'info', retentionDays = 30, console: toConsole = true }) {
  fs.mkdirSync(dir, { recursive: true });
  const threshold = LEVELS[level] ?? LEVELS.info;
  let currentDay = '';
  let stream = null;

  const fileFor = (day) => path.join(dir, `agent-${day}.log`);
  const rotate = () => {
    const day = new Date().toISOString().slice(0, 10);
    if (day === currentDay && stream) return;
    stream?.end();
    currentDay = day;
    stream = fs.createWriteStream(fileFor(day), { flags: 'a' });
    const cutoff = Date.now() - retentionDays * 86_400_000;
    for (const f of fs.readdirSync(dir)) {
      const m = /^agent-(\d{4}-\d{2}-\d{2})\.log$/.exec(f);
      if (m && Date.parse(m[1]) < cutoff) fs.rmSync(path.join(dir, f), { force: true });
    }
  };

  const write = (lvl, message, meta) => {
    if (LEVELS[lvl] > threshold) return;
    rotate();
    const entry = { time: new Date().toISOString(), level: lvl, message, ...(meta ? redact(meta) : {}) };
    stream.write(`${JSON.stringify(entry)}\n`);
    if (toConsole) {
      const extra = meta ? ` ${JSON.stringify(redact(meta))}` : '';
      (lvl === 'error' ? console.error : console.log)(`${entry.time.slice(11, 19)} ${lvl.toUpperCase().padEnd(5)} ${message}${extra}`);
    }
  };

  return {
    error: (m, meta) => write('error', m, meta),
    warn: (m, meta) => write('warn', m, meta),
    info: (m, meta) => write('info', m, meta),
    debug: (m, meta) => write('debug', m, meta),
    close: () => stream?.end(),
  };
}
