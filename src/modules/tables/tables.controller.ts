import type { Request, Response, NextFunction } from 'express';
import { ZoneService } from './services/zone.service.js';
import { TableService } from './services/table.service.js';
import { TableOrderService } from './services/table-order.service.js';
import { ApiResponse } from '../../common/http/response.js';
import { HttpStatus } from '../../common/http/http-status.js';
import { UnauthorizedError } from '../../common/errors/app-error.js';
import type { ListTablesQueryInput } from './tables.schema.js';

export class TablesController {
  // ===========================================================================
  // 1. Zones / Seating Floors
  // ===========================================================================

  public static async listZones(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const zones = await ZoneService.listZones(req.user.restaurantId);
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Seating zones retrieved successfully',
        data: { zones },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getZone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const zone = await ZoneService.getZoneById(req.user.restaurantId, req.params.id as string);
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Seating zone retrieved successfully',
        data: { zone },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async createZone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const zone = await ZoneService.createZone(
        req.user.restaurantId,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.CREATED,
        message: 'Seating zone created successfully',
        data: { zone },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateZone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const zone = await ZoneService.updateZone(
        req.user.restaurantId,
        req.params.id as string,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Seating zone updated successfully',
        data: { zone },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateZoneStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const zone = await ZoneService.updateZoneStatus(
        req.user.restaurantId,
        req.params.id as string,
        req.body.isActive,
        req.user,
        clientIp,
      );
      const statusMsg = req.body.isActive ? 'activated' : 'deactivated';
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: `Seating zone ${statusMsg} successfully`,
        data: { zone },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async reorderZones(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const zones = await ZoneService.reorderZones(
        req.user.restaurantId,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Seating zones reordered successfully',
        data: { zones },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async deleteZone(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const result = await ZoneService.deleteZone(
        req.user.restaurantId,
        req.params.id as string,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Seating zone deleted successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // ===========================================================================
  // 2. Tables
  // ===========================================================================

  public static async listTables(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const query = req.query as unknown as ListTablesQueryInput;
      const tables = await TableService.listTables(req.user.restaurantId, query);
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Tables retrieved successfully',
        data: { tables },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getPosFloorView(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const floorView = await TableService.getPosFloorView(req.user.restaurantId);
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'POS floor layout view retrieved successfully',
        data: floorView,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getTable(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const table = await TableService.getTableById(req.user.restaurantId, req.params.id as string);
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Table retrieved successfully',
        data: { table },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async createTable(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const table = await TableService.createTable(
        req.user.restaurantId,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.CREATED,
        message: 'Table created successfully',
        data: { table },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateTable(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const table = await TableService.updateTable(
        req.user.restaurantId,
        req.params.id as string,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Table updated successfully',
        data: { table },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateTableStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const table = await TableService.updateTableStatus(
        req.user.restaurantId,
        req.params.id as string,
        req.body.status,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: `Table status updated to ${req.body.status}`,
        data: { table },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async transferTable(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const result = await TableService.transferTable(
        req.user.restaurantId,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Table orders transferred successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async mergeTables(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const result = await TableService.mergeTables(
        req.user.restaurantId,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Tables merged successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async unmergeTable(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const result = await TableService.unmergeTable(
        req.user.restaurantId,
        req.params.id as string,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Table unmerged successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async deleteTable(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const result = await TableService.deleteTable(
        req.user.restaurantId,
        req.params.id as string,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Table deleted successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // ===========================================================================
  // 3. Table Orders / Sub-bills
  // ===========================================================================

  public static async createTableOrder(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const order = await TableOrderService.createTableOrder(
        req.user.restaurantId,
        req.params.id as string,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.CREATED,
        message: 'Table order opened successfully',
        data: { order },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async listTableOrders(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const activeOnly = req.query.activeOnly === 'true';
      const orders = await TableOrderService.listTableOrders(
        req.user.restaurantId,
        req.params.id as string,
        activeOnly,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Table orders retrieved successfully',
        data: { orders },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateTableOrderStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const order = await TableOrderService.updateTableOrderStatus(
        req.user.restaurantId,
        req.params.id as string,
        req.params.orderId as string,
        req.body.status,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: `Table order status updated to ${req.body.status}`,
        data: { order },
      });
    } catch (error) {
      next(error);
    }
  }
}
