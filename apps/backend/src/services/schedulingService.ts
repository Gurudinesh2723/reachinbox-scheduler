import { prisma } from '../config/prisma';
import { logger } from '../config/logger';
import { calculateScheduleTimes } from './scheduleCalculator';
import { attachBullJobId, createEmails } from '../repositories/emailRepository';
import { createCampaign } from '../repositories/campaignRepository';
import { scheduleEmailJob } from '../queues/emailQueue';
import { getOrCreateDefaultSender } from '../repositories/senderRepository';
import { indexEmail } from '../integrations/elasticsearch/emailIndex';
import { ApiError } from '../utils/ApiError';

export interface ScheduleEmailsInput {
  userId: string;
  senderId?: string;
  subject: string;
  body: string;
  recipients: string[];
  startTime: Date;
  delayBetweenEmails: number;
  hourlyLimit: number;
  userEmail: string;
  userName: string;
}

export interface ScheduleEmailsResult {
  campaignId: string;
  totalScheduled: number;
  firstScheduledAt: Date;
  lastScheduledAt: Date;
}

/**
 * Orchestrates the full schedule flow: creates one Campaign row, one Email
 * row per recipient (never a single bulk job), and one deterministic BullMQ
 * delayed job per email. Postgres is written first inside a transaction and
 * is authoritative; BullMQ jobs are added afterwards using the email's own
 * id as the job id, so this call is safe to retry - re-adding a job with an
 * id BullMQ already has is a no-op, and any email that ends up without a job
 * (e.g. a Redis blip) is picked up by reconcileOrphanedEmailJobs() on the
 * next worker/server startup instead of being silently lost.
 */
export async function scheduleEmails(input: ScheduleEmailsInput): Promise<ScheduleEmailsResult> {
  if (input.recipients.length === 0) {
    throw ApiError.validation('At least one valid recipient email address is required');
  }

  const sender = input.senderId
    ? await prisma.sender.findFirst({ where: { id: input.senderId, userId: input.userId } })
    : await getOrCreateDefaultSender(input.userId, input.userEmail, input.userName);

  if (!sender) {
    throw ApiError.validation('Sender not found for this user');
  }

  const scheduledTimes = calculateScheduleTimes({
    startTime: input.startTime,
    count: input.recipients.length,
    delayBetweenEmailsSeconds: input.delayBetweenEmails,
    hourlyLimit: input.hourlyLimit,
  });

  const campaign = await createCampaign({
    userId: input.userId,
    senderId: sender.id,
    subject: input.subject,
    body: input.body,
    startTime: input.startTime,
    delayBetweenEmails: input.delayBetweenEmails,
    hourlyLimit: input.hourlyLimit,
  });

  const emails = await createEmails(
    input.recipients.map((recipient, i) => ({
      campaignId: campaign.id,
      userId: input.userId,
      senderId: sender.id,
      recipient,
      subject: input.subject,
      body: input.body,
      scheduledAt: scheduledTimes[i],
    })),
  );

  for (const email of emails) {
    const jobId = await scheduleEmailJob({ emailId: email.id, runAt: email.scheduledAt });
    await attachBullJobId(email.id, jobId);
    await indexEmail({ ...email, bullJobId: jobId });
  }

  logger.info(
    { campaignId: campaign.id, count: emails.length, senderId: sender.id },
    'Campaign scheduled',
  );

  return {
    campaignId: campaign.id,
    totalScheduled: emails.length,
    firstScheduledAt: scheduledTimes[0],
    lastScheduledAt: scheduledTimes[scheduledTimes.length - 1],
  };
}

/**
 * Startup safety net: finds any `scheduled` email that never received a
 * BullMQ job id (e.g. the process crashed between the DB write and the
 * queue.add call) and enqueues it. Deterministic job ids make this safe to
 * run repeatedly / on every boot.
 */
export async function reconcileOrphanedEmailJobs(): Promise<number> {
  const orphaned = await prisma.email.findMany({
    where: { status: 'scheduled', bullJobId: null },
  });

  for (const email of orphaned) {
    const jobId = await scheduleEmailJob({ emailId: email.id, runAt: email.scheduledAt });
    await attachBullJobId(email.id, jobId);
  }

  if (orphaned.length > 0) {
    logger.warn({ count: orphaned.length }, 'Reconciled orphaned email jobs on startup');
  }

  return orphaned.length;
}
