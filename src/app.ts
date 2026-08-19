import express, { type Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { requestLogger } from './common/middlewares/request-logger.middleware.js';
import { notFoundHandler } from './common/middlewares/not-found.middleware.js';
import { errorHandler } from './common/middlewares/error.middleware.js';
import { apiRouter } from './routes/index.js';
import { healthController } from './modules/health/health.controller.js';
import { openApiSpecification } from './docs/openapi/index.js';

export const createApp = (): Application => {
  const app = express();

  // 1. Security Headers with Swagger UI compatibility
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
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
      allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
    }),
  );

  // 3. Request Parsers
  app.use(express.json({ limit: '10mb' }));
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
      customSiteTitle: 'Faraz POS - API Documentation',
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

  // 7. 404 Not Found Handler
  app.use(notFoundHandler);

  // 8. Centralized Error Handler
  app.use(errorHandler);

  return app;
};

export const app = createApp();
