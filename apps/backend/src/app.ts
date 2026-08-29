import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieSession from 'cookie-session';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import { env, isProduction } from './config/env';
import { logger } from './config/logger';
import apiRoutes from './routes';
import adminRoutes from './routes/adminRoutes';
import docsRoutes from './routes/docsRoutes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    }),
  );
  app.use(pinoHttp({ logger, autoLogging: !isProductionQuiet() }));
  app.use(express.json({ limit: '1mb' }));
  app.use(
    cookieSession({
      name: 'session',
      keys: [env.SESSION_SECRET],
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
    }),
  );

  // General API rate limiting to protect against abuse, separate from the
  // application-level per-sender email rate limiting implemented in the
  // scheduler/worker.
  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  app.use('/api', apiRoutes);
  app.use('/admin/queues', adminRoutes);
  app.use('/api-docs', docsRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

function isProductionQuiet() {
  return process.env.NODE_ENV === 'test';
}
