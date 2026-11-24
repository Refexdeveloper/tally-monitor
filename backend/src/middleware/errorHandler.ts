import type { NextFunction, Request, Response } from 'express';
import { ValidationError as SequelizeValidationError, UniqueConstraintError, ConnectionError } from 'sequelize';
import { ZodError } from 'zod';
import { logger } from '../config/logger';
import { InvalidTransitionError } from '../domain/jobStatus';
import { ApiError } from '../utils/http';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound(`Route ${req.method} ${req.path} does not exist`));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let error: ApiError;

  if (err instanceof ApiError) {
    error = err;
  } else if (err instanceof ZodError) {
    error = new ApiError(422, 'VALIDATION_ERROR', 'Request validation failed', err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  } else if (err instanceof InvalidTransitionError) {
    error = new ApiError(409, 'INVALID_STATUS_TRANSITION', err.message);
  } else if (err instanceof UniqueConstraintError) {
    error = new ApiError(409, 'DUPLICATE', 'A record with the same unique value already exists', err.errors.map((e) => e.path));
  } else if (err instanceof SequelizeValidationError) {
    error = new ApiError(422, 'VALIDATION_ERROR', 'Data validation failed', err.errors.map((e) => ({ path: e.path, message: e.message })));
  } else if (err instanceof ConnectionError) {
    error = new ApiError(503, 'DATABASE_UNAVAILABLE', 'The database is currently unavailable. Please try again shortly.');
  } else if (typeof err === 'object' && err !== null && 'type' in err && (err as { type: string }).type === 'entity.parse.failed') {
    error = ApiError.badRequest('Malformed JSON body');
  } else if (typeof err === 'object' && err !== null && 'type' in err && (err as { type: string }).type === 'entity.too.large') {
    error = new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  } else {
    error = new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }

  if (error.status >= 500) {
    const e = err instanceof Error ? err : new Error(String(err));
    logger.error('Unhandled request error', { requestId: req.requestId, path: req.path, error: e.message, stack: e.stack });
  }

  res.status(error.status).json({
    success: false,
    error: { code: error.code, message: error.message, ...(error.details !== undefined ? { details: error.details } : {}) },
    requestId: req.requestId,
  });
}
