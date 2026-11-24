import { QueryTypes } from 'sequelize';
import { env } from '../config/env';
import { sequelize } from '../models';
import { companyScope } from './access';
import type { AuthContext } from './auth/authContext';

const startedAt = new Date();
const VERSION = process.env.npm_package_version ?? process.env.APP_VERSION ?? '0.1.0';

export type ComponentStatus = 'UP' | 'DOWN' | 'DEGRADED' | 'UNKNOWN' | 'NOT_CONFIGURED';

export async function checkDatabase(): Promise<{ status: ComponentStatus; latencyMs: number | null; error?: string }> {
  const t0 = performance.now();
  try {
    await sequelize.query('SELECT 1', { type: QueryTypes.SELECT });
    return { status: 'UP', latencyMs: Math.round(performance.now() - t0) };
  } catch (err) {
    return { status: 'DOWN', latencyMs: null, error: env.isProduction ? 'Database unreachable' : (err as Error).message };
  }
}

function secondsSince(value: unknown): number | null {
  if (!value) return null;
  const t = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(t) ? Math.round((Date.now() - t) / 1000) : null;
}

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

export async function getIntegrationHealth(ctx: AuthContext) {
  const database = await checkDatabase();
  const api = {
    status: 'UP' as ComponentStatus,
    version: VERSION,
    environment: env.NODE_ENV,
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  };

  if (database.status !== 'UP') {
    const unknown = { status: 'UNKNOWN' as ComponentStatus, items: [] };
    return { checkedAt: new Date().toISOString(), overall: 'DOWN' as ComponentStatus, api, database, agents: unknown, tally: unknown, lastSuccessfulSync: null, lastFailedJob: null };
  }

  const canSeeTally = ctx.permissions.has('tally.view');
  const pvScope = companyScope(ctx, 'pv.company_id');
  const jScope = companyScope(ctx, 'j.company_id');

  const [agents, servers, lastSync, lastFailed] = await Promise.all([
    sequelize.query<Record<string, unknown>>(
      `SELECT uuid, name, status, hostname, agent_version, last_heartbeat_at FROM integration_agents
       WHERE is_active = 1 AND revoked_at IS NULL ORDER BY name`,
      { type: QueryTypes.SELECT },
    ),
    sequelize.query<Record<string, unknown>>(
      `SELECT s.uuid, s.name, s.host, s.port, s.tally_release, s.status, s.last_health_check_at, s.last_success_at, s.last_error,
              (SELECT COUNT(*) FROM companies c WHERE c.tally_server_id = s.id AND c.deleted_at IS NULL) AS companies
       FROM tally_servers s WHERE s.is_active = 1 ORDER BY s.name`,
      { type: QueryTypes.SELECT },
    ),
    sequelize.query<Record<string, unknown>>(
      `SELECT MAX(pv.verified_at) AS at FROM posted_vouchers pv WHERE pv.verification_status = 'VERIFIED' AND ${pvScope.sql}`,
      { type: QueryTypes.SELECT, replacements: pvScope.replacements },
    ),
    sequelize.query<Record<string, unknown>>(
      `SELECT j.uuid, j.last_error_code, j.last_error_message, j.updated_at, c.name AS company
       FROM processing_jobs j JOIN companies c ON c.id = j.company_id
       WHERE j.status = 'FAILED' AND ${jScope.sql} ORDER BY j.updated_at DESC LIMIT 1`,
      { type: QueryTypes.SELECT, replacements: jScope.replacements },
    ),
  ]);

  const agentItems = agents.map((a) => {
    const age = secondsSince(a.last_heartbeat_at);
    const online = age !== null && age <= env.AGENT_HEARTBEAT_TIMEOUT_SECONDS;
    return {
      uuid: a.uuid,
      name: a.name,
      hostname: canSeeTally ? a.hostname : null,
      version: a.agent_version,
      status: (online ? 'UP' : a.last_heartbeat_at ? 'DOWN' : 'UNKNOWN') as ComponentStatus,
      lastHeartbeatAt: iso(a.last_heartbeat_at),
      secondsSinceHeartbeat: age,
    };
  });

  // Tally status is only what an agent last reported; stale reports become UNKNOWN.
  const tallyItems = servers.map((s) => {
    const age = secondsSince(s.last_health_check_at);
    const fresh = age !== null && age <= env.TALLY_HEALTH_STALE_SECONDS;
    const reported = String(s.status);
    const status: ComponentStatus = !fresh ? 'UNKNOWN' : reported === 'ONLINE' ? 'UP' : reported === 'UNKNOWN' ? 'UNKNOWN' : 'DOWN';
    return {
      uuid: s.uuid,
      name: s.name,
      endpoint: canSeeTally ? `${s.host}:${s.port}` : null,
      release: s.tally_release,
      status,
      companies: Number(s.companies ?? 0),
      lastHealthCheckAt: iso(s.last_health_check_at),
      lastSuccessAt: iso(s.last_success_at),
      lastError: canSeeTally ? s.last_error : null,
    };
  });

  const rollup = (items: { status: ComponentStatus }[]): ComponentStatus => {
    if (items.length === 0) return 'NOT_CONFIGURED';
    if (items.every((i) => i.status === 'UP')) return 'UP';
    if (items.some((i) => i.status === 'UP')) return 'DEGRADED';
    if (items.every((i) => i.status === 'UNKNOWN')) return 'UNKNOWN';
    return 'DOWN';
  };

  const agentsStatus = rollup(agentItems);
  const tallyStatus = rollup(tallyItems);
  // The cloud side is up at this point; the integration path is only fully UP when agents and Tally both are.
  const overall: ComponentStatus = agentsStatus === 'UP' && tallyStatus === 'UP' ? 'UP' : 'DEGRADED';

  const failed = lastFailed[0];
  return {
    checkedAt: new Date().toISOString(),
    overall,
    api,
    database,
    agents: { status: agentsStatus, items: agentItems },
    tally: { status: tallyStatus, items: tallyItems },
    lastSuccessfulSync: iso(lastSync[0]?.at),
    lastFailedJob: failed
      ? { uuid: failed.uuid, company: failed.company, errorCode: failed.last_error_code, errorMessage: failed.last_error_message, at: iso(failed.updated_at) }
      : null,
  };
}
