import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { getAnalytics, getOverview, getRecentActivity } from '../services/dashboard.service';
import { getIntegrationHealth } from '../services/health.service';
import { ok } from '../utils/http';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate, requirePermission('dashboard.view'));

const tz = z.coerce.number().int().min(-720).max(840).default(0);

dashboardRouter.get('/overview', validate('query', z.object({ tzOffset: tz })), async (req: Request, res: Response) => {
  const { tzOffset } = req.validatedQuery as { tzOffset: number };
  ok(res, await getOverview(req.auth!, tzOffset));
});

dashboardRouter.get(
  '/analytics',
  validate('query', z.object({ tzOffset: tz, days: z.coerce.number().int().min(7).max(365).default(30) })),
  async (req: Request, res: Response) => {
    const { tzOffset, days } = req.validatedQuery as { tzOffset: number; days: number };
    ok(res, await getAnalytics(req.auth!, days, tzOffset));
  },
);

dashboardRouter.get('/activity', async (req: Request, res: Response) => {
  ok(res, await getRecentActivity(req.auth!));
});

dashboardRouter.get('/health', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  ok(res, await getIntegrationHealth(req.auth!));
});
