import pino from 'pino';

import { startWorkers } from './index.js';

/**
 * Worker process entry point. Starts the queues and shuts down cleanly so an
 * in-flight sweep finishes before the process exits.
 */
const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'worker' },
});

function main(): void {
  const workers = startWorkers();

  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'shutting down workers');

    const forceExit = setTimeout(() => {
      logger.error('graceful shutdown timed out, exiting');
      process.exit(1);
    }, 15_000);
    forceExit.unref();

    void workers
      .close()
      .then(() => {
        clearTimeout(forceExit);
        logger.info('shutdown complete');
        process.exit(0);
      })
      .catch((error: unknown) => {
        logger.error({ err: error }, 'error during shutdown');
        process.exit(1);
      });
  };

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      shutdown(signal);
    });
  }

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandled promise rejection');
  });
}

try {
  main();
} catch (error) {
  console.error('Failed to start worker:', error);
  process.exit(1);
}
