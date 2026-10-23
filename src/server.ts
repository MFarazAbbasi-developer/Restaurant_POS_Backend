import http from 'node:http';
import type { Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { initSocket } from './config/socket.js';
import {
  bootstrapLicensingAndLanRuntime,
  stopEntitlementRefreshLoop,
} from './modules/lan/licensing-lifecycle.js';
import { TlsCertificateService } from './modules/lan/tls/tls-certificate.service.js';
import {
  assertLoopbackHost,
  isLoopbackBindAddress,
  startLoopbackHttpsServer,
} from './modules/lan/tls/https-server.js';
import { isRemoteLanPairingEnabled } from './modules/lan/lan-pairing-gate.js';

const startServer = async (): Promise<void> => {
  try {
    // 1. Connect to PostgreSQL (authoritative restaurant identity lives here after setup)
    await connectDatabase();

    // 1b. Licensing / LAN runtime (Phase 2D.5)
    try {
      const lanRuntime = await bootstrapLicensingAndLanRuntime();
      logger.info(
        {
          setupComplete: lanRuntime.setupComplete,
          lanEnabled: lanRuntime.lanEnabled,
          hostActivated: lanRuntime.hostActivated,
          disabledReason: lanRuntime.disabledReason,
          restaurantBound: Boolean(lanRuntime.restaurantId),
        },
        'Licensing/LAN runtime bootstrap complete',
      );
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Licensing/LAN bootstrap error; local POS continues with LAN disabled',
      );
    }

    // 1c. Host TLS credential (Phase 2D.6) — separate from Ed25519 licensing identity.
    // Failures here do not block local HTTP POS; HTTPS simply does not start.
    let tlsReady = false;
    try {
      const tlsSnap = TlsCertificateService.ensureCertificate();
      tlsReady = true;
      logger.info(
        {
          fingerprintPrefix: tlsSnap.fingerprintSha256Hex.slice(0, 12),
          notAfter: tlsSnap.notAfter,
          pairingEnabled: isRemoteLanPairingEnabled(),
        },
        'Host TLS certificate ready (loopback HTTPS only; remote pairing still disabled)',
      );
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Host TLS certificate not available; continuing with local HTTP only',
      );
    }

    // 2. Local HTTP server — preserved for Electron / single-terminal desktop UI.
    // Must remain loopback; never a remote plaintext fallback for LAN clients.
    assertLoopbackHost(env.HOST);
    const httpServer: HttpServer = http.createServer(app);

    // 3. Initialize Socket.IO on the local HTTP server
    initSocket(httpServer);

    let httpsServer: HttpsServer | null = null;

    // 4. Start local HTTP listener
    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(env.PORT, env.HOST, () => {
        logger.info(`🚀 FARMAX POS Backend started in [${env.NODE_ENV}] mode`);
        logger.info(`🌐 HTTP Server running on http://${env.HOST}:${env.PORT}`);
        logger.info(`🩺 Health Check endpoint: http://${env.HOST}:${env.PORT}/health`);
        logger.info(`📡 API v1 prefix: http://${env.HOST}:${env.PORT}${env.API_PREFIX}`);
        resolve();
      });
    });

    // 5. Loopback HTTPS when cert is valid — never non-loopback in this phase.
    if (tlsReady && env.LAN_HTTPS_ENABLED !== false) {
      const httpsPort = env.HTTPS_PORT ?? env.PORT + 1;
      if (!isLoopbackBindAddress(env.HOST)) {
        logger.warn('Skipping HTTPS: HOST is not loopback');
      } else {
        try {
          const listened = await startLoopbackHttpsServer({
            app,
            host: env.HOST,
            port: httpsPort,
          });
          httpsServer = listened.server;
          logger.info(
            `🔒 HTTPS (loopback) on https://${listened.host}:${listened.port} fingerprint=${listened.fingerprintSha256Hex.slice(0, 12)}…`,
          );
        } catch (err) {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err) },
            'HTTPS listener failed to start; local HTTP POS continues',
          );
        }
      }
    }

    // Graceful Shutdown Logic
    let isShuttingDown = false;

    const shutdown = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      logger.info(`🛑 Received ${signal}. Starting graceful shutdown...`);

      const forceExitTimer = setTimeout(() => {
        logger.error('⚠️ Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
      forceExitTimer.unref();

      const closeServer = (server: HttpServer | HttpsServer) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        });

      try {
        if (httpsServer) await closeServer(httpsServer);
        await closeServer(httpServer);
        logger.info('🛑 HTTP(S) servers closed.');
        stopEntitlementRefreshLoop();
        await disconnectDatabase();
        logger.info(' Graceful shutdown completed cleanly.');
        process.exit(0);
      } catch (err) {
        logger.error({ error: err }, '❌ Error during shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));

    process.on('uncaughtException', (error) => {
      logger.error({ error, stack: error.stack }, '💥 Uncaught Exception');
      void shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      logger.error({ reason }, '💥 Unhandled Promise Rejection');
      void shutdown('unhandledRejection');
    });
  } catch (error) {
    logger.fatal({ error }, '❌ Fatal error starting application');
    process.exit(1);
  }
};

startServer();
