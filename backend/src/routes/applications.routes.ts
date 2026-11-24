import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../middleware/authenticate';
import { sensitiveLimiter } from '../middleware/rateLimiters';
import { validate } from '../middleware/validate';
import * as apps from '../services/applications.service';
import { listQuerySchema, uuidParam } from '../services/common';
import * as intake from '../services/intake.service';
import { ok } from '../utils/http';

export const applicationsRouter = Router();
applicationsRouter.use(authenticate);

const linkParams = z.object({ id: z.string().uuid(), companyId: z.string().uuid() });

applicationsRouter.get('/mapping-catalog', requirePermission('applications.view'), (_req: Request, res: Response) => {
  ok(res, intake.mappingCatalog());
});

applicationsRouter.get('/', requirePermission('applications.view'), validate('query', listQuerySchema.extend(apps.applicationListSchema.shape)), async (req: Request, res: Response) => {
  const result = await apps.listApplications(req.auth!, req.validatedQuery as never);
  ok(res, result.items, result.meta);
});

applicationsRouter.post('/', requirePermission('applications.manage'), validate('body', apps.applicationCreateSchema), async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  ok(res, await apps.createApplication(req.auth!, req.body, req), undefined, 201);
});

applicationsRouter.get('/:id', requirePermission('applications.view'), validate('params', uuidParam), async (req: Request, res: Response) => {
  ok(res, await apps.getApplication(req.auth!, req.params.id as string));
});

applicationsRouter.put('/:id', requirePermission('applications.manage'), validate('params', uuidParam), validate('body', apps.applicationUpdateSchema), async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  ok(res, await apps.updateApplication(req.auth!, req.params.id as string, req.body, req));
});

applicationsRouter.delete('/:id', requirePermission('applications.manage'), validate('params', uuidParam), async (req: Request, res: Response) => {
  await apps.deleteApplication(req.auth!, req.params.id as string, req);
  ok(res, { deleted: true });
});

applicationsRouter.post('/:id/regenerate-secret', requirePermission('applications.manage'), sensitiveLimiter, validate('params', uuidParam), async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  ok(res, await apps.regenerateWebhookSecret(req.auth!, req.params.id as string, req));
});

applicationsRouter.post('/:id/test-connection', requirePermission('applications.manage'), sensitiveLimiter, validate('params', uuidParam), async (req: Request, res: Response) => {
  ok(res, await apps.testConnection(req.auth!, req.params.id as string, req));
});

applicationsRouter.get('/:id/companies', requirePermission('applications.view'), validate('params', uuidParam), async (req: Request, res: Response) => {
  ok(res, await apps.listApplicationCompanies(req.auth!, req.params.id as string));
});

applicationsRouter.post('/:id/companies', requirePermission('applications.manage'), validate('params', uuidParam), validate('body', apps.companyLinkInputSchema), async (req: Request, res: Response) => {
  ok(res, await apps.addCompanyLink(req.auth!, req.params.id as string, req.body, req), undefined, 201);
});

applicationsRouter.put('/:id/companies/:companyId', requirePermission('applications.manage'), validate('params', linkParams), validate('body', apps.companyLinkUpdateSchema), async (req: Request, res: Response) => {
  ok(res, await apps.updateCompanyLink(req.auth!, req.params.id as string, req.params.companyId as string, req.body, req));
});

// --- Phase 3: field mapping, intake testing and API logs ----------------------

const receiptParams = z.object({ id: z.string().uuid(), receiptId: z.string().uuid() });

applicationsRouter.get('/:id/mappings', requirePermission('applications.view'), validate('params', uuidParam), async (req: Request, res: Response) => {
  ok(res, await intake.getMappings(req.auth!, req.params.id as string));
});
applicationsRouter.put('/:id/mappings', requirePermission('applications.manage'), validate('params', uuidParam), validate('body', intake.mappingsInputSchema), async (req: Request, res: Response) => {
  ok(res, await intake.saveMappings(req.auth!, req.params.id as string, (req.body as { mappings: never }).mappings, req));
});
applicationsRouter.post('/:id/mappings/preview', requirePermission('applications.view'), validate('params', uuidParam), validate('body', intake.previewSchema), async (req: Request, res: Response) => {
  const body = req.body as { payload: unknown; mappings?: never };
  ok(res, await intake.previewMapping(req.auth!, req.params.id as string, body.payload, body.mappings));
});
applicationsRouter.post('/:id/import', requirePermission('applications.manage'), sensitiveLimiter, validate('params', uuidParam), validate('body', intake.importSchema), async (req: Request, res: Response) => {
  // The intake outcome (accepted, duplicate or rejected with reasons) is the result; the request itself succeeded.
  ok(res, await intake.manualImport(req.auth!, req.params.id as string, (req.body as { payload: unknown }).payload, req));
});
applicationsRouter.post('/:id/sync', requirePermission('applications.manage'), sensitiveLimiter, validate('params', uuidParam), async (req: Request, res: Response) => {
  ok(res, await intake.syncFromApi(req.auth!, req.params.id as string, req));
});
applicationsRouter.get('/:id/receipts', requirePermission('applications.view'), validate('params', uuidParam), validate('query', listQuerySchema.extend(intake.receiptListSchema.shape)), async (req: Request, res: Response) => {
  const result = await intake.listReceipts(req.auth!, req.params.id as string, req.validatedQuery as never);
  ok(res, result.items, result.meta);
});
applicationsRouter.get('/:id/receipts/:receiptId', requirePermission('applications.view'), validate('params', receiptParams), async (req: Request, res: Response) => {
  ok(res, await intake.getReceipt(req.auth!, req.params.id as string, req.params.receiptId as string));
});

applicationsRouter.delete('/:id/companies/:companyId', requirePermission('applications.manage'), validate('params', linkParams), async (req: Request, res: Response) => {
  ok(res, await apps.removeCompanyLink(req.auth!, req.params.id as string, req.params.companyId as string, req));
});
