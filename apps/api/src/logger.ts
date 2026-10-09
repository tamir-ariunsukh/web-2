import pino, { type Logger, type LoggerOptions } from 'pino';

import type { Env } from './env.js';

/**
 * Structured logging. Every log line carries `service`, and request-scoped logs
 * additionally carry `requestId`, `userId` and `pnr` so a booking can be traced
 * end to end.
 */

/** Keys whose values must never reach a log sink. */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'passportNumber',
  'passportNumberEnc',
  '*.password',
  '*.token',
  '*.passportNumber',
  '*.passportNumberEnc',
];

export function createLogger(env: Env): Logger {
  const options: LoggerOptions = {
    level: env.LOG_LEVEL,
    base: { service: 'api', env: env.NODE_ENV },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  };

  if (env.NODE_ENV === 'development') {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname,service,env',
        },
      },
    });
  }

  return pino(options);
}

export type { Logger };

/** Creates a child logger bound to a request or job context. */
export function withContext(
  logger: Logger,
  context: Record<string, string | number | undefined>,
): Logger {
  const bound: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(context)) {
    if (value !== undefined) {
      bound[key] = value;
    }
  }
  return logger.child(bound);
}
