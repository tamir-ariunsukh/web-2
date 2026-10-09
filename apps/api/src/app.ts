import { randomUUID } from 'node:crypto';

import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import { prisma, type PrismaClient } from '@repo/db';
import { ERROR_HTTP_STATUS, ErrorCode, isCorsairError } from '@repo/shared';
import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import depthLimit from 'graphql-depth-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';


import { loadEnv, type Env } from './env.js';
import { buildSchema } from './graphql/schema.js';
import { createLogger, type Logger } from './logger.js';
import { verifyAccessToken } from './modules/auth/crypto.js';
import { createLoaders } from './modules/loaders.js';

import type { AuthUser, GraphQLContext } from './modules/context.js';

export interface AppDependencies {
  readonly env?: Env;
  readonly prismaClient?: PrismaClient;
  readonly logger?: Logger;
}

export interface BuiltApp {
  readonly app: Express;
  readonly apollo: ApolloServer<GraphQLContext>;
  readonly env: Env;
  readonly logger: Logger;
}

/**
 * Builds the Express + GraphQL application. Kept separate from the listener so
 * tests can mount it with `supertest` without binding a port.
 */
export async function createApp(dependencies: AppDependencies = {}): Promise<BuiltApp> {
  const env = dependencies.env ?? loadEnv();
  const logger = dependencies.logger ?? createLogger(env);
  const db = dependencies.prismaClient ?? prisma;

  const app = express();

  // Behind a load balancer the client IP arrives in X-Forwarded-For; the rate
  // limiter and audit log both need the real address.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      ...(env.NODE_ENV === 'production' ? {} : { contentSecurityPolicy: false }),
      crossOriginEmbedderPolicy: false,
    }),
  );

  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true,
      maxAge: 86_400,
    }),
  );

  app.use(express.json({ limit: '256kb' }));

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => {
        const header = req.headers['x-request-id'];
        return typeof header === 'string' && header.length > 0 ? header : randomUUID();
      },
      customLogLevel: (_req, res, error) => {
        if (error || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );

  const apollo = new ApolloServer<GraphQLContext>({
    schema: buildSchema(),
    introspection: env.GRAPHQL_INTROSPECTION,
    // Stack traces expose internal paths and are never useful to a client in
    // production; local development keeps them for debugging.
    includeStacktraceInErrorResponses: env.NODE_ENV !== 'production',
    validationRules: [depthLimit(env.GRAPHQL_MAX_DEPTH)],
    formatError: (formatted) => {
      const original = formatted.extensions?.originalError;

      if (isCorsairError(original)) {
        return {
          ...formatted,
          message: original.message,
          extensions: {
            code: original.code,
            // Field-level detail is safe to expose only for client-facing errors.
            ...(original.expose && original.details ? { details: original.details } : {}),
          },
        };
      }

      // Unrecognised errors are logged in full and redacted for the client.
      // Domain codes and GraphQL's own validation codes are already classified
      // and their messages carry no internal detail.
      const reportedCode = formatted.extensions?.code;
      if (
        typeof reportedCode === 'string' &&
        (isDomainErrorCode(reportedCode) || reportedCode.startsWith('GRAPHQL_'))
      ) {
        return formatted;
      }

      logger.error({ err: original, path: formatted.path }, 'unhandled GraphQL error');

      return {
        ...formatted,
        message: env.NODE_ENV === 'production' ? 'Internal server error' : formatted.message,
        extensions: { code: ErrorCode.INTERNAL_ERROR },
      };
    },
  });

  await apollo.start();

  app.use(
    '/graphql',
    expressMiddleware(apollo, {
      context: async ({ req }): Promise<GraphQLContext> => {
        const requestId = normaliseRequestId(req.id);
        const requestLogger = logger.child({ requestId });

        return {
          prisma: db,
          logger: requestLogger,
          env,
          requestId,
          user: await resolveUser(req, env, requestLogger),
          loaders: createLoaders(db, requestLogger),
          isTest: env.NODE_ENV === 'test',
        };
      },
    }),
  );

  registerHealthRoutes(app, db);

  registerErrorHandler(app, logger, env);

  return { app, apollo, env, logger };
}

/**
 * True when a code belongs to the domain taxonomy, which means the resolver
 * classified the failure and its message is already safe to expose.
 */
function isDomainErrorCode(code: string): boolean {
  return Object.hasOwn(ERROR_HTTP_STATUS, code);
}

/**
 * Coerces the request id set by `pino-http` into a string.
 *
 * `genReqId` always returns a UUID here, but pino types the field loosely, so the
 * value is narrowed rather than stringified blindly.
 */
function normaliseRequestId(id: unknown): string {
  if (typeof id === 'string') return id;
  if (typeof id === 'number') return id.toString();
  return randomUUID();
}

/**
 * Resolves the caller from the `Authorization` header.
 *
 * A malformed or expired token is treated as anonymous rather than an error, so
 * a stale token in a browser tab does not break public queries such as search.
 */
async function resolveUser(
  req: Request,
  env: Env,
  logger: Logger,
): Promise<AuthUser | undefined> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return undefined;

  const token = header.slice('Bearer '.length).trim();
  if (token.length === 0) return undefined;

  try {
    const { claims } = await verifyAccessToken(token, env.JWT_ACCESS_SECRET);
    return { id: claims.sub, email: claims.email, role: claims.role };
  } catch (error) {
    logger.debug({ err: error }, 'rejected access token');
    return undefined;
  }
}

function registerHealthRoutes(app: Express, db: PrismaClient): void {
  app.get('/health/live', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/health/ready', async (_req: Request, res: Response) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.status(200).json({ status: 'ok', database: 'up' });
    } catch (error) {
      res.status(503).json({
        status: 'degraded',
        database: 'down',
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  });
}

function registerErrorHandler(app: Express, logger: Logger, env: Env): void {
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: { code: ErrorCode.NOT_FOUND, message: 'Route not found' } });
  });

  app.use((error: unknown, req: Request, res: Response, _next: unknown) => {
    if (isCorsairError(error)) {
      res.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
          details: error.expose && error.details ? error.details : undefined,
        },
      });
      return;
    }

    logger.error({ err: error, requestId: req.id }, 'unhandled REST error');
    res.status(500).json({
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: env.NODE_ENV === 'production' ? 'Internal server error' : String(error),
      },
    });
  });
}
