import axios from 'axios';
import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { logger } from '../../config/logger';

const SLACK_POST_MESSAGE_URL = 'https://slack.com/api/chat.postMessage';
const NOTIFY_DEDUPE_TTL_SECONDS = 60 * 60 * 2; // survive a full hour window plus margin

/**
 * Sends a real Slack notification when a sender hits its hourly rate limit.
 * Looks up the connection fresh on every call so a Slack connection made
 * after startup is picked up immediately, with no restart required.
 *
 * Silently no-ops (never throws) if Slack isn't connected, so email
 * processing is never blocked by notification delivery.
 */
export async function notifyRateLimitReached(params: {
  userId: string;
  senderEmail: string;
  senderId: string;
  hourlyLimit: number;
  hourWindow: number;
}): Promise<void> {
  const { userId, senderEmail, senderId, hourlyLimit, hourWindow } = params;

  const dedupeKey = `slack-rate-limit-notified:${senderId}:${hourWindow}`;
  const firstNotification = await redis.set(dedupeKey, '1', 'EX', NOTIFY_DEDUPE_TTL_SECONDS, 'NX');
  if (firstNotification === null) {
    return; // already notified for this sender/hour
  }

  const connection = await prisma.slackConnection.findUnique({ where: { userId } });
  if (!connection) {
    logger.info({ userId, senderId }, 'Rate limit reached but Slack is not connected, skipping notification');
    return;
  }

  const text = `:warning: Sender *${senderEmail}* reached the hourly email limit of ${hourlyLimit}. Remaining emails have been rescheduled to the next available hour window.`;

  try {
    const response = await axios.post(
      SLACK_POST_MESSAGE_URL,
      {
        channel: connection.channelId ?? connection.botUserId,
        text,
      },
      { headers: { Authorization: `Bearer ${connection.accessToken}` } },
    );

    if (!response.data.ok) {
      logger.warn({ slackError: response.data.error, userId }, 'Slack chat.postMessage returned an error');
    } else {
      logger.info({ userId, senderId, hourWindow }, 'Slack rate-limit notification sent');
    }
  } catch (err) {
    logger.error({ err, userId, senderId }, 'Failed to send Slack rate-limit notification');
  }
}
