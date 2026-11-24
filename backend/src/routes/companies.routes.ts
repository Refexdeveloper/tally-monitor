import { Router, type Request, type Response } from 'express';
import { authenticate, requirePermission } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { listQuerySchema, uuidParam } from '../services/common';
import * as companies from '../services/companies.service';
import { ok } from '../utils/http';

export const companiesRouter = Router();
companiesRouter.use(authenticate);

companiesRouter.get('/', requirePermission('companies.view'), validate('query', listQuerySchema.extend(companies.companyListSchema.shape)), async (req: Request, res: Response) => {
  const result = await companies.listCompanies(req.auth!, req.validatedQuery as never);
  ok(res, result.items, result.meta);
});

companiesRouter.post('/', requirePermission('companies.manage'), validate('body', companies.companyInputSchema), async (req: Request, res: Response) => {
  ok(res, await companies.createCompany(req.auth!, req.body, req), undefined, 201);
});

companiesRouter.get('/:id', requirePermission('companies.view'), validate('params', uuidParam), async (req: Request, res: Response) => {
  ok(res, await companies.getCompany(req.auth!, req.params.id as string));
});

companiesRouter.put('/:id', requirePermission('companies.manage'), validate('params', uuidParam), validate('body', companies.companyUpdateSchema), async (req: Request, res: Response) => {
  ok(res, await companies.updateCompany(req.auth!, req.params.id as string, req.body, req));
});

companiesRouter.get('/:id/applications', requirePermission('companies.view'), validate('params', uuidParam), async (req: Request, res: Response) => {
  ok(res, await companies.listCompanyApplications(req.auth!, req.params.id as string));
});
