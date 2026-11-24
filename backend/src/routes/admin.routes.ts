import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../middleware/authenticate';
import { sensitiveLimiter } from '../middleware/rateLimiters';
import { validate } from '../middleware/validate';
import { listQuerySchema, uuidParam } from '../services/common';
import * as records from '../services/records.service';
import * as settings from '../services/settings.service';
import * as users from '../services/users.service';
import { ok } from '../utils/http';

/** Users, roles, settings and read-only record listings. */
export const usersRouter = Router();
usersRouter.use(authenticate);

usersRouter.get('/', requirePermission('users.view'), validate('query', listQuerySchema.extend(users.userListSchema.shape)), async (req: Request, res: Response) => {
  const result = await users.listUsers(req.validatedQuery as never);
  ok(res, result.items, result.meta);
});
usersRouter.post('/', requirePermission('users.manage'), validate('body', users.userCreateSchema), async (req: Request, res: Response) => {
  ok(res, await users.createUser(req.auth!, req.body, req), undefined, 201);
});
usersRouter.get('/:id', requirePermission('users.view'), validate('params', uuidParam), async (req: Request, res: Response) => {
  ok(res, await users.getUser(req.params.id as string));
});
usersRouter.put('/:id', requirePermission('users.manage'), validate('params', uuidParam), validate('body', users.userUpdateSchema), async (req: Request, res: Response) => {
  ok(res, await users.updateUser(req.auth!, req.params.id as string, req.body, req));
});
usersRouter.post('/:id/unlock', requirePermission('users.manage'), validate('params', uuidParam), async (req: Request, res: Response) => {
  ok(res, await users.unlockUser(req.auth!, req.params.id as string, req));
});
usersRouter.post('/:id/password', requirePermission('users.manage'), sensitiveLimiter, validate('params', uuidParam), validate('body', users.adminPasswordSchema), async (req: Request, res: Response) => {
  ok(res, await users.setUserPassword(req.auth!, req.params.id as string, (req.body as { password: string }).password, req));
});

export const rolesRouter = Router();
rolesRouter.use(authenticate);
rolesRouter.get('/', requirePermission('users.view'), async (_req: Request, res: Response) => {
  ok(res, await users.listRoles());
});
rolesRouter.get('/permissions', requirePermission('users.view'), async (_req: Request, res: Response) => {
  ok(res, await users.listPermissions());
});
rolesRouter.post('/', requirePermission('users.manage'), validate('body', users.roleInputSchema), async (req: Request, res: Response) => {
  ok(res, await users.createRole(req.auth!, req.body, req), undefined, 201);
});
rolesRouter.put('/:id', requirePermission('users.manage'), validate('params', uuidParam), validate('body', users.rolePermissionsSchema), async (req: Request, res: Response) => {
  ok(res, await users.updateRole(req.auth!, req.params.id as string, req.body, req));
});
rolesRouter.delete('/:id', requirePermission('users.manage'), validate('params', uuidParam), async (req: Request, res: Response) => {
  await users.deleteRole(req.auth!, req.params.id as string, req);
  ok(res, { deleted: true });
});

export const settingsRouter = Router();
settingsRouter.use(authenticate);
settingsRouter.get('/', requirePermission('settings.view'), async (_req: Request, res: Response) => {
  ok(res, await settings.listSettings());
});
settingsRouter.put(
  '/:key',
  requirePermission('settings.manage'),
  validate('params', z.object({ key: z.string().regex(/^[a-z_.]{3,120}$/) })),
  validate('body', settings.settingUpdateSchema),
  async (req: Request, res: Response) => {
    ok(res, await settings.updateSetting(req.auth!, req.params.key as string, (req.body as { value: unknown }).value, req));
  },
);

export const recordsRouter = Router();
recordsRouter.get('/expenses', authenticate, requirePermission('expenses.view'), validate('query', listQuerySchema.extend(records.expenseFilterSchema.shape)), async (req: Request, res: Response) => {
  const result = await records.listExpenses(req.auth!, req.validatedQuery as never);
  ok(res, result.items, result.meta);
});
recordsRouter.get('/expenses/categories', authenticate, requirePermission('expenses.view'), async (req: Request, res: Response) => {
  ok(res, await records.expenseCategories(req.auth!));
});
recordsRouter.get('/expenses/:id', authenticate, requirePermission('expenses.view'), validate('params', uuidParam), async (req: Request, res: Response) => {
  ok(res, await records.getExpense(req.auth!, req.params.id as string));
});
recordsRouter.get('/jobs', authenticate, requirePermission('jobs.view'), validate('query', listQuerySchema.extend(records.jobFilterSchema.shape)), async (req: Request, res: Response) => {
  const result = await records.listJobs(req.auth!, req.validatedQuery as never);
  ok(res, result.items, result.meta);
});
recordsRouter.get('/audit-logs/actions', authenticate, requirePermission('audit.view'), async (req: Request, res: Response) => {
  ok(res, await records.auditActions(req.auth!));
});
recordsRouter.get('/audit-logs', authenticate, requirePermission('audit.view'), validate('query', listQuerySchema.extend(records.auditFilterSchema.shape)), async (req: Request, res: Response) => {
  const result = await records.listAuditLogs(req.auth!, req.validatedQuery as never);
  ok(res, result.items, result.meta);
});
