import { Request, Response } from 'express';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { sendSuccess } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { prisma } from '../config/prisma';
import {
  buildSlackAuthUrl,
  exchangeSlackCode,
  generateSlackState,
  isSlackOAuthConfigured,
  revokeSlackToken,
} from '../integrations/slack/slackOAuth';

export async function status(req: Request, res: Response) {
  const connection = await prisma.slackConnection.findUnique({ where: { userId: req.user!.id } });
  return sendSuccess(res, {
    connected: Boolean(connection),
    teamName: connection?.teamName ?? null,
  });
}

export function connect(req: Request, res: Response) {
  if (!isSlackOAuthConfigured()) {
    throw new ApiError('UPSTREAM_ERROR', 'Slack OAuth is not configured on this server. Set SLACK_CLIENT_ID/SECRET.');
  }
  const state = generateSlackState();
  req.session!.slackOauthState = state;
  res.redirect(buildSlackAuthUrl(state));
}

export async function callback(req: Request, res: Response) {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
  const failureRedirect = `${env.FRONTEND_URL}/dashboard?slack_error=1`;

  if (error || !code) {
    logger.warn({ error }, 'Slack OAuth callback returned an error');
    return res.redirect(failureRedirect);
  }

  if (!state || state !== req.session?.slackOauthState) {
    logger.warn('Slack OAuth state mismatch - possible CSRF attempt');
    return res.redirect(failureRedirect);
  }
  req.session!.slackOauthState = undefined;

  const userId = req.session?.userId;
  if (!userId) {
    return res.redirect(`${env.FRONTEND_URL}/login?error=session_expired`);
  }

  try {
    const result = await exchangeSlackCode(code);
    await prisma.slackConnection.upsert({
      where: { userId },
      create: {
        userId,
        teamId: result.teamId,
        teamName: result.teamName,
        accessToken: result.accessToken,
        channelId: result.channelId,
        botUserId: result.botUserId,
      },
      update: {
        teamId: result.teamId,
        teamName: result.teamName,
        accessToken: result.accessToken,
        channelId: result.channelId,
        botUserId: result.botUserId,
      },
    });
    logger.info({ userId, teamId: result.teamId }, 'Slack connected');
    return res.redirect(`${env.FRONTEND_URL}/dashboard?slack_connected=1`);
  } catch (err) {
    logger.error({ err }, 'Slack OAuth callback failed');
    return res.redirect(failureRedirect);
  }
}

export async function disconnect(req: Request, res: Response) {
  const connection = await prisma.slackConnection.findUnique({ where: { userId: req.user!.id } });
  if (connection) {
    await revokeSlackToken(connection.accessToken);
    await prisma.slackConnection.delete({ where: { userId: req.user!.id } });
  }
  return sendSuccess(res, null, { message: 'Slack disconnected' });
}
