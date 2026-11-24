import { Router, type Request, type Response } from 'express';
import { authenticate, requirePermission } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import * as accounting from '../services/accounting.service';
import { listQuerySchema, uuidParam } from '../services/common';
import * as ledgers from '../services/ledgers.service';
import * as vouchers from '../services/vouchers.service';
import { ok } from '../utils/http';

/** Phase 4 accounting endpoints. Every route authenticates individually (router is mounted at /). */
export const accountingRouter = Router();
const auth = authenticate;

// --- Ledgers --------------------------------------------------------------------
accountingRouter.get('/ledgers', auth, requirePermission('ledgers.view'), validate('query', listQuerySchema.extend(ledgers.ledgerListSchema.shape)), async (req: Request, res: Response) => {
  const r = await ledgers.listLedgers(req.auth!, req.validatedQuery as never);
  ok(res, r.items, r.meta);
});
accountingRouter.post('/ledgers/import', auth, requirePermission('ledgers.manage'), validate('body', ledgers.ledgerImportSchema), async (req: Request, res: Response) => {
  const b = req.body as { companyId: string; text: string };
  ok(res, await ledgers.importLedgers(req.auth!, b.companyId, b.text, req));
});
accountingRouter.get('/ledgers/unmapped', auth, requirePermission('ledgers.view'), validate('query', ledgers.companyQuerySchema), async (req: Request, res: Response) => {
  ok(res, await ledgers.unmappedCategories(req.auth!, (req.validatedQuery as { companyId: string }).companyId));
});
accountingRouter.get('/ledgers/missing', auth, requirePermission('ledgers.view'), validate('query', ledgers.companyQuerySchema), async (req: Request, res: Response) => {
  ok(res, await ledgers.missingLedgers(req.auth!, (req.validatedQuery as { companyId: string }).companyId));
});
accountingRouter.put('/ledgers/:id', auth, requirePermission('ledgers.manage'), validate('params', uuidParam), validate('body', ledgers.ledgerUpdateSchema), async (req: Request, res: Response) => {
  ok(res, await ledgers.updateLedger(req.auth!, req.params.id as string, req.body, req));
});

// --- Ledger mappings ------------------------------------------------------------------
accountingRouter.get('/ledger-mappings', auth, requirePermission('ledgers.view'), validate('query', ledgers.mappingListSchema.extend({ search: listQuerySchema.shape.search })), async (req: Request, res: Response) => {
  ok(res, await ledgers.listMappings(req.auth!, req.validatedQuery as never));
});
accountingRouter.post('/ledger-mappings', auth, requirePermission('ledgers.manage'), validate('body', ledgers.mappingInputSchema), async (req: Request, res: Response) => {
  ok(res, await ledgers.createMapping(req.auth!, req.body, req), undefined, 201);
});
accountingRouter.put('/ledger-mappings/:id', auth, requirePermission('ledgers.manage'), validate('params', uuidParam), validate('body', ledgers.mappingUpdateSchema), async (req: Request, res: Response) => {
  ok(res, await ledgers.updateMapping(req.auth!, req.params.id as string, req.body, req));
});
accountingRouter.delete('/ledger-mappings/:id', auth, requirePermission('ledgers.manage'), validate('params', uuidParam), async (req: Request, res: Response) => {
  await ledgers.deleteMapping(req.auth!, req.params.id as string, req);
  ok(res, { deleted: true });
});

// --- Master creation requests -----------------------------------------------------------
accountingRouter.get('/master-requests', auth, requirePermission('ledgers.view'), validate('query', listQuerySchema.extend(ledgers.masterListSchema.shape)), async (req: Request, res: Response) => {
  const r = await ledgers.listMasterRequests(req.auth!, req.validatedQuery as never);
  ok(res, r.items, r.meta);
});
accountingRouter.post('/master-requests', auth, requirePermission('masters.request'), validate('body', ledgers.masterRequestInputSchema), async (req: Request, res: Response) => {
  ok(res, await ledgers.createMasterRequest(req.auth!, req.body, req), undefined, 201);
});
accountingRouter.put('/master-requests/:id', auth, requirePermission('masters.request'), validate('params', uuidParam), validate('body', ledgers.masterRequestUpdateSchema), async (req: Request, res: Response) => {
  ok(res, await ledgers.updateMasterRequest(req.auth!, req.params.id as string, req.body, req));
});
accountingRouter.post('/master-requests/:id/approve', auth, requirePermission('masters.approve'), validate('params', uuidParam), validate('body', ledgers.masterReviewSchema), async (req: Request, res: Response) => {
  ok(res, await ledgers.reviewMasterRequest(req.auth!, req.params.id as string, 'APPROVED', (req.body as { notes?: string | null }).notes, req));
});
accountingRouter.post('/master-requests/:id/reject', auth, requirePermission('masters.approve'), validate('params', uuidParam), validate('body', ledgers.masterReviewSchema), async (req: Request, res: Response) => {
  ok(res, await ledgers.reviewMasterRequest(req.auth!, req.params.id as string, 'REJECTED', (req.body as { notes?: string | null }).notes, req));
});
accountingRouter.post('/master-requests/:id/retry-creation', auth, requirePermission('masters.approve'), validate('params', uuidParam), async (req: Request, res: Response) => {
  ok(res, await ledgers.retryMasterCreation(req.auth!, req.params.id as string, req));
});
accountingRouter.post('/master-requests/:id/mark-created', auth, requirePermission('masters.approve'), validate('params', uuidParam), async (req: Request, res: Response) => {
  ok(res, await ledgers.markMasterCreated(req.auth!, req.params.id as string, req));
});

// --- Voucher configurations & routing ----------------------------------------------------
accountingRouter.get('/voucher-configurations', auth, requirePermission('vouchers.view'), validate('query', vouchers.companyQuery), async (req: Request, res: Response) => {
  ok(res, await vouchers.listConfigs(req.auth!, (req.validatedQuery as { companyId: string }).companyId));
});
accountingRouter.post('/voucher-configurations', auth, requirePermission('vouchers.manage'), validate('body', vouchers.configInputSchema), async (req: Request, res: Response) => {
  ok(res, await vouchers.createConfig(req.auth!, req.body, req), undefined, 201);
});
accountingRouter.put('/voucher-configurations/:id', auth, requirePermission('vouchers.manage'), validate('params', uuidParam), validate('body', vouchers.configUpdateSchema), async (req: Request, res: Response) => {
  ok(res, await vouchers.updateConfig(req.auth!, req.params.id as string, req.body, req));
});
accountingRouter.get('/voucher-mappings', auth, requirePermission('vouchers.view'), validate('query', vouchers.companyQuery), async (req: Request, res: Response) => {
  ok(res, await vouchers.listVoucherMappings(req.auth!, (req.validatedQuery as { companyId: string }).companyId));
});
accountingRouter.post('/voucher-mappings', auth, requirePermission('vouchers.manage'), validate('body', vouchers.voucherMappingInputSchema), async (req: Request, res: Response) => {
  ok(res, await vouchers.createVoucherMapping(req.auth!, req.body, req), undefined, 201);
});
accountingRouter.put('/voucher-mappings/:id', auth, requirePermission('vouchers.manage'), validate('params', uuidParam), validate('body', vouchers.voucherMappingUpdateSchema), async (req: Request, res: Response) => {
  ok(res, await vouchers.updateVoucherMapping(req.auth!, req.params.id as string, req.body, req));
});
accountingRouter.delete('/voucher-mappings/:id', auth, requirePermission('vouchers.manage'), validate('params', uuidParam), async (req: Request, res: Response) => {
  await vouchers.deleteVoucherMapping(req.auth!, req.params.id as string, req);
  ok(res, { deleted: true });
});
accountingRouter.get('/vouchers', auth, requirePermission('vouchers.view'), validate('query', listQuerySchema.extend(vouchers.postedListSchema.shape)), async (req: Request, res: Response) => {
  const r = await vouchers.listPostedVouchers(req.auth!, req.validatedQuery as never);
  ok(res, r.items, r.meta);
});

// --- Accounting validation ------------------------------------------------------------------
accountingRouter.get('/expenses/:id/voucher-preview', auth, requirePermission('expenses.view'), validate('params', uuidParam), async (req: Request, res: Response) => {
  ok(res, await accounting.previewVoucher(req.auth!, req.params.id as string));
});
accountingRouter.post('/expenses/:id/validate', auth, requirePermission('jobs.manage'), validate('params', uuidParam), async (req: Request, res: Response) => {
  ok(res, await accounting.validateExpenseByUuid(req.auth!, req.params.id as string, req));
});
accountingRouter.post('/companies/:id/revalidate', auth, requirePermission('jobs.manage'), validate('params', uuidParam), async (req: Request, res: Response) => {
  ok(res, await accounting.revalidateCompany(req.auth!, req.params.id as string, req));
});
