import { prisma } from '@repo/db';

import { createApp } from './app.js';
import { loadEnv } from './env.js';
import { createLogger } from './logger.js';

/**
 * Process entry point. Binds the HTTP listener and wires graceful shutdown so an
 * in-flight booking transaction finishes before the process exits.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env);

  const { app, apollo } = await createApp({ env, logger });

  const server = app.listen(env.API_PORT, () => {
    logger.info({ port: env.API_PORT, env: env.NODE_ENV }, 'api listening');
  });

  // Slightly above the typical load-balancer drain timeout so in-flight requests
  // are not cut off while Kubernetes removes the pod from rotation.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;

  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'shutting down');

    const forceExit = setTimeout(() => {
      logger.error('graceful shutdown timed out, exiting');
      process.exit(1);
    }, 15_000);
    forceExit.unref();

    server.close(() => {
      logger.info('http server closed');
    });

    try {
      await apollo.stop();
      await prisma.$disconnect();
      clearTimeout(forceExit);
      logger.info('shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'error during shutdown');
      process.exit(1);
    }
  };

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandled promise rejection');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'uncaught exception, exiting');
    void shutdown('uncaughtException');
  });
}

main().catch((error: unknown) => {
  // The logger may not exist yet if env parsing failed, so write to stderr.
  console.error('Failed to start API:', error);
  process.exit(1);
});
