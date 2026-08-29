import { z } from 'zod';

export const scheduleEmailsSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required').max(200),
  body: z.string().trim().min(1, 'Body is required').max(50_000),
  recipients: z.array(z.string().email()).min(1, 'At least one valid recipient is required'),
  senderId: z.string().uuid().optional(),
  startTime: z.coerce.date().refine((d) => d.getTime() > Date.now() - 60_000, {
    message: 'startTime must not be in the past',
  }),
  delayBetweenEmails: z.coerce.number().int().min(0).max(3600).default(2),
  hourlyLimit: z.coerce.number().int().min(1).max(100_000).default(100),
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
