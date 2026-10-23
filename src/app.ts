import express, { type Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import path from 'node:path';
import fs from 'node:fs';
import { env } from './config/env.js';
import { requestLogger } from './common/middlewares/request-logger.middleware.js';
import { notFoundHandler } from './common/middlewares/not-found.middleware.js';
import { errorHandler } from './common/middlewares/error.middleware.js';
import { apiRouter } from './routes/index.js';
import { healthController } from './modules/health/health.controller.js';
import { openApiSpecification } from './docs/openapi/index.js';

export const createApp = (): Application => {
  const app = express();

  // 1. Security Headers with Swagger UI and SPA font/style/socket compatibility
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'ws:', 'wss:'],
        },
      },
    }),
  );

  // 2. CORS Configuration
  const allowedOrigins =
    env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',').map((origin) => origin.trim());

  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-request-id',
        'x-terminal-id',
        'x-client-platform',
        // Plane B (FARMAX-LAN-CLIENT-REQUEST-V1) — future LAN clients
        'X-Farmax-Terminal-Id',
        'X-Farmax-Timestamp',
        'X-Farmax-Nonce',
        'X-Farmax-Signature',
      ],
    }),
  );

  // 3. Request Parsers — capture exact raw body bytes for Plane B signature verification
  app.use(
    express.json({
      limit: '10mb',
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 4. Request Logging
  app.use(requestLogger);

  // 5. Root probe endpoint for container / load-balancer health checks
  app.get('/health', healthController.getHealth);

  // 6. OpenAPI Documentation UI & JSON spec
  app.get('/api/docs/json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(openApiSpecification);
  });

  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiSpecification, {
      customSiteTitle: 'FARMAX POS - API Documentation',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        docExpansion: 'none',
        filter: true,
      },
    }),
  );

  // 7. API v1 Routes
  app.use(env.API_PREFIX, apiRouter);

  // 8. Static Files & SPA Client Routing (Production Desktop / Web)
  const staticFilesPath = process.env.STATIC_FILES_PATH;
  if (staticFilesPath && fs.existsSync(staticFilesPath)) {
    const indexPath = path.resolve(staticFilesPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      app.use(express.static(staticFilesPath));

      // SPA fallback for non-API GET requests (supporting React BrowserRouter)
      app.get('*', (req, res, next) => {
        // Guard: Do not return index.html for API, docs, or health requests
        if (
          req.path.startsWith('/api') ||
          req.path.startsWith(env.API_PREFIX) ||
          req.path.startsWith('/health')
        ) {
          return next();
        }

        // Guard: If requesting a static file with an extension or /assets/ that was not found, return 404
        if (req.path.startsWith('/assets/') || path.extname(req.path)) {
          return next();
        }

        res.sendFile(indexPath);
      });
    }
  }

  // 9. 404 Not Found Handler
  app.use(notFoundHandler);

  // 10. Centralized Error Handler
  app.use(errorHandler);

  return app;
};

export const app = createApp();
