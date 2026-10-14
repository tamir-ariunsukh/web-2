import { createServer } from 'node:http';

import { loadEnv } from './env.js';
import { closeDatabase, getDatabase } from './db/connection.js';
import { migrate } from './db/migrate.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerBookingRoutes } from './routes/bookings.js';
import { registerFlightRoutes } from './routes/flights.js';
import { createLogger } from './logger.js';
import { resolveUser } from './http/auth-context.js';
import { Router, handler, notFound, parseCookies, sendJson } from './http/router.js';
import { serveStatic } from './http/static.js';
import { verifyAccessToken } from './lib/crypto.js';
import * as services from './services/index.js';
import { startMaintenance } from './services/expiry.js';

/**
 * Process entry point.
 *
 * The route table is assembled here so the set of public endpoints is reviewable
 * in one place. Everything under `/api/admin` is still behind the service-layer
 * role check; the router only decides what reaches a handler.
 */

export function buildRouter() {
  const router = new Router();

  router.get('/health/live', (req, res) => {
    sendJson(res, 200, { status: 'ok' });
  });

  router.get('/health/ready', (req, res) => {
    try {
      getDatabase().prepare('SELECT 1 AS ok').get();
      sendJson(res, 200, { status: 'ok', database: 'up' });
    } catch (error) {
      sendJson(res, 503, {
        status: 'degraded',
        database: 'down',
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  });

  registerAuthRoutes(router);
  registerFlightRoutes(router);
  registerBookingRoutes(router);
  registerAdminRoutes(router);

  return router;
}

export function createApp({ env = loadEnv(), logger = createLogger(env) } = {}) {
  const router = buildRouter();

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);

      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/health/')) {
        const match = router.match(req.method, url.pathname);
        if (!match) {
          notFound(res);
          return;
        }

        const context = {
          params: match.params,
          query: Object.fromEntries(url.searchParams),
          cookies: parseCookies(req.headers.cookie),
          user: undefined,
          requestId: req.headers['x-request-id'] ?? undefined,
          services,
          verifyAccessToken,
        };
        context.user = resolveUser(req, context);

        await handler(match.route.handler, { logger, isProduction: env.isProduction })(
          req,
          res,
          context,
        );
        return;
      }

      if (serveStatic(req, res)) return;
      notFound(res);
    } catch (error) {
      logger.error(error);
      if (!res.headersSent) sendJson(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
  });

  return { server, router, env, logger };
}

async function main() {
  const env = loadEnv();
  const logger = createLogger(env);

  // Applying the schema at boot keeps a fresh clone to a single command. It is
  // idempotent, so it costs one `CREATE TABLE IF NOT EXISTS` per start.
  migrate({ verbose: false });
  getDatabase();

  const { server } = createApp({ env, logger });

  const stopMaintenance = env.enableMaintenance
    ? startMaintenance({ logger: console })
    : () => {};

  server.listen(env.port, () => {
    logger.info(`listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`received ${signal}, shutting down`);

    stopMaintenance();
    server.close(() => {
      closeDatabase();
      process.exit(0);
    });

    // A request that never drains must not hold the process open forever.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => shutdown(signal));
  }

  process.on('unhandledRejection', (reason) => logger.error(reason));
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('index.js');
if (invokedDirectly) {
  main().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}
