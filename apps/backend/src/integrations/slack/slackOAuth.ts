import axios from 'axios';
import crypto from 'crypto';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

const SLACK_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
const SLACK_OAUTH_ACCESS_URL = 'https://slack.com/api/oauth.v2.access';
const SLACK_REVOKE_URL = 'https://slack.com/api/auth.revoke';

// incoming-webhook lets the connecting user pick which channel notifications
// land in; chat:write lets the bot post directly once a channel is known.
const SLACK_SCOPES = 'chat:write,incoming-webhook';

export function isSlackOAuthConfigured(): boolean {
  return Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET);
}

export function generateSlackState(): string {
  return crypto.randomBytes(24).toString('hex');
}

export function buildSlackAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    scope: SLACK_SCOPES,
    redirect_uri: env.SLACK_REDIRECT_URI,
    state,
  });
  return `${SLACK_AUTHORIZE_URL}?${params.toString()}`;
}

export interface SlackOAuthResult {
  accessToken: string;
  teamId: string;
  teamName: string;
  channelId?: string;
  botUserId?: string;
}

export async function exchangeSlackCode(code: string): Promise<SlackOAuthResult> {
  const response = await axios.post(
    SLACK_OAUTH_ACCESS_URL,
    new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri: env.SLACK_REDIRECT_URI,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  );

  const data = response.data;
  if (!data.ok) {
    logger.error({ slackError: data.error }, 'Slack OAuth exchange failed');
    throw new Error(`Slack OAuth exchange failed: ${data.error}`);
  }

  return {
    accessToken: data.access_token,
    teamId: data.team?.id,
    teamName: data.team?.name,
    channelId: data.incoming_webhook?.channel_id,
    botUserId: data.bot_user_id,
  };
}

export async function revokeSlackToken(accessToken: string): Promise<void> {
  try {
    await axios.post(
      SLACK_REVOKE_URL,
      {},
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
  } catch (err) {
    logger.warn({ err }, 'Slack token revoke call failed (continuing with local disconnect)');
  }
}
