import type { Request, Response, NextFunction } from 'express';
import { SetupService } from './setup.service.js';
import { ApiResponse } from '../../common/http/response.js';
import { HttpStatus } from '../../common/http/http-status.js';

export class SetupController {
  /**
   * GET /api/v1/setup/status
   */
  public static async getStatus(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = await SetupService.getStatus();

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: status.setupRequired
          ? 'Initial setup is required'
          : 'Initial setup is already complete',
        data: status,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/setup
   */
  public static async completeSetup(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const clientIp = req.ip || req.socket.remoteAddress;
      const result = await SetupService.completeSetup(req.body, clientIp);

      ApiResponse.success(res, {
        statusCode: HttpStatus.CREATED,
        message: 'Initial setup completed successfully. You can now sign in.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
