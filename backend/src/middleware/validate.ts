import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

type Part = 'body' | 'query' | 'params';

/** Parses and replaces the request part with the validated (and coerced) value. */
export function validate(part: Part, schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const value = schema.parse(req[part]);
    if (part === 'query') {
      // Express 5 exposes req.query as a getter; store the parsed copy separately.
      req.validatedQuery = value as Record<string, unknown>;
    } else {
      (req as unknown as Record<Part, unknown>)[part] = value;
    }
    next();
  };
}
