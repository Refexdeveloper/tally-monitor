import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { sequelize } from './models';
import { startQueueWorker, stopQueueWorker } from './worker/queueWorker';

async function main() {
  try {
    await sequelize.authenticate();
    logger.info('Connected to MySQL', { database: env.DB_NAME });
  } catch (err) {
    // Keep serving so health endpoints and the UI can report the outage instead of crash-looping.
    logger.error('MySQL connection failed at startup; API will report the database as DOWN', { error: (err as Error).message });
  }

  const server = createApp().listen(env.PORT, () => {
    logger.info(`Tally Monitor listening on http://localhost:${env.PORT}`, { env: env.NODE_ENV });
    startQueueWorker();
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    void stopQueueWorker();
    server.close(async () => {
      await sequelize.close().catch(() => undefined);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { error: reason instanceof Error ? reason.message : String(reason) });
});

void main();
