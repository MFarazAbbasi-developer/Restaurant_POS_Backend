import type { Request, Response, NextFunction } from 'express';
import { StaffService } from './staff.service.js';
import { ApiResponse } from '../../common/http/response.js';
import { HttpStatus } from '../../common/http/http-status.js';
import { UnauthorizedError } from '../../common/errors/app-error.js';
import type { ListStaffQueryInput } from './staff.schema.js';

export class StaffController {
  /**
   * GET /api/v1/staff
   */
  public static async listStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication is required');
      }

      const query = req.query as unknown as ListStaffQueryInput;
      const result = await StaffService.listStaff(req.user.restaurantId, query);

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Staff list retrieved successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/staff/roles
   */
  public static async listRoles(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication is required');
      }

      const roles = await StaffService.listRoles(req.user.restaurantId);

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Roles retrieved successfully',
        data: { roles },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/staff/:id
   */
  public static async getStaffById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication is required');
      }

      const staff = await StaffService.getStaffById(req.user.restaurantId, req.params.id as string);

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Staff member retrieved successfully',
        data: { staff },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/staff
   */
  public static async createStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication is required');
      }

      const clientIp = req.ip || req.socket.remoteAddress;
      const staff = await StaffService.createStaff(
        req.user.restaurantId,
        req.body,
        req.user,
        clientIp,
      );

      ApiResponse.success(res, {
        statusCode: HttpStatus.CREATED,
        message: 'Staff member created successfully',
        data: { staff },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/staff/:id
   */
  public static async updateStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication is required');
      }

      const clientIp = req.ip || req.socket.remoteAddress;
      const staff = await StaffService.updateStaff(
        req.user.restaurantId,
        req.params.id as string,
        req.body,
        req.user,
        clientIp,
      );

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Staff member updated successfully',
        data: { staff },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/staff/:id/status
   */
  public static async updateStaffStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication is required');
      }

      const clientIp = req.ip || req.socket.remoteAddress;
      const staff = await StaffService.updateStaffStatus(
        req.user.restaurantId,
        req.params.id as string,
        req.body.isActive,
        req.user,
        clientIp,
      );

      const statusMsg = req.body.isActive ? 'activated' : 'deactivated';

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: `Staff member ${statusMsg} successfully`,
        data: { staff },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/staff/:id/pin
   */
  public static async updateStaffPin(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication is required');
      }

      const clientIp = req.ip || req.socket.remoteAddress;
      const staff = await StaffService.updateStaffPin(
        req.user.restaurantId,
        req.params.id as string,
        req.body.pin,
        req.user,
        clientIp,
      );

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Staff PIN updated successfully',
        data: { staff },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/staff/:id/roles
   */
  public static async updateStaffRoles(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication is required');
      }

      const clientIp = req.ip || req.socket.remoteAddress;
      const staff = await StaffService.updateStaffRoles(
        req.user.restaurantId,
        req.params.id as string,
        req.body.roleIds,
        req.user,
        clientIp,
      );

      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Staff roles updated successfully',
        data: { staff },
      });
    } catch (error) {
      next(error);
    }
  }
}
