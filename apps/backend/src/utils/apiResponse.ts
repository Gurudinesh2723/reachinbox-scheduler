import { Response } from 'express';

export interface ApiSuccessBody<T> {
  success: true;
  data: T;
  message?: string;
  meta?: Record<string, unknown>;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  options: { message?: string; status?: number; meta?: Record<string, unknown> } = {},
) {
  const body: ApiSuccessBody<T> = { success: true, data };
  if (options.message) body.message = options.message;
  if (options.meta) body.meta = options.meta;
  return res.status(options.status ?? 200).json(body);
}
