import { NextFunction, Request, Response } from 'express';
import { ZodTypeAny } from 'zod';

type Target = 'body' | 'query' | 'params';

export function validate(schema: ZodTypeAny, target: Target = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.parse(req[target]);
    (req as Record<Target, unknown>)[target] = parsed;
    next();
  };
}
