import os from 'node:os';
import { VERSION, isCompanyAllowed, describeConfig } from './config.js';
import { createApi, ApiError } from './api.js';
import { createTally, serverTarget } from './tally/index.js';
import { createOutbox } from './outbox.js';
import { postVoucher } from './jobs/postVoucher.js';
import { createMaster } from './jobs/masters.js';
import { syncAllLedgers } from './jobs/ledgerSync.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REREGISTER_MS = 10 * 60_000;

export function createAgent(cfg, log) {
  const api = createApi(cfg, log);
  const tally = createTally(cfg);
  const outbox = createOutbox({ dir: cfg.stateDir, api, log });
  const ctx = { cfg, api, tally, outbox, log };

  let assignment = { servers: [], companies: [] };
  let lockTtlSeconds = 300;
  let registeredAt = 0;
  let stopping = false;
  let busy = Promise.resolve();
  const loadedByServer = new Map();
  const timers = [];
  let lastLedgerSync = 0;

  const identity = () => ({ hostname: os.hostname(), osInfo: `${os.type()} ${os.release()} (${os.arch()}) node ${process.version}`, agentVersion: VERSION });

  /** All Tally work runs one item at a time, in order. */
  const exclusive = (fn) => {
    const run = busy.then(fn, fn);
    busy = run.catch(() => {});
    return run;
  };

  async function register() {
    const res = await api.register(identity());
    assignment = { servers: res.servers, companies: res.companies };
    lockTtlSeconds = res.config?.lockTtlSeconds ?? lockTtlSeconds;
    registeredAt = Date.now();
    const unknownAllowed = cfg.allowedCompanies.filter((n) => !res.companies.some((c) => c.tallyCompanyName.toLowerCase() === n.toLowerCase()));
    log.info('Registered with Tally Monitor', {
      agent: res.agent.name,
      servers: res.servers.map((s) => `${s.name} (${s.host}:${s.port})`),
      companies: res.companies.map((c) => c.tallyCompanyName),
    });
    if (unknownAllowed.length) log.warn('ALLOWED_COMPANIES contains names not assigned to this agent in Tally Monitor', { names: unknownAllowed });
    return res;
  }

  /** Company UUIDs the agent may work on, or undefined for "all assigned". Empty array = nothing. */
  function allowedCompanyIds() {
    if (!cfg.allowedCompanies.length) return undefined;
    return assignment.companies.filter((c) => isCompanyAllowed(cfg, c.tallyCompanyName)).map((c) => c.id);
  }

  async function heartbeat() {
    const servers = [];
    for (const s of assignment.servers) {
      try {
        const companies = await exclusive(() => tally.listCompanies(serverTarget(cfg, s)));
        loadedByServer.set(s.id, companies);
        servers.push({ serverId: s.id, status: 'ONLINE', companies });
      } catch (err) {
        loadedByServer.delete(s.id);
        servers.push({ serverId: s.id, status: err.code === 'TALLY_UNREACHABLE' || err.code === 'TALLY_CONNECT_TIMEOUT' ? 'OFFLINE' : 'ERROR', error: err.message.slice(0, 1000) });
        log.warn(`Tally server ${s.name} not healthy`, { error: err.message });
      }
    }
    await api.heartbeat({ ...identity(), servers });
  }

  async function withJobHeartbeat(job, fn) {
    const every = Math.max(10, Math.floor(lockTtlSeconds / 3)) * 1000;
    const t = setInterval(() => api.jobHeartbeat(job.jobId, job.attemptId).catch((err) => log.warn('Job heartbeat failed', { jobId: job.jobId, error: err.message })), every);
    try {
      return await fn();
    } finally {
      clearInterval(t);
    }
  }

  async function pollJobs() {
    if (!cfg.postingEnabled) return;
    const only = allowedCompanyIds();
    if (only && !only.length) return;
    const { jobs } = await api.claimJobs(1, only);
    for (const job of jobs) {
      if (stopping) break;
      const outcome = await exclusive(() => withJobHeartbeat(job, () => postVoucher(job, ctx)));
      log.info(`Job finished: ${outcome}`, { jobId: job.jobId, reference: job.voucher?.reference });
    }
  }

  async function pollMasters() {
    if (!cfg.masterCreationEnabled) return;
    const only = allowedCompanyIds();
    if (only && !only.length) return;
    const { requests } = await api.claimMasters(only);
    for (const r of requests) {
      if (stopping) break;
      await exclusive(() => createMaster(r, { ...ctx, assignment }));
    }
  }

  async function ledgerSync() {
    if (!cfg.ledgerSyncEnabled) return;
    lastLedgerSync = Date.now();
    await exclusive(() => syncAllLedgers({ ...ctx, assignment, loadedByServer }));
  }

  /** Runs fn on a fixed interval without overlapping runs; errors are logged, never fatal. */
  function every(label, ms, fn) {
    let running = false;
    const tick = async () => {
      if (running || stopping) return;
      running = true;
      try {
        await fn();
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) log.error(`${label}: Tally Monitor refused the agent credentials (${err.code}). Check TM_AGENT_KEY/TM_AGENT_SECRET or whether the agent was revoked.`);
        else log.warn(`${label} failed`, { error: err.message, code: err.code });
      } finally {
        running = false;
      }
    };
    timers.push(setInterval(tick, ms));
    return tick;
  }

  async function start() {
    log.info(`Tally Monitor Bridge Agent ${VERSION} starting`, { config: describeConfig(cfg) });
    if (cfg.insecureHttp && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(cfg.apiUrl)) {
      log.warn('TM_API_URL uses plain HTTP: the agent secret travels unencrypted. Use only for a LAN test; production must use HTTPS.');
    }
    if (!cfg.postingEnabled) log.warn('POSTING_ENABLED=false: vouchers will NOT be posted (health, discovery and ledger sync only).');
    if (cfg.allowedCompanies.length) log.info('Posting restricted to ALLOWED_COMPANIES', { companies: cfg.allowedCompanies });

    for (let attempt = 1; !stopping; attempt += 1) {
      try {
        await register();
        break;
      } catch (err) {
        if (err instanceof ApiError && !err.retryable) {
          log.error(`Registration refused: ${err.message} (${err.code}). Fix the configuration and restart.`);
          throw err;
        }
        const wait = Math.min(60_000, 2000 * attempt);
        log.warn(`Tally Monitor not reachable, retrying in ${wait / 1000}s`, { error: err.message });
        await sleep(wait);
      }
    }
    if (stopping) return;

    await outbox.flush();
    const hb = every('Heartbeat', cfg.heartbeatSeconds * 1000, async () => {
      if (Date.now() - registeredAt > REREGISTER_MS) await register();
      await heartbeat();
    });
    await hb();
    const sync = every('Ledger sync', 60_000, async () => {
      if (Date.now() - lastLedgerSync >= cfg.ledgerSyncMinutes * 60_000) await ledgerSync();
    });
    await sync();
    const work = every('Queue poll', cfg.pollSeconds * 1000, async () => {
      if (outbox.pending && !(await outbox.flush())) return; // never take new work while results are undelivered
      await pollJobs();
      await pollMasters();
    });
    await work();
    log.info('Agent running', { posting: cfg.postingEnabled, masterCreation: cfg.masterCreationEnabled, ledgerSync: cfg.ledgerSyncEnabled });
  }

  async function stop() {
    if (stopping) return;
    stopping = true;
    timers.forEach(clearInterval);
    log.info('Stopping: waiting for the current Tally operation to finish');
    await busy;
    await outbox.flush().catch(() => {});
    log.info('Stopped');
  }

  return { start, stop };
}
