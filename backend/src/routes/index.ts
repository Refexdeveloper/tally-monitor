import { Router } from 'express';
import { accountingRouter } from './accounting.routes';
import { recordsRouter, rolesRouter, settingsRouter, usersRouter } from './admin.routes';
import { applicationsRouter } from './applications.routes';
import { authRouter } from './auth.routes';
import { companiesRouter } from './companies.routes';
import { dashboardRouter } from './dashboard.routes';
import { healthRouter } from './health.routes';
import { agentsRouter, jobsRouter } from './queue.routes';
import { reportsRouter } from './reports.routes';
import { tallyRouter } from './tally.routes';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/companies', companiesRouter);
apiRouter.use('/applications', applicationsRouter);
apiRouter.use('/tally', tallyRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/roles', rolesRouter);
apiRouter.use('/settings', settingsRouter);
apiRouter.use('/jobs', jobsRouter);
apiRouter.use('/agents', agentsRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/', recordsRouter);
apiRouter.use('/', accountingRouter);
