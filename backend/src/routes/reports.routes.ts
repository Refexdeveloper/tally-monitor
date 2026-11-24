import { Router, type Request, type Response } from 'express';
import { authenticate, requirePermission } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import * as reports from '../services/reports.service';
import { ok } from '../utils/http';

export const reportsRouter = Router();
const auth = authenticate;

reportsRouter.get('/', auth, requirePermission('reports.view'), (_req: Request, res: Response) => {
  ok(res, reports.catalog());
});

reportsRouter.get(
  '/:key',
  auth,
  requirePermission('reports.view'),
  validate('params', reports.reportKeyParam),
  validate('query', reports.reportFilterSchema),
  async (req: Request, res: Response) => {
    const key = (req.params as { key: reports.ReportKey }).key;
    ok(res, await reports.runReport(req.auth!, key, req.validatedQuery as reports.ReportFilters));
  },
);

reportsRouter.get(
  '/:key/export',
  auth,
  requirePermission('reports.export'),
  validate('params', reports.reportKeyParam),
  validate('query', reports.exportQuerySchema),
  async (req: Request, res: Response) => {
    const key = (req.params as { key: reports.ReportKey }).key;
    const q = req.validatedQuery as reports.ReportFilters & { format: 'csv' | 'xlsx' | 'pdf' };
    const file = await reports.exportReport(req.auth!, key, q, req);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(file.buffer);
  },
);
