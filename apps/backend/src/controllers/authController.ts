import { Request, Response } from 'express';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { sendSuccess } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  generateOAuthState,
  isGoogleOAuthConfigured,
} from '../integrations/google/googleOAuth';
import { findOrCreateUserFromGoogleProfile } from '../repositories/userRepository';

export function startGoogleAuth(req: Request, res: Response) {
  if (!isGoogleOAuthConfigured()) {
    throw new ApiError('UPSTREAM_ERROR', 'Google OAuth is not configured on this server. Set GOOGLE_CLIENT_ID/SECRET.');
  }
  const state = generateOAuthState();
  req.session!.oauthState = state;
  res.redirect(buildGoogleAuthUrl(state));
}

export async function googleCallback(req: Request, res: Response) {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };
  const failureRedirect = `${env.FRONTEND_URL}/login?error=google_auth_failed`;

  if (error || !code) {
    logger.warn({ error }, 'Google OAuth callback returned an error');
    return res.redirect(failureRedirect);
  }

  if (!state || state !== req.session?.oauthState) {
    logger.warn('Google OAuth state mismatch - possible CSRF attempt');
    return res.redirect(failureRedirect);
  }
  req.session!.oauthState = undefined;

  try {
    const profile = await exchangeGoogleCode(code);
    const user = await findOrCreateUserFromGoogleProfile(profile);
    req.session!.userId = user.id;
    logger.info({ userId: user.id }, 'User authenticated via Google OAuth');
    return res.redirect(`${env.FRONTEND_URL}/dashboard`);
  } catch (err) {
    logger.error({ err }, 'Google OAuth callback failed');
    return res.redirect(failureRedirect);
  }
}

export function me(req: Request, res: Response) {
  return sendSuccess(res, req.user);
}

export function logout(req: Request, res: Response) {
  req.session = null;
  return sendSuccess(res, null, { message: 'Logged out' });
}
