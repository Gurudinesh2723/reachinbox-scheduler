import { Request, Response } from 'express';
import fs from 'fs/promises';
import { sendSuccess } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { env } from '../config/env';
import { parseEmailListFile } from '../utils/emailListParser';
import { scheduleEmails } from '../services/schedulingService';
import { getScheduledEmails, getSentEmails, searchEmails, getEmailByIdForUser } from '../services/emailQueryService';
import { ScheduleEmailsBody, searchEmailsQuerySchema, paginationSchema } from '../validation/emailSchemas';
import { z } from 'zod';

export async function parseRecipients(req: Request, res: Response) {
  if (!req.file) {
    throw ApiError.validation('A .csv or .txt file is required');
  }

  try {
    const result = await parseEmailListFile(req.file.path);
    if (result.totalLines === 0) {
      throw ApiError.validation('The uploaded file is empty');
    }
    return sendSuccess(res, result, {
      message: `${result.validCount} valid unique email address${result.validCount === 1 ? '' : 'es'} detected`,
    });
  } finally {
    await fs.unlink(req.file.path).catch(() => undefined);
  }
}

export async function schedule(req: Request, res: Response) {
  const body = req.body as ScheduleEmailsBody;
  const user = req.user!;

  const result = await scheduleEmails({
    userId: user.id,
    senderId: body.senderId,
    subject: body.subject,
    body: body.body,
    recipients: dedupeRecipients(body.recipients),
    startTime: body.startTime,
    // Falls back to the configured MIN_EMAIL_DELAY / MAX_EMAILS_PER_HOUR when
    // the client omits them - never a magic number duplicated in the schema.
    delayBetweenEmails: body.delayBetweenEmails ?? env.MIN_EMAIL_DELAY,
    hourlyLimit: body.hourlyLimit ?? env.MAX_EMAILS_PER_HOUR,
    userEmail: user.email,
    userName: user.name,
  });

  return sendSuccess(res, result, {
    status: 201,
    message: `${result.totalScheduled} email(s) scheduled`,
  });
}

function dedupeRecipients(recipients: string[]): string[] {
  return Array.from(new Set(recipients.map((r) => r.trim().toLowerCase())));
}

export async function listScheduled(req: Request, res: Response) {
  const { page, pageSize } = paginationSchema.parse(req.query);
  const result = await getScheduledEmails(req.user!.id, { page, pageSize });
  return sendSuccess(res, result);
}

export async function listSent(req: Request, res: Response) {
  const { page, pageSize } = paginationSchema.parse(req.query);
  const result = await getSentEmails(req.user!.id, { page, pageSize });
  return sendSuccess(res, result);
}

export async function search(req: Request, res: Response) {
  const query = req.query as unknown as z.infer<typeof searchEmailsQuerySchema>;
  const result = await searchEmails({
    userId: req.user!.id,
    query: query.q,
    status: query.status,
    page: query.page,
    pageSize: query.pageSize,
  });
  return sendSuccess(res, result);
}

export async function getById(req: Request, res: Response) {
  const email = await getEmailByIdForUser(req.params.id, req.user!.id);
  return sendSuccess(res, email);
}
