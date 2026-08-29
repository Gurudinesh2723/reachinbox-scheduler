import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/redis';

export const EMAIL_QUEUE_NAME = 'email-scheduler';

export interface EmailJobData {
  emailId: string;
}

const connection = createRedisConnection('email-queue');

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { age: 60 * 60 * 24, count: 5_000 },
    removeOnFail: { age: 60 * 60 * 24 * 7 },
  },
});

/**
 * Job IDs are deterministic (derived from the Email row's primary key) so
 * that re-running the same scheduling call/retry can never create two BullMQ
 * jobs for the same email - BullMQ treats adding a job with an existing id as
 * a no-op, which is the first layer of idempotency in this system.
 *
 * BullMQ uses `:` as its own internal Redis-key delimiter and rejects a
 * custom job id containing one ("Custom Id cannot contain :"), so this uses
 * `-` instead of the `:` an earlier version used.
 */
export function emailJobId(emailId: string): string {
  return `email-${emailId}`;
}

export async function scheduleEmailJob(params: { emailId: string; runAt: Date }): Promise<string> {
  const delay = Math.max(0, params.runAt.getTime() - Date.now());
  const jobId = emailJobId(params.emailId);

  const job = await emailQueue.add(
    'send-email',
    { emailId: params.emailId },
    { jobId, delay },
  );

  return job.id as string;
}
