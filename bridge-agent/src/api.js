import { VERSION } from './config.js';

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK_ERROR', details } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
  /** Network problems and 5xx/429 are worth retrying; other 4xx are permanent answers. */
  get retryable() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Outbound-only HTTPS client for the Tally Monitor agent API. */
export function createApi(cfg, log) {
  const base = `${cfg.apiUrl}/api/v1/agents`;

  async function request(method, path, body, { timeoutMs = 30_000 } = {}) {
    let res;
    try {
      res = await fetch(`${base}${path}`, {
        method,
        headers: {
          'X-Agent-Key': cfg.agentKey,
          Authorization: `Bearer ${cfg.agentSecret}`,
          'User-Agent': `TallyMonitorBridge/${VERSION}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new ApiError(`Tally Monitor unreachable: ${err.cause?.code ?? err.name}: ${err.cause?.message ?? err.message}`);
    }
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON (proxy error page) */
    }
    if (!res.ok || !json?.success) {
      const e = json?.error;
      throw new ApiError(e?.message ?? `HTTP ${res.status}`, { status: res.status, code: e?.code ?? `HTTP_${res.status}`, details: e?.details });
    }
    return json.data;
  }

  /** Retries transient failures with exponential backoff; permanent errors surface immediately. */
  async function withRetry(label, fn, attempts = 4) {
    for (let i = 1; ; i += 1) {
      try {
        return await fn();
      } catch (err) {
        if (!(err instanceof ApiError) || !err.retryable || i >= attempts) throw err;
        const wait = Math.min(30_000, 1000 * 2 ** i);
        log.warn(`${label} failed, retrying in ${wait / 1000}s`, { error: err.message, attempt: i });
        await sleep(wait);
      }
    }
  }

  return {
    request,
    withRetry,
    register: (info) => request('POST', '/register', info),
    heartbeat: (body) => request('POST', '/heartbeat', body),
    claimJobs: (limit = 1, companies) => request('GET', `/jobs?limit=${limit}${companies ? `&companies=${companies.join(',')}` : ''}`),
    submitting: (jobId, attemptId) => withRetry('submitting', () => request('POST', `/jobs/${jobId}/submitting`, { attemptId })),
    jobHeartbeat: (jobId, attemptId) => request('POST', `/jobs/${jobId}/heartbeat`, { attemptId }),
    jobResult: (jobId, body) => request('POST', `/jobs/${jobId}/result`, body),
    syncLedgers: (body) => withRetry('ledger sync', () => request('POST', '/ledgers/sync', body, { timeoutMs: 120_000 })),
    claimMasters: (companies) => request('GET', `/master-requests${companies ? `?companies=${companies.join(',')}` : ''}`),
    masterResult: (id, body) => request('POST', `/master-requests/${id}/result`, body),
  };
}
