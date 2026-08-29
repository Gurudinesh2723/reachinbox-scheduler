import { z } from 'zod';

export const createSenderSchema = z.object({
  email: z.string().trim().email('A valid sender email is required').max(254),
  displayName: z.string().trim().min(1, 'Display name is required').max(100),
});

export type CreateSenderBody = z.infer<typeof createSenderSchema>;
