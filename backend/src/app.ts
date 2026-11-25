import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { logger } from './config/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { apiLimiter } from './middleware/rateLimiters';
import { requestContext } from './middleware/requestContext';
import { apiRouter } from './routes';
import { webhooksRouter } from './routes/webhooks.routes';

/** Copied UI (`backend/public`) wins, so a deployed backend folder does not need the frontend source. */
function resolveFrontendDir(): string | null {
  const bundled = path.resolve(__dirname, '..', 'public');
  const sibling = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
  if (fs.existsSync(path.join(bundled, 'index.html'))) return bundled;
  if (fs.existsSync(path.join(sibling, 'index.html'))) return sibling;
  return null;
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.set('query parser', 'simple');

  app.use(requestContext);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'", 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          formAction: ["'self'"],
        },
      },
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

  const frontendDir = resolveFrontendDir();
  if (frontendDir) {
    logger.info('Serving frontend', { dir: frontendDir });
    app.use(express.static(frontendDir, { index: 'index.html', redirect: false }));
    app.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path === '/api' || req.path.startsWith('/api/')) {
        next();
        return;
      }
      if (path.extname(req.path)) {
        next();
        return;
      }
      res.sendFile(path.join(frontendDir, 'index.html'), (err) => {
        if (err) next(err);
      });
    });
  } else {
    logger.warn('Frontend build not found. From the backend folder run: npm run build:ui');
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
