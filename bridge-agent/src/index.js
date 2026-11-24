import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createAgent } from './agent.js';

let cfg;
try {
  cfg = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(2);
}

const log = createLogger({ dir: cfg.logDir, level: cfg.logLevel, retentionDays: cfg.logRetentionDays });
const agent = createAgent(cfg, log);

const shutdown = async (signal) => {
  log.info(`Received ${signal}`);
  await agent.stop();
  log.close();
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGBREAK', () => shutdown('SIGBREAK'));
process.on('unhandledRejection', (err) => log.error('Unhandled rejection', { error: err?.message ?? String(err) }));

agent.start().catch((err) => {
  log.error(`Agent stopped: ${err.message}`);
  log.close();
  process.exit(1);
});
