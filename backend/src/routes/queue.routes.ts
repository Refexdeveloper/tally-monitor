import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../middleware/authenticate';
import { sensitiveLimiter } from '../middleware/rateLimiters';
import { validate } from '../middleware/validate';
import * as agentMasters from '../services/agentMasters.service';
import * as agentQueue from '../services/agentQueue.service';
import { uuidParam } from '../services/common';
import * as queue from '../services/queue.service';
import { ok } from '../utils/http';
import { workerStatus } from '../worker/queueWorker';

/** User-facing queue actions (mounted at /jobs). Listing lives at GET /jobs in the records router. */
export const jobsRouter = Router();
jobsRouter.use(authenticate);

const id = (req: Request) => req.params.id as string;

jobsRouter.get('/summary', requirePermission('jobs.view'), async (req: Request, res: Response) => ok(res, await queue.queueSummary(req.auth!)));
jobsRouter.get('/worker-status', requirePermission('jobs.view'), async (_req: Request, res: Response) => ok(res, await workerStatus()));
jobsRouter.post('/bulk-approve', requirePermission('jobs.approve'), validate('body', queue.bulkApproveSchema), async (req: Request, res: Response) => {
  const b = req.body as { jobIds: string[]; notes?: string };
  ok(res, await queue.bulkApprove(req.auth!, b.jobIds, b.notes, req));
});
jobsRouter.get('/:id', requirePermission('jobs.view'), validate('params', uuidParam), async (req: Request, res: Response) => ok(res, await queue.getJob(req.auth!, id(req))));
jobsRouter.post('/:id/approve', requirePermission('jobs.approve'), validate('params', uuidParam), validate('body', queue.approveSchema), async (req: Request, res: Response) =>
  ok(res, await queue.approveJob(req.auth!, id(req), (req.body as { notes?: string | null }).notes, req)),
);
jobsRouter.post('/:id/reject', requirePermission('jobs.approve'), validate('params', uuidParam), validate('body', queue.reasonSchema), async (req: Request, res: Response) =>
  ok(res, await queue.rejectJob(req.auth!, id(req), (req.body as { reason: string }).reason, req)),
);
jobsRouter.post('/:id/cancel', requirePermission('jobs.manage'), validate('params', uuidParam), validate('body', queue.reasonSchema), async (req: Request, res: Response) =>
  ok(res, await queue.cancelJob(req.auth!, id(req), (req.body as { reason: string }).reason, req)),
);
jobsRouter.post('/:id/retry', requirePermission('jobs.manage'), validate('params', uuidParam), async (req: Request, res: Response) => ok(res, await queue.retryJob(req.auth!, id(req), req)));
jobsRouter.post('/:id/pause', requirePermission('jobs.manage'), validate('params', uuidParam), async (req: Request, res: Response) => ok(res, await queue.setPaused(req.auth!, id(req), true, req)));
jobsRouter.post('/:id/resume', requirePermission('jobs.manage'), validate('params', uuidParam), async (req: Request, res: Response) => ok(res, await queue.setPaused(req.auth!, id(req), false, req)));
jobsRouter.post('/:id/revalidate', requirePermission('jobs.manage'), validate('params', uuidParam), async (req: Request, res: Response) => ok(res, await queue.revalidateJob(req.auth!, id(req), req)));
jobsRouter.post('/:id/reconcile', requirePermission('vouchers.post'), validate('params', uuidParam), validate('body', queue.reconcileSchema), async (req: Request, res: Response) =>
  ok(res, await queue.reconcileJob(req.auth!, id(req), req.body, req)),
);

/** Bridge Agent contract (mounted at /agents). Authenticated by agent key + secret, never by user sessions. */
export const agentsRouter = Router();
const attemptParams = z.object({ id: z.string().uuid() });

agentsRouter.post('/register', sensitiveLimiter, agentQueue.authenticateAgent, validate('body', agentQueue.heartbeatSchema), async (req: Request, res: Response) => ok(res, await agentQueue.registerAgent(req, req.body)));
agentsRouter.post('/heartbeat', agentQueue.authenticateAgent, validate('body', agentQueue.heartbeatSchema), async (req: Request, res: Response) => ok(res, await agentQueue.agentHeartbeat(req, req.body)));
agentsRouter.get('/jobs', agentQueue.authenticateAgent, validate('query', agentQueue.claimSchema), async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.validatedQuery as { limit: number; companies?: string[] };
  ok(res, await agentQueue.claimJobs(req, q.limit, q.companies));
});
agentsRouter.post('/jobs/:id/submitting', agentQueue.authenticateAgent, validate('params', attemptParams), validate('body', agentQueue.submittingSchema), async (req: Request, res: Response) =>
  ok(res, await agentQueue.markSubmitting(req, id(req), (req.body as { attemptId: string }).attemptId)),
);
agentsRouter.post('/jobs/:id/heartbeat', agentQueue.authenticateAgent, validate('params', attemptParams), validate('body', agentQueue.submittingSchema), async (req: Request, res: Response) =>
  ok(res, await agentQueue.jobHeartbeat(req, id(req), (req.body as { attemptId: string }).attemptId)),
);
agentsRouter.post('/ledgers/sync', agentQueue.authenticateAgent, validate('body', agentMasters.ledgerSyncSchema), async (req: Request, res: Response) => ok(res, await agentMasters.syncLedgers(req, req.body)));
agentsRouter.get('/master-requests', agentQueue.authenticateAgent, validate('query', agentQueue.claimSchema), async (req: Request, res: Response) =>
  ok(res, await agentMasters.claimMasterRequests(req, (req.validatedQuery as { companies?: string[] }).companies)),
);
agentsRouter.post('/master-requests/:id/result', agentQueue.authenticateAgent, validate('params', attemptParams), validate('body', agentMasters.masterResultSchema), async (req: Request, res: Response) =>
  ok(res, await agentMasters.reportMasterResult(req, id(req), req.body)),
);
agentsRouter.post('/jobs/:id/result', agentQueue.authenticateAgent, validate('params', attemptParams), validate('body', agentQueue.resultSchema), async (req: Request, res: Response) =>
  ok(res, await agentQueue.reportResult(req, id(req), req.body)),
);
