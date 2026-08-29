import { Client } from '@elastic/elasticsearch';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

export const esClient = new Client({ node: env.ELASTICSEARCH_URL });

export const EMAILS_INDEX = 'emails';

export async function ensureEmailsIndex(): Promise<void> {
  try {
    const exists = await esClient.indices.exists({ index: EMAILS_INDEX });
    if (exists) return;

    await esClient.indices.create({
      index: EMAILS_INDEX,
      mappings: {
        properties: {
          id: { type: 'keyword' },
          userId: { type: 'keyword' },
          senderId: { type: 'keyword' },
          campaignId: { type: 'keyword' },
          recipient: {
            type: 'text',
            fields: { keyword: { type: 'keyword' } },
          },
          subject: { type: 'text' },
          status: { type: 'keyword' },
          scheduledAt: { type: 'date' },
          sentAt: { type: 'date' },
          createdAt: { type: 'date' },
        },
      },
    });
    logger.info({ index: EMAILS_INDEX }, 'Elasticsearch index created');
  } catch (err) {
    logger.error({ err }, 'Failed to ensure Elasticsearch index exists (search will be degraded until ES is reachable)');
  }
}
