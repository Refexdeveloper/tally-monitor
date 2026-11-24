import { Router, type Request, type Response } from 'express';
import { checkDatabase } from '../services/health.service';

/** Unauthenticated probes for Cloud Run. They reveal no configuration. */
export const healthRouter = Router();

healthRouter.get('/', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

healthRouter.get('/ready', async (_req: Request, res: Response) => {
  const db = await checkDatabase();
  res.status(db.status === 'UP' ? 200 : 503).json({ status: db.status === 'UP' ? 'ready' : 'not_ready', database: db.status });
});
