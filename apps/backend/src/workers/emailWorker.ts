import { DelayedError, Job, Worker } from 'bullmq';
import { createRedisConnection } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { prisma } from '../config/prisma';
import { EMAIL_QUEUE_NAME, EmailJobData } from '../queues/emailQueue';
import {
  claimEmailForProcessing,
  findEmailById,
  incrementAttempts,
  markEmailFailed,
  markEmailSent,
  releaseEmailToScheduled,
} from '../repositories/emailRepository';
import { getHourWindow, getNextHourWindowStart, reserveSendSlot } from '../services/rateLimiter';
import { sendEmail } from '../integrations/email/mailer';
import { indexEmail } from '../integrations/elasticsearch/emailIndex';
import { notifyRateLimitReached } from '../integrations/slack/slackNotifier';
import { sanitizeError } from '../utils/sanitizeError';

/**
 * Processes exactly one email per job. Idempotency lifecycle:
 *
 *   scheduled -> processing -> sent
 *                            -> failed (only after all BullMQ attempts exhausted)
 *
 * An email already `sent` is never re-sent (checked before, and re-checked via
 * the atomic DB claim). Rate-limit / min-delay hits reschedule the SAME
 * BullMQ job to a future timestamp via job.moveToDelayed + DelayedError -
 * they never fail the job and never drop the recipient.
 *
 * Honest limitation: if this process crashes after the SMTP provider accepts
 * the message but before markEmailSent() commits, BullMQ's stalled-job
 * recovery can redeliver the job and cause a duplicate send. This is an
 * inherent limitation of coordinating an at-least-once queue with a
 * non-transactional external side effect (SMTP) - it is not something any
 * amount of application-level locking can fully eliminate, only minimize.
 *
 * Exported separately from the BullMQ Worker wiring below so it can be
 * unit-tested with mocked repositories/integrations instead of requiring a
 * live Redis connection.
 */
export async function processEmailJob(job: Job<EmailJobData>, token: string): Promise<void> {
  const { emailId } = job.data;

  const email = await findEmailById(emailId);
  if (!email) {
    logger.warn({ emailId, jobId: job.id }, 'Email record no longer exists, dropping job');
    return;
  }

  if (email.status === 'sent') {
    logger.info({ emailId }, 'Email already sent - idempotent no-op');
    return;
  }
  if (email.status === 'failed') {
    logger.info({ emailId }, 'Email already permanently failed - idempotent no-op');
    return;
  }

  const claimed = await claimEmailForProcessing(emailId);
  if (!claimed) {
    logger.warn({ emailId }, 'Email could not be claimed (already being processed) - skipping');
    return;
  }

  const [sender, campaign] = await Promise.all([
    prisma.sender.findUnique({ where: { id: claimed.senderId } }),
    prisma.campaign.findUnique({ where: { id: claimed.campaignId } }),
  ]);

  if (!sender) {
    const updated = await markEmailFailed(emailId, 'Sender no longer exists');
    await indexEmail(updated);
    return;
  }

  const hourlyLimit = campaign?.hourlyLimit ?? env.MAX_EMAILS_PER_HOUR;
  const minEmailDelayMs = (campaign?.delayBetweenEmails ?? env.MIN_EMAIL_DELAY) * 1000;

  const slot = await reserveSendSlot({ senderId: sender.id, hourlyLimit, minEmailDelayMs });

  if (!slot.allowed) {
    if (slot.reason === 'rate_limited') {
      const nextWindow = getNextHourWindowStart();
      logger.warn(
        { emailId, senderId: sender.id, hourlyLimit, nextWindow },
        'Hourly rate limit reached, rescheduling to next hour window',
      );
      await releaseEmailToScheduled(emailId, nextWindow);
      await job.moveToDelayed(nextWindow.getTime(), token);
      await notifyRateLimitReached({
        userId: claimed.userId,
        senderEmail: sender.email,
        senderId: sender.id,
        hourlyLimit,
        hourWindow: getHourWindow(),
      });
      throw new DelayedError();
    }

    // min_delay: `info` is the ms-epoch timestamp this sender is next allowed to send.
    const retryAt = new Date(slot.info);
    logger.info({ emailId, senderId: sender.id, retryAt }, 'Minimum send delay not yet elapsed, deferring');
    await releaseEmailToScheduled(emailId, retryAt);
    await job.moveToDelayed(slot.info, token);
    throw new DelayedError();
  }

  try {
    const result = await sendEmail({
      from: `"${sender.displayName}" <${sender.email}>`,
      to: claimed.recipient,
      subject: claimed.subject,
      html: claimed.body,
    });

    const updated = await markEmailSent(emailId, result.providerMessageId);
    await indexEmail(updated);
    logger.info({ emailId, previewUrl: result.previewUrl }, 'Email sent via Ethereal');
  } catch (err) {
    await incrementAttempts(emailId);
    const attempts = job.opts.attempts ?? 3;
    const isFinalAttempt = job.attemptsMade + 1 >= attempts;

    if (isFinalAttempt) {
      const updated = await markEmailFailed(emailId, sanitizeError(err));
      await indexEmail(updated);
      logger.error({ emailId, err }, 'Email permanently failed after exhausting retries');
    } else {
      // Release back to `scheduled` so the row reflects reality while
      // BullMQ's own exponential backoff retries the same job.
      await releaseEmailToScheduled(emailId);
      logger.warn({ emailId, err, attempt: job.attemptsMade + 1 }, 'Send failed, will retry with backoff');
    }
    throw err;
  }
}

export function startEmailWorker(): Worker<EmailJobData> {
  const connection = createRedisConnection('email-worker');

  const worker = new Worker<EmailJobData>(
    EMAIL_QUEUE_NAME,
    (job, token) => processEmailJob(job, token as string),
    { connection, concurrency: env.WORKER_CONCURRENCY },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Job failed');
  });
  worker.on('error', (err) => {
    logger.error({ err }, 'Worker-level error');
  });

  return worker;
}
