import pino from 'pino';
import { env, isProduction } from './env';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.smtpPassword',
      '*.accessToken',
      '*.refreshToken',
      '*.token',
    ],
    censor: '[REDACTED]',
  },
});
