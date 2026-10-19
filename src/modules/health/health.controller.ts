import type { Request, Response, NextFunction } from 'express';
import { healthService } from './health.service.js';
import { ApiResponse } from '../../common/http/response.js';
import { HttpStatus } from '../../common/http/http-status.js';

export class HealthController {
  public getHealth = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const health = await healthService.getHealth();
      const isReady = health.status === 'healthy';
      const statusCode = isReady ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;

      ApiResponse.success(res, {
        statusCode,
        message: isReady
          ? 'Faraz POS Backend is operational'
          : 'Faraz POS Backend is not ready (database unavailable)',
        data: health,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const healthController = new HealthController();
