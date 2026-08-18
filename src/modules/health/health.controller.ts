import type { Request, Response, NextFunction } from 'express';
import { healthService } from './health.service.js';
import { ApiResponse } from '../../common/http/response.js';
import { HttpStatus } from '../../common/http/http-status.js';

export class HealthController {
  public getHealth = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const health = await healthService.getHealth();
      const statusCode =
        health.status === 'unhealthy' ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK;

      ApiResponse.success(res, {
        statusCode,
        message: 'Faraz POS Backend is operational',
        data: health,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const healthController = new HealthController();
