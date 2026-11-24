import { Router, type Request, type Response } from 'express';
import { authenticate, requirePermission } from '../middleware/authenticate';
import { sensitiveLimiter } from '../middleware/rateLimiters';
import { validate } from '../middleware/validate';
import { uuidParam } from '../services/common';
import { getIntegrationHealth } from '../services/health.service';
import * as tally from '../services/tally.service';
import { ok } from '../utils/http';

export const tallyRouter = Router();
tallyRouter.use(authenticate);

tallyRouter.get('/connections', requirePermission('tally.view'), async (req: Request, res: Response) => {
  ok(res, await tally.listServers(req.auth!));
});

tallyRouter.post('/connections', requirePermission('tally.manage'), validate('body', tally.serverInputSchema), async (req: Request, res: Response) => {
  ok(res, await tally.createServer(req.auth!, req.body, req), undefined, 201);
});

tallyRouter.put('/connections/:id', requirePermission('tally.manage'), validate('params', uuidParam), validate('body', tally.serverUpdateSchema), async (req: Request, res: Response) => {
  ok(res, await tally.updateServer(req.auth!, req.params.id as string, req.body, req));
});

tallyRouter.post('/connections/:id/test', requirePermission('tally.manage'), validate('params', uuidParam), async (req: Request, res: Response) => {
  ok(res, await tally.testServer(req.auth!, req.params.id as string, req));
});

tallyRouter.get('/health', requirePermission('tally.view'), async (req: Request, res: Response) => {
  const health = await getIntegrationHealth(req.auth!);
  ok(res, { checkedAt: health.checkedAt, agents: health.agents, tally: health.tally });
});

tallyRouter.get('/agents', requirePermission('tally.view'), async (_req: Request, res: Response) => {
  ok(res, await tally.listAgents());
});

tallyRouter.post('/agents', requirePermission('agents.manage'), sensitiveLimiter, validate('body', tally.agentInputSchema), async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  ok(res, await tally.createAgent(req.auth!, req.body, req), undefined, 201);
});

tallyRouter.post('/agents/:id/rotate-secret', requirePermission('agents.manage'), sensitiveLimiter, validate('params', uuidParam), async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  ok(res, await tally.rotateAgentSecret(req.auth!, req.params.id as string, req));
});

tallyRouter.post('/agents/:id/revoke', requirePermission('agents.manage'), validate('params', uuidParam), async (req: Request, res: Response) => {
  ok(res, await tally.revokeAgent(req.auth!, req.params.id as string, req));
});
