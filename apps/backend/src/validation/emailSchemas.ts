import { z } from 'zod';

export const scheduleEmailsSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required').max(200),
  body: z.string().trim().min(1, 'Body is required').max(50_000),
  recipients: z.array(z.string().email()).min(1, 'At least one valid recipient is required'),
  senderId: z.string().uuid().optional(),
  startTime: z.coerce.date().refine((d) => d.getTime() > Date.now() - 60_000, {
    message: 'startTime must not be in the past',
  }),
  // No .default() here on purpose: the configured defaults come from
  // MIN_EMAIL_DELAY / MAX_EMAILS_PER_HOUR (see config/env.ts), applied in
  // emailController.schedule(), so there is exactly one place that owns the
  // "no hardcoded limits" default rather than duplicating a magic number in
  // both the validation schema and the frontend.
  delayBetweenEmails: z.coerce.number().int().min(0).max(3600).optional(),
  hourlyLimit: z.coerce.number().int().min(1).max(100_000).optional(),
});

export type ScheduleEmailsBody = z.infer<typeof scheduleEmailsSchema>;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const searchEmailsQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(200).optional(),
  status: z.enum(['scheduled', 'processing', 'sent', 'failed']).optional(),
});

export const emailIdParamSchema = z.object({
  id: z.string().uuid(),
});
