import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiters';
import { requestContext } from './middleware/requestContext';
import { apiRouter } from './routes';
import { webhooksRouter } from './routes/webhooks.routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.set('query parser', 'simple');

  app.use(requestContext);
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) => {
        // Same-origin and server-to-server calls carry no Origin header.
        if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
        cb(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-Id'],
      maxAge: 600,
    }),
  );
  // Webhooks need the raw body for signature verification, so they bypass the JSON parser.
  app.use('/api/v1/webhooks', webhooksRouter);
  // Full ledger lists from Tally can be large; only this agent route accepts bigger bodies.
  app.use('/api/v1/agents/ledgers/sync', express.json({ limit: '15mb' }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.use('/api/v1', apiLimiter, apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
