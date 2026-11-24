import type { Request } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { IntegrationAgent, TallyServer } from '../models';
import { randomToken, sha256 } from '../utils/crypto';
import { ApiError } from '../utils/http';
import { audit } from './audit.service';
import type { AuthContext } from './auth/authContext';
import { iso, num, select, withUniqueMessages, type Row } from './common';

const HOST = /^(?=.{1,253}$)([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

export const serverInputSchema = z.object({
  name: z.string().trim().min(2, 'Connection name is required').max(120),
  host: z.string().trim().max(255).regex(HOST, 'Enter a hostname or IPv4 address'),
  port: z.coerce.number().int().min(1).max(65535),
  protocol: z.enum(['HTTP', 'HTTPS']),
  tallyRelease: z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(32).nullable().optional()),
  integrationAgentId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});
export const serverUpdateSchema = serverInputSchema.partial();

export const agentInputSchema = z.object({
  name: z.string().trim().min(2, 'Agent name is required').max(120),
  maxConcurrency: z.coerce.number().int().min(1).max(10).optional(),
});

const SERVER_UNIQUE = { 'tally_servers.name': 'A Tally connection with this name already exists', name: 'A Tally connection with this name already exists', host: 'This host and port are already registered' };

const heartbeatFresh = (at: unknown) => (at ? Date.now() - new Date(at as string).getTime() <= env.AGENT_HEARTBEAT_TIMEOUT_SECONDS * 1000 : false);
const reportFresh = (at: unknown) => (at ? Date.now() - new Date(at as string).getTime() <= env.TALLY_HEALTH_STALE_SECONDS * 1000 : false);

function presentServer(r: Row, companies: Row[]) {
  const agentOnline = heartbeatFresh(r.agent_heartbeat_at);
  const fresh = reportFresh(r.last_health_check_at);
  const discovered = (typeof r.discovered_companies === 'string' ? JSON.parse(r.discovered_companies) : r.discovered_companies) as string[] | null;
  const loaded = discovered ? new Set(discovered.map((n) => n.trim().toLowerCase())) : null;
  return {
    id: r.uuid as string,
    name: r.name,
    host: r.host,
    port: num(r.port),
    protocol: r.protocol,
    tallyRelease: r.tally_release,
    isActive: Boolean(r.is_active),
    reportedStatus: r.status,
    // Only trust a recent agent report; otherwise the honest answer is UNKNOWN.
    effectiveStatus: !r.is_active ? 'INACTIVE' : fresh ? r.status : 'UNKNOWN',
    lastHealthCheckAt: iso(r.last_health_check_at),
    lastSuccessAt: iso(r.last_success_at),
    lastError: r.last_error,
    agent: r.agent_uuid ? { id: r.agent_uuid, name: r.agent_name, online: agentOnline, lastHeartbeatAt: iso(r.agent_heartbeat_at) } : null,
    companies: companies
      .filter((c) => c.tally_server_id === r.id)
      .map((c) => ({ id: c.uuid, name: c.name, code: c.code, tallyCompanyName: c.tally_company_name, isActive: Boolean(c.is_active), loadedInTally: loaded ? loaded.has(String(c.tally_company_name).trim().toLowerCase()) : null })),
    discoveredCompanies: discovered,
    discoveredAt: iso(r.discovered_at),
    createdAt: iso(r.created_at),
  };
}

export async function listServers(ctx: AuthContext) {
  const rows = await select(
    `SELECT s.*, ag.uuid AS agent_uuid, ag.name AS agent_name, ag.last_heartbeat_at AS agent_heartbeat_at
     FROM tally_servers s LEFT JOIN integration_agents ag ON ag.id = s.integration_agent_id AND ag.revoked_at IS NULL
     ORDER BY s.is_active DESC, s.name`,
  );
  const scope = ctx.companyIds === 'ALL' ? '' : ctx.companyIds.length ? ' AND c.id IN (:ids)' : ' AND 1=0';
  const companies = await select(`SELECT c.id, c.uuid, c.name, c.code, c.tally_company_name, c.is_active, c.tally_server_id FROM companies c WHERE c.deleted_at IS NULL${scope} ORDER BY c.name`, {
    ids: ctx.companyIds === 'ALL' ? [] : ctx.companyIds,
  });
  return rows.map((r) => presentServer(r, companies));
}

async function serverByUuid(uuid: string) {
  const server = await TallyServer.findOne({ where: { uuid } });
  if (!server) throw ApiError.notFound('Tally connection not found');
  return server;
}

async function agentIdFor(uuid: string | null | undefined) {
  if (uuid === undefined) return undefined;
  if (uuid === null) return null;
  const agent = await IntegrationAgent.findOne({ where: { uuid } });
  if (!agent || agent.revokedAt) throw ApiError.badRequest('Selected Bridge Agent does not exist or was revoked');
  return agent.id;
}

export async function createServer(ctx: AuthContext, input: z.infer<typeof serverInputSchema>, req: Request) {
  const integrationAgentId = await agentIdFor(input.integrationAgentId);
  const server = await withUniqueMessages(
    () =>
      TallyServer.create({
        name: input.name,
        host: input.host,
        port: input.port,
        protocol: input.protocol,
        tallyRelease: input.tallyRelease ?? null,
        integrationAgentId: integrationAgentId ?? null,
        isActive: input.isActive ?? true,
        lastHealthCheckAt: null,
        lastSuccessAt: null,
        lastError: null,
      }),
    SERVER_UNIQUE,
  );
  await audit({ action: 'TALLY_CONNECTION_CREATED', userId: ctx.user.id, entityType: 'tally_server', entityUuid: server.uuid, metadata: { name: server.name } }, req);
  return (await listServers(ctx)).find((s) => s.id === server.uuid)!;
}

export async function updateServer(ctx: AuthContext, uuid: string, input: z.infer<typeof serverUpdateSchema>, req: Request) {
  const server = await serverByUuid(uuid);
  const { integrationAgentId: agentUuid, ...fields } = input;
  const changes: Record<string, unknown> = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
  const agentId = await agentIdFor(agentUuid);
  if (agentId !== undefined) changes.integrationAgentId = agentId;

  const endpointChanged = (changes.host !== undefined && changes.host !== server.host) || (changes.port !== undefined && changes.port !== server.port);
  if (changes.isActive === false || endpointChanged) {
    const [busy] = await select(
      `SELECT COUNT(*) AS n FROM processing_jobs j JOIN companies c ON c.id = j.company_id
       WHERE c.tally_server_id = :id AND j.status IN ('PROCESSING', 'RECONCILIATION_REQUIRED')`,
      { id: server.id },
    );
    if (num(busy?.n) > 0) throw ApiError.conflict('Jobs for this Tally server are processing or awaiting reconciliation; try again once they settle', 'SERVER_BUSY');
  }
  if (endpointChanged) Object.assign(changes, { status: 'UNKNOWN', lastHealthCheckAt: null, lastError: null });

  await withUniqueMessages(() => server.update(changes), SERVER_UNIQUE);
  await audit(
    { action: changes.isActive === false ? 'TALLY_CONNECTION_DEACTIVATED' : 'TALLY_CONNECTION_UPDATED', userId: ctx.user.id, entityType: 'tally_server', entityUuid: server.uuid, metadata: { changed: Object.keys(changes) } },
    req,
  );
  return (await listServers(ctx)).find((s) => s.id === server.uuid)!;
}

export async function testServer(ctx: AuthContext, uuid: string, req: Request) {
  const server = await serverByUuid(uuid);
  const agent = server.integrationAgentId ? await IntegrationAgent.findByPk(server.integrationAgentId) : null;
  const checks: { name: string; status: 'PASS' | 'WARN' | 'FAIL'; message: string }[] = [];

  checks.push(server.isActive ? { name: 'Connection', status: 'PASS', message: 'Connection is active' } : { name: 'Connection', status: 'FAIL', message: 'Connection is inactive' });
  if (!agent || agent.revokedAt) {
    checks.push({ name: 'Bridge Agent', status: 'FAIL', message: 'No Bridge Agent assigned. The cloud cannot reach internal Tally hosts directly.' });
  } else if (!heartbeatFresh(agent.lastHeartbeatAt)) {
    checks.push({ name: 'Bridge Agent', status: 'FAIL', message: agent.lastHeartbeatAt ? `"${agent.name}" last seen ${agent.lastHeartbeatAt.toISOString()}` : `"${agent.name}" has never connected` });
  } else {
    checks.push({ name: 'Bridge Agent', status: 'PASS', message: `"${agent.name}" is online` });
  }
  if (!server.lastHealthCheckAt) {
    checks.push({ name: 'TallyPrime', status: 'WARN', message: 'No health report from the agent yet' });
  } else if (!reportFresh(server.lastHealthCheckAt)) {
    checks.push({ name: 'TallyPrime', status: 'WARN', message: `Last agent report is stale (${server.lastHealthCheckAt.toISOString()})` });
  } else {
    checks.push(
      server.status === 'ONLINE'
        ? { name: 'TallyPrime', status: 'PASS', message: `Agent reached Tally at ${server.lastHealthCheckAt.toISOString()}` }
        : { name: 'TallyPrime', status: 'FAIL', message: server.lastError ?? `Agent reported ${server.status}` },
    );
  }
  const companies = await select('SELECT COUNT(*) AS n FROM companies WHERE tally_server_id = :id AND deleted_at IS NULL AND is_active = 1', { id: server.id });
  checks.push(num(companies[0]?.n) ? { name: 'Companies', status: 'PASS', message: `${num(companies[0]?.n)} active company mapping(s)` } : { name: 'Companies', status: 'WARN', message: 'No companies mapped to this server' });

  const ok = checks.every((c) => c.status !== 'FAIL');
  await audit({ action: 'TALLY_CONNECTION_TESTED', userId: ctx.user.id, entityType: 'tally_server', entityUuid: server.uuid, metadata: { ok } }, req);
  return { ok, testedAt: new Date().toISOString(), checks, note: 'Live probes are executed by the Bridge Agent on the internal network; results reflect its latest report.' };
}

function presentAgent(r: Row) {
  return {
    id: r.uuid as string,
    name: r.name,
    agentKey: r.agent_key,
    status: r.revoked_at ? 'REVOKED' : heartbeatFresh(r.last_heartbeat_at) ? 'ONLINE' : r.last_heartbeat_at ? 'OFFLINE' : 'PENDING',
    hostname: r.hostname,
    osInfo: r.os_info,
    agentVersion: r.agent_version,
    lastHeartbeatAt: iso(r.last_heartbeat_at),
    lastIp: r.last_ip,
    maxConcurrency: num(r.max_concurrency),
    servers: num(r.servers),
    createdAt: iso(r.created_at),
    revokedAt: iso(r.revoked_at),
  };
}

export async function listAgents() {
  const rows = await select(
    `SELECT ag.*, (SELECT COUNT(*) FROM tally_servers s WHERE s.integration_agent_id = ag.id) AS servers
     FROM integration_agents ag ORDER BY ag.revoked_at IS NULL DESC, ag.name`,
  );
  return rows.map(presentAgent);
}

export async function createAgent(ctx: AuthContext, input: z.infer<typeof agentInputSchema>, req: Request) {
  const secret = randomToken(32);
  const agent = await IntegrationAgent.create({
    name: input.name,
    agentKey: `agt_${randomToken(12)}`,
    secretHash: sha256(secret),
    maxConcurrency: input.maxConcurrency ?? 1,
    hostname: null,
    osInfo: null,
    agentVersion: null,
    lastHeartbeatAt: null,
    lastIp: null,
    revokedAt: null,
  });
  await audit({ action: 'AGENT_CREATED', userId: ctx.user.id, entityType: 'agent', entityUuid: agent.uuid, metadata: { name: agent.name } }, req);
  return { agent: (await listAgents()).find((a) => a.id === agent.uuid)!, agentSecret: secret };
}

async function activeAgent(uuid: string) {
  const agent = await IntegrationAgent.findOne({ where: { uuid } });
  if (!agent) throw ApiError.notFound('Bridge Agent not found');
  if (agent.revokedAt) throw ApiError.conflict('This agent has been revoked', 'AGENT_REVOKED');
  return agent;
}

export async function rotateAgentSecret(ctx: AuthContext, uuid: string, req: Request) {
  const agent = await activeAgent(uuid);
  const secret = randomToken(32);
  await agent.update({ secretHash: sha256(secret) });
  await audit({ action: 'AGENT_SECRET_ROTATED', userId: ctx.user.id, entityType: 'agent', entityUuid: agent.uuid }, req);
  return { agentKey: agent.agentKey, agentSecret: secret };
}

export async function revokeAgent(ctx: AuthContext, uuid: string, req: Request) {
  const agent = await activeAgent(uuid);
  await agent.update({ revokedAt: new Date(), status: 'REVOKED', isActive: false, secretHash: sha256(randomToken(32)) });
  await audit({ action: 'AGENT_REVOKED', userId: ctx.user.id, entityType: 'agent', entityUuid: agent.uuid }, req);
  return (await listAgents()).find((a) => a.id === agent.uuid)!;
}
