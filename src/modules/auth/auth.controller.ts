import type { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service.js';
import { ApiResponse } from '../../common/http/response.js';
import { HttpStatus } from '../../common/http/http-status.js';
import { UnauthorizedError } from '../../common/errors/app-error.js';

export class AuthController {
  /**
   * POST /api/v1/auth/login
   */
  public static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const clientIp = req.ip || req.socket.remoteAddress;
      const result = await AuthService.login(req.body, clientIp);

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Login successful',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/refresh
   */
  public static async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const clientIp = req.ip || req.socket.remoteAddress;
      const { refreshToken } = req.body;
      const result = await AuthService.refresh(refreshToken, clientIp);

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Tokens refreshed successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/logout
   */
  public static async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication is required');
      }

      const clientIp = req.ip || req.socket.remoteAddress;
      await AuthService.logout(req.user, req.body.refreshToken, clientIp);

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/auth/logout-all
   */
  public static async logoutAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication is required');
      }

      const clientIp = req.ip || req.socket.remoteAddress;
      const result = await AuthService.logoutAll(req.user, clientIp);

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'All active sessions revoked successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/auth/me
   */
  public static async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication is required');
      }

      const userProfile = await AuthService.getCurrentUser(req.user.id);

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'User profile retrieved successfully',
        data: { user: userProfile },
      });
    } catch (error) {
      next(error);
    }
  }
}
