import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger';

const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  req.requestId = incoming && REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);

  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    logger.http('request', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: Math.round(durationMs),
      userId: req.auth?.user.uuid,
    });
  });
  next();
}
