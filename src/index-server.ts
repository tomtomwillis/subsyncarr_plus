import { ProcessingEngine } from './processingEngine';
import { StateManager } from './stateManager';
import { ProcessingCoordinator } from './coordinator';
import { SubsyncarrPlusServer } from './server';
import { schedule } from 'node-cron';

async function main() {
  const dbPath = process.env.DB_PATH || '/app/data/subsyncarr-plus.db';
  const port = parseInt(process.env.WEB_PORT || '3000', 10);
  const host = process.env.WEB_HOST || '127.0.0.1';

  console.log(`[${new Date().toISOString()}] Initializing Subsyncarr Plus Server...`);

  const stateManager = new StateManager(dbPath);
  const engine = new ProcessingEngine();
  const coordinator = new ProcessingCoordinator(engine, stateManager);
  const server = new SubsyncarrPlusServer(coordinator, stateManager);

  // Start HTTP server
  server.start(port, host);

  // Setup cron scheduler for automatic runs
  const cronSchedule = process.env.CRON_SCHEDULE || '0 0 * * *';

  if (cronSchedule !== 'disabled') {
    schedule(cronSchedule, async () => {
      console.log(`[${new Date().toISOString()}] Starting scheduled run (${cronSchedule})`);
      try {
        await coordinator.startRun();
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Scheduled run failed:`, error);
      }
    });

    console.log(`[${new Date().toISOString()}] Scheduled runs: ${cronSchedule}`);
  } else {
    console.log(`[${new Date().toISOString()}] Automatic scheduling disabled`);
  }

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log(`[${new Date().toISOString()}] SIGTERM received, shutting down gracefully...`);
    server.close();
    stateManager.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
