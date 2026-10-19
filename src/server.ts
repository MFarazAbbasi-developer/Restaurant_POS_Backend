import http from 'node:http';
import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { initSocket } from './config/socket.js';

const startServer = async (): Promise<void> => {
  try {
    // 1. Connect to PostgreSQL
    await connectDatabase();

    // 2. Create HTTP server instance
    const httpServer = http.createServer(app);

    // 3. Initialize Socket.IO
    initSocket(httpServer);

    // 4. Start listening (default HOST=127.0.0.1 — local-only for initial desktop release)
    const server = httpServer.listen(env.PORT, env.HOST, () => {
      logger.info(`🚀 FARMAX POS Backend started in [${env.NODE_ENV}] mode`);
      logger.info(`🌐 HTTP Server running on http://${env.HOST}:${env.PORT}`);
      logger.info(`🩺 Health Check endpoint: http://${env.HOST}:${env.PORT}/health`);
      logger.info(`📡 API v1 prefix: http://${env.HOST}:${env.PORT}${env.API_PREFIX}`);
    });

    // Graceful Shutdown Logic
    let isShuttingDown = false;

    const shutdown = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      logger.info(`🛑 Received ${signal}. Starting graceful shutdown...`);

      // Set timeout to force exit if closing takes too long
      const forceExitTimer = setTimeout(() => {
        logger.error('⚠️ Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
      forceExitTimer.unref();

      server.close(async () => {
        logger.info('🛑 HTTP server closed.');
        try {
          await disconnectDatabase();
          logger.info(' Graceful shutdown completed cleanly.');
          process.exit(0);
        } catch (err) {
          logger.error({ error: err }, '❌ Error during shutdown database disconnect');
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('uncaughtException', (error) => {
      logger.error({ error, stack: error.stack }, '💥 Uncaught Exception');
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      logger.error({ reason }, '💥 Unhandled Promise Rejection');
      shutdown('unhandledRejection');
    });
  } catch (error) {
    logger.fatal({ error }, '❌ Fatal error starting application');
    process.exit(1);
  }
};

startServer();
