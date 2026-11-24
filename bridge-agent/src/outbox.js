/**
 * Durable outbox for results. A result is written to disk BEFORE it is sent, so a crash, reboot
 * or network outage after posting to Tally never loses the fact that the voucher was posted.
 */
import fs from 'node:fs';
import path from 'node:path';

export function createOutbox({ dir, api, log }) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'outbox.json');
  let items = [];
  if (fs.existsSync(file)) {
    try {
      items = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      const broken = `${file}.corrupt-${Date.now()}`;
      fs.renameSync(file, broken);
      log.error('Outbox file was unreadable and has been set aside; check it manually', { file: broken, error: err.message });
    }
  }

  const persist = () => {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(items, null, 2));
    fs.renameSync(tmp, file);
  };

  const send = (item) => (item.kind === 'job' ? api.jobResult(item.id, item.body) : api.masterResult(item.id, item.body));

  async function flush() {
    for (const item of [...items]) {
      try {
        const res = await send(item);
        log.info(`Result delivered (${item.kind} ${item.body.outcome})`, { id: item.id, status: res?.status });
        items = items.filter((i) => i !== item);
        persist();
      } catch (err) {
        if (err.retryable) {
          item.attempts = (item.attempts ?? 0) + 1;
          item.lastError = err.message;
          persist();
          log.warn('Result not delivered yet; will retry', { id: item.id, error: err.message });
          return false;
        }
        // Permanent answer (lock lost, already settled, validation). Keep a copy for the operator.
        log.error('Result refused by Tally Monitor; saved to state/rejected-results.jsonl. Reconcile this item in Tally Monitor.', { id: item.id, kind: item.kind, code: err.code, error: err.message });
        fs.appendFileSync(path.join(dir, 'rejected-results.jsonl'), `${JSON.stringify({ ...item, refusedAt: new Date().toISOString(), code: err.code, error: err.message })}\n`);
        items = items.filter((i) => i !== item);
        persist();
      }
    }
    return true;
  }

  return {
    async add(item) {
      items.push({ ...item, createdAt: new Date().toISOString(), attempts: 0 });
      persist();
      await flush();
      return item.body.outcome;
    },
    flush,
    get pending() {
      return items.length;
    },
  };
}
