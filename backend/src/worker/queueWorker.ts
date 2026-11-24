import crypto from 'node:crypto';
import os from 'node:os';
import { Op, QueryTypes } from 'sequelize';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { JobAttempt, ProcessingJob, sequelize } from '../models';
import { validateExpense } from '../services/accounting.service';
import { settleAttempt } from '../services/agentQueue.service';
import { getSetting } from '../services/settings.service';

const LEASE = 'maintenance';
const owner = `${os.hostname()}:${process.pid}:${crypto.randomBytes(3).toString('hex')}`;
let timer: NodeJS.Timeout | null = null;
let running = false;

/** One maintenance worker across all API instances, coordinated by a database lease. */
async function acquireLease(ttlSeconds: number) {
  const [res] = await sequelize.query(
    `UPDATE queue_worker_leases SET owner = :owner, expires_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL :ttl SECOND), heartbeat_at = UTC_TIMESTAMP(3)
     WHERE name = :name AND (owner = :owner OR owner IS NULL OR expires_at IS NULL OR expires_at < UTC_TIMESTAMP(3))`,
    { replacements: { owner, ttl: ttlSeconds, name: LEASE } },
  );
  return Number((res as { affectedRows?: number }).affectedRows ?? 0) > 0;
}

/** Expired locks: never-submitted attempts are retried; possibly-submitted ones need reconciliation. */
async function recoverStaleLocks() {
  const stale = await ProcessingJob.findAll({ where: { status: 'PROCESSING', [Op.or]: [{ lockExpiresAt: { [Op.lt]: new Date() } }, { lockExpiresAt: null }] }, attributes: ['id'], limit: 50 });
  let recovered = 0;
  for (const { id } of stale) {
    try {
      await sequelize.transaction(async (transaction) => {
        const job = await ProcessingJob.findByPk(id, { lock: transaction.LOCK.UPDATE, transaction });
        if (!job || job.status !== 'PROCESSING' || (job.lockExpiresAt && job.lockExpiresAt > new Date())) return;
        let attempt = await JobAttempt.findOne({ where: { jobId: job.id, outcome: 'IN_PROGRESS' }, order: [['attemptNo', 'DESC']], transaction });
        if (!attempt) {
          const lastNo = (await JobAttempt.max<number, JobAttempt>('attemptNo', { where: { jobId: job.id }, transaction })) ?? 0;
          attempt = await JobAttempt.create({ jobId: job.id, attemptNo: lastNo + 1, agentId: job.lockedByAgentId, triggeredBy: null, operation: 'POST_VOUCHER', fromStatus: 'PROCESSING', toStatus: null, outcome: 'IN_PROGRESS', errorCode: null, errorMessage: null, finishedAt: null, durationMs: null }, { transaction });
        }
        // Without a claim record we cannot prove nothing reached Tally, so treat it as possibly submitted.
        const submitted = Boolean(job.submissionStartedAt) || !job.lockedAt;
        await settleAttempt(job, attempt, submitted ? 'AMBIGUOUS' : 'NOT_SUBMITTED', {
          actor: { type: 'SYSTEM' },
          transaction,
          errorCode: 'LOCK_EXPIRED',
          errorMessage: submitted
            ? 'The agent stopped responding after starting submission; the voucher may exist in Tally'
            : 'The agent stopped responding before submitting to Tally',
        });
        recovered++;
      });
    } catch (err) {
      logger.error('Stale lock recovery failed', { jobId: id, error: (err as Error).message });
    }
  }
  return recovered;
}

async function autoValidate() {
  if (!(await getSetting<boolean>('queue.auto_validate'))) return 0;
  const jobs = await ProcessingJob.findAll({ where: { status: 'RECEIVED', isPaused: false }, attributes: ['expenseId'], order: [['priority', 'ASC'], ['createdAt', 'ASC']], limit: 25 });
  let validated = 0;
  for (const j of jobs) {
    try {
      await validateExpense(null, j.expenseId);
      validated++;
    } catch (err) {
      logger.warn('Auto-validation failed', { expenseId: j.expenseId, error: (err as Error).message });
    }
  }
  return validated;
}

async function tick() {
  if (running) return;
  running = true;
  const started = Date.now();
  try {
    if (!(await acquireLease(Math.max(30, env.QUEUE_WORKER_INTERVAL_SECONDS * 3)))) return;
    const recovered = await recoverStaleLocks();
    const validated = await autoValidate();
    const [counts] = await sequelize.query<{ due: number }>(
      "SELECT COUNT(*) AS due FROM processing_jobs WHERE is_paused = 0 AND (status = 'READY_TO_POST' OR (status = 'RETRY_PENDING' AND (next_retry_at IS NULL OR next_retry_at <= UTC_TIMESTAMP(3))))",
      { type: QueryTypes.SELECT },
    );
    await sequelize.query('UPDATE queue_worker_leases SET stats = CAST(:stats AS JSON) WHERE name = :name AND owner = :owner', {
      replacements: { name: LEASE, owner, stats: JSON.stringify({ lastTickAt: new Date().toISOString(), durationMs: Date.now() - started, recovered, validated, duePostings: Number(counts?.due ?? 0) }) },
    });
    if (recovered || validated) logger.info('Queue maintenance', { recovered, validated });
  } catch (err) {
    logger.error('Queue worker tick failed', { error: (err as Error).message });
  } finally {
    running = false;
  }
}

export function startQueueWorker() {
  if (!env.QUEUE_WORKER_ENABLED || timer) return;
  timer = setInterval(() => void tick(), env.QUEUE_WORKER_INTERVAL_SECONDS * 1000);
  setTimeout(() => void tick(), 2000).unref();
  logger.info('Queue worker started', { owner, intervalSeconds: env.QUEUE_WORKER_INTERVAL_SECONDS });
}

export async function stopQueueWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  await sequelize.query('UPDATE queue_worker_leases SET owner = NULL, expires_at = NULL WHERE name = :name AND owner = :owner', { replacements: { name: LEASE, owner } }).catch(() => undefined);
}

export async function workerStatus() {
  const [lease] = await sequelize.query<{ owner: string | null; expires_at: Date | null; heartbeat_at: Date | null; stats: unknown }>('SELECT owner, expires_at, heartbeat_at, stats FROM queue_worker_leases WHERE name = :name', {
    replacements: { name: LEASE },
    type: QueryTypes.SELECT,
  });
  const stats = typeof lease?.stats === 'string' ? JSON.parse(lease.stats) : lease?.stats;
  const heartbeatAge = lease?.heartbeat_at ? (Date.now() - new Date(lease.heartbeat_at).getTime()) / 1000 : null;
  return {
    status: heartbeatAge !== null && heartbeatAge < Math.max(30, env.QUEUE_WORKER_INTERVAL_SECONDS * 3) ? 'RUNNING' : lease?.heartbeat_at ? 'STALLED' : 'NOT_STARTED',
    owner: lease?.owner ?? null,
    heartbeatAt: lease?.heartbeat_at ? new Date(lease.heartbeat_at).toISOString() : null,
    stats: stats ?? null,
    settings: {
      autoValidate: await getSetting<boolean>('queue.auto_validate'),
      serializePerCompany: await getSetting<boolean>('queue.serialize_per_company'),
      maxAttempts: await getSetting<number>('queue.max_attempts'),
      lockTtlSeconds: await getSetting<number>('queue.lock_ttl_seconds'),
      intervalSeconds: env.QUEUE_WORKER_INTERVAL_SECONDS,
    },
  };
}
