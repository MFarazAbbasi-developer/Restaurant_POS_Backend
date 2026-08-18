import type { Request, Response } from 'express';
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';
import { logger } from '../../config/logger.js';

export const requestLogger = pinoHttp({
  logger,
  genReqId: (req: Request) => {
    const existingId = req.headers['x-request-id'];
    if (existingId && typeof existingId === 'string') {
      return existingId;
    }
    return randomUUID();
  },
  customLogLevel: (_req: Request, res: Response, err?: Error) => {
    if (res.statusCode >= 500 || err) {
      return 'error';
    }
    if (res.statusCode >= 400) {
      return 'warn';
    }
    return 'info';
  },
  customSuccessMessage: (req: Request, res: Response) => {
    return `${req.method} ${req.url} completed with status ${res.statusCode}`;
  },
  customErrorMessage: (req: Request, res: Response, error: Error) => {
    return `${req.method} ${req.url} failed with status ${res.statusCode}: ${error.message}`;
  },
  autoLogging: {
    ignore: (req: Request) => {
      // Don't flood logs with routine /health pings unless in debug mode
      return req.url === '/health' && logger.level !== 'debug' && logger.level !== 'trace';
    },
  },
});
