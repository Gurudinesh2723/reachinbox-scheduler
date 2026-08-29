import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError';
import { logger } from '../config/logger';
import { isProduction } from '../config/env';
import { ApiErrorBody } from '../utils/apiResponse';

export function notFoundHandler(req: Request, res: Response) {
  const body: ApiErrorBody = {
    success: false,
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
  };
  res.status(404).json(body);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const body: ApiErrorBody = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.flatten(),
      },
    };
    return res.status(400).json(body);
  }

  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.path }, 'API error');
    } else {
      logger.warn({ code: err.code, message: err.message, path: req.path }, 'API error');
    }
    const body: ApiErrorBody = {
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    };
    return res.status(err.statusCode).json(body);
  }

  logger.error({ err, path: req.path }, 'Unhandled error');
  const body: ApiErrorBody = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: isProduction ? 'An unexpected error occurred' : (err as Error)?.message ?? 'Unknown error',
    },
  };
  res.status(500).json(body);
}
