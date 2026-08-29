import { Email, EmailStatus } from '@prisma/client';
import { esClient, EMAILS_INDEX } from './client';
import { logger } from '../../config/logger';

export interface EmailSearchDoc {
  id: string;
  userId: string;
  senderId: string;
  campaignId: string;
  recipient: string;
  subject: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  createdAt: string;
}

function toDoc(email: Email): EmailSearchDoc {
  return {
    id: email.id,
    userId: email.userId,
    senderId: email.senderId,
    campaignId: email.campaignId,
    recipient: email.recipient,
    subject: email.subject,
    status: email.status,
    scheduledAt: email.scheduledAt.toISOString(),
    sentAt: email.sentAt ? email.sentAt.toISOString() : null,
    createdAt: email.createdAt.toISOString(),
  };
}

/**
 * Elasticsearch is a best-effort search/index layer, never the source of
 * truth. Any failure here is caught and logged by the caller so that email
 * scheduling/delivery is never blocked by an Elasticsearch outage - the
 * Postgres row is always written first and remains authoritative. A document
 * that fails to index here will simply be missing from search until the next
 * successful index/upsert for that email (e.g. its next status transition).
 */
export async function indexEmail(email: Email): Promise<void> {
  try {
    await esClient.index({
      index: EMAILS_INDEX,
      id: email.id,
      document: toDoc(email),
      refresh: false,
    });
  } catch (err) {
    logger.warn({ err, emailId: email.id }, 'Failed to index email in Elasticsearch');
  }
}

export async function searchEmails(params: {
  userId: string;
  query?: string;
  status?: EmailStatus;
  page: number;
  pageSize: number;
}): Promise<{ ids: string[]; total: number }> {
  const { userId, query, status, page, pageSize } = params;

  const filters: Record<string, unknown>[] = [{ term: { userId } }];
  if (status) filters.push({ term: { status } });

  const must: Record<string, unknown>[] = query
    ? [
        {
          multi_match: {
            query,
            fields: ['recipient', 'recipient.keyword^2', 'subject'],
            fuzziness: 'AUTO',
          },
        },
      ]
    : [{ match_all: {} }];

  const result = await esClient.search({
    index: EMAILS_INDEX,
    from: (page - 1) * pageSize,
    size: pageSize,
    sort: [{ createdAt: { order: 'desc' } }],
    query: {
      bool: { filter: filters, must },
    },
  });

  const total =
    typeof result.hits.total === 'number' ? result.hits.total : result.hits.total?.value ?? 0;

  return {
    ids: result.hits.hits.map((hit) => hit._id as string),
    total,
  };
}
