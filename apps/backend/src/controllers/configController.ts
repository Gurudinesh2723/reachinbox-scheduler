import { Request, Response } from 'express';
import { env } from '../config/env';
import { sendSuccess } from '../utils/apiResponse';

/**
 * Exposes the server's configured scheduling defaults so the frontend never
 * has to hardcode a duplicate of MIN_EMAIL_DELAY / MAX_EMAILS_PER_HOUR - the
 * compose form initializes from whatever this environment is actually
 * configured with.
 */
export function getSchedulingDefaults(_req: Request, res: Response) {
  return sendSuccess(res, {
    minEmailDelay: env.MIN_EMAIL_DELAY,
    maxEmailsPerHour: env.MAX_EMAILS_PER_HOUR,
    workerConcurrency: env.WORKER_CONCURRENCY,
  });
}
