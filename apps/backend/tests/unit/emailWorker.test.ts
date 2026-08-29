import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DelayedError, Job } from 'bullmq';

vi.mock('../../src/repositories/emailRepository', () => ({
  findEmailById: vi.fn(),
  claimEmailForProcessing: vi.fn(),
  markEmailSent: vi.fn(),
  markEmailFailed: vi.fn(),
  releaseEmailToScheduled: vi.fn(),
  incrementAttempts: vi.fn(),
}));
vi.mock('../../src/config/prisma', () => ({
  prisma: {
    sender: { findUnique: vi.fn() },
    campaign: { findUnique: vi.fn() },
  },
}));
vi.mock('../../src/services/rateLimiter', () => ({
  reserveSendSlot: vi.fn(),
  getHourWindow: vi.fn(() => 123456),
  getNextHourWindowStart: vi.fn(() => new Date('2026-01-01T11:00:00.000Z')),
}));
vi.mock('../../src/integrations/email/mailer', () => ({
  sendEmail: vi.fn(),
}));
vi.mock('../../src/integrations/elasticsearch/emailIndex', () => ({
  indexEmail: vi.fn(),
}));
vi.mock('../../src/integrations/slack/slackNotifier', () => ({
  notifyRateLimitReached: vi.fn(),
}));

import * as emailRepository from '../../src/repositories/emailRepository';
import { prisma } from '../../src/config/prisma';
import * as rateLimiter from '../../src/services/rateLimiter';
import * as mailer from '../../src/integrations/email/mailer';
import { notifyRateLimitReached } from '../../src/integrations/slack/slackNotifier';
import { processEmailJob } from '../../src/workers/emailWorker';

function fakeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    data: { emailId: 'email-1' },
    opts: { attempts: 3 },
    attemptsMade: 0,
    moveToDelayed: vi.fn(),
    ...overrides,
  } as unknown as Job;
}

const baseEmail = {
  id: 'email-1',
  campaignId: 'campaign-1',
  userId: 'user-1',
  senderId: 'sender-1',
  recipient: 'bob@example.com',
  subject: 'Hi',
  body: '<p>Hi</p>',
  status: 'scheduled' as const,
};

const sender = { id: 'sender-1', email: 'alice@acme.com', displayName: 'Alice' };
const campaign = { id: 'campaign-1', hourlyLimit: 100, delayBetweenEmails: 2 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('processEmailJob idempotency', () => {
  it('does not send when the email is already sent', async () => {
    vi.mocked(emailRepository.findEmailById).mockResolvedValue({ ...baseEmail, status: 'sent' } as never);

    await processEmailJob(fakeJob(), 'token');

    expect(mailer.sendEmail).not.toHaveBeenCalled();
    expect(emailRepository.claimEmailForProcessing).not.toHaveBeenCalled();
  });

  it('does not send when the email is already permanently failed', async () => {
    vi.mocked(emailRepository.findEmailById).mockResolvedValue({ ...baseEmail, status: 'failed' } as never);

    await processEmailJob(fakeJob(), 'token');

    expect(mailer.sendEmail).not.toHaveBeenCalled();
  });

  it('does not send when the atomic claim fails (already being processed elsewhere)', async () => {
    vi.mocked(emailRepository.findEmailById).mockResolvedValue(baseEmail as never);
    vi.mocked(emailRepository.claimEmailForProcessing).mockResolvedValue(null);

    await processEmailJob(fakeJob(), 'token');

    expect(mailer.sendEmail).not.toHaveBeenCalled();
  });
});

describe('processEmailJob happy path', () => {
  it('sends the email and marks it sent with the provider message id', async () => {
    vi.mocked(emailRepository.findEmailById).mockResolvedValue(baseEmail as never);
    vi.mocked(emailRepository.claimEmailForProcessing).mockResolvedValue({ ...baseEmail, status: 'processing' } as never);
    vi.mocked(prisma.sender.findUnique).mockResolvedValue(sender as never);
    vi.mocked(prisma.campaign.findUnique).mockResolvedValue(campaign as never);
    vi.mocked(rateLimiter.reserveSendSlot).mockResolvedValue({ allowed: true, reason: 'ok', info: 1 });
    vi.mocked(mailer.sendEmail).mockResolvedValue({ providerMessageId: '<abc@ethereal>', previewUrl: 'https://ethereal.email/message/abc' });

    await processEmailJob(fakeJob(), 'token');

    expect(mailer.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'bob@example.com', subject: 'Hi' }),
    );
    expect(emailRepository.markEmailSent).toHaveBeenCalledWith('email-1', '<abc@ethereal>');
  });
});

describe('processEmailJob rate limiting', () => {
  it('reschedules to the next hour window without failing the job, and notifies Slack', async () => {
    vi.mocked(emailRepository.findEmailById).mockResolvedValue(baseEmail as never);
    vi.mocked(emailRepository.claimEmailForProcessing).mockResolvedValue({ ...baseEmail, status: 'processing' } as never);
    vi.mocked(prisma.sender.findUnique).mockResolvedValue(sender as never);
    vi.mocked(prisma.campaign.findUnique).mockResolvedValue(campaign as never);
    vi.mocked(rateLimiter.reserveSendSlot).mockResolvedValue({ allowed: false, reason: 'rate_limited', info: 100 });

    const job = fakeJob();
    await expect(processEmailJob(job, 'token')).rejects.toBeInstanceOf(DelayedError);

    expect(mailer.sendEmail).not.toHaveBeenCalled();
    expect(emailRepository.releaseEmailToScheduled).toHaveBeenCalledWith('email-1', expect.any(Date));
    expect(job.moveToDelayed).toHaveBeenCalledWith(new Date('2026-01-01T11:00:00.000Z').getTime(), 'token');
    expect(notifyRateLimitReached).toHaveBeenCalled();
  });

  it('defers (does not fail) when the minimum send delay has not elapsed', async () => {
    vi.mocked(emailRepository.findEmailById).mockResolvedValue(baseEmail as never);
    vi.mocked(emailRepository.claimEmailForProcessing).mockResolvedValue({ ...baseEmail, status: 'processing' } as never);
    vi.mocked(prisma.sender.findUnique).mockResolvedValue(sender as never);
    vi.mocked(prisma.campaign.findUnique).mockResolvedValue(campaign as never);
    const retryAt = Date.now() + 1500;
    vi.mocked(rateLimiter.reserveSendSlot).mockResolvedValue({ allowed: false, reason: 'min_delay', info: retryAt });

    const job = fakeJob();
    await expect(processEmailJob(job, 'token')).rejects.toBeInstanceOf(DelayedError);

    expect(mailer.sendEmail).not.toHaveBeenCalled();
    expect(job.moveToDelayed).toHaveBeenCalledWith(retryAt, 'token');
  });
});

describe('processEmailJob failure handling', () => {
  it('releases back to scheduled (for BullMQ retry) on a non-final attempt failure', async () => {
    vi.mocked(emailRepository.findEmailById).mockResolvedValue(baseEmail as never);
    vi.mocked(emailRepository.claimEmailForProcessing).mockResolvedValue({ ...baseEmail, status: 'processing' } as never);
    vi.mocked(prisma.sender.findUnique).mockResolvedValue(sender as never);
    vi.mocked(prisma.campaign.findUnique).mockResolvedValue(campaign as never);
    vi.mocked(rateLimiter.reserveSendSlot).mockResolvedValue({ allowed: true, reason: 'ok', info: 1 });
    vi.mocked(mailer.sendEmail).mockRejectedValue(new Error('SMTP timeout'));

    const job = fakeJob({ attemptsMade: 0, opts: { attempts: 3 } });
    await expect(processEmailJob(job, 'token')).rejects.toThrow('SMTP timeout');

    expect(emailRepository.releaseEmailToScheduled).toHaveBeenCalledWith('email-1');
    expect(emailRepository.markEmailFailed).not.toHaveBeenCalled();
  });

  it('marks the email permanently failed once attempts are exhausted', async () => {
    vi.mocked(emailRepository.findEmailById).mockResolvedValue(baseEmail as never);
    vi.mocked(emailRepository.claimEmailForProcessing).mockResolvedValue({ ...baseEmail, status: 'processing' } as never);
    vi.mocked(prisma.sender.findUnique).mockResolvedValue(sender as never);
    vi.mocked(prisma.campaign.findUnique).mockResolvedValue(campaign as never);
    vi.mocked(rateLimiter.reserveSendSlot).mockResolvedValue({ allowed: true, reason: 'ok', info: 1 });
    vi.mocked(mailer.sendEmail).mockRejectedValue(new Error('Invalid recipient'));

    const job = fakeJob({ attemptsMade: 2, opts: { attempts: 3 } });
    await expect(processEmailJob(job, 'token')).rejects.toThrow('Invalid recipient');

    expect(emailRepository.markEmailFailed).toHaveBeenCalledWith('email-1', 'Invalid recipient');
  });
});
