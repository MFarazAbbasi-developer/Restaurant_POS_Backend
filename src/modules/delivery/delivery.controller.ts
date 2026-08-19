import type { Request, Response, NextFunction } from 'express';
import { CustomerService } from './services/customer.service.js';
import { DeliveryZoneService } from './services/delivery-zone.service.js';
import { DeliveryService } from './services/delivery.service.js';
import { RiderService } from './services/rider.service.js';
import { ApiResponse } from '../../common/http/response.js';
import { HttpStatus } from '../../common/http/http-status.js';
import { UnauthorizedError } from '../../common/errors/app-error.js';
import type { ListDeliveryOrdersQueryInput } from './delivery.schema.js';

export class DeliveryController {
  // ===========================================================================
  // Customer Endpoints
  // ===========================================================================

  public static async lookupCustomerByPhone(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const phone = req.query.phone as string;
      const customer = await CustomerService.lookupByPhone(req.user.restaurantId, phone);
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: customer ? 'Customer profile retrieved' : 'Customer not found',
        data: { customer },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async createCustomer(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const customer = await CustomerService.createCustomer(
        req.user.restaurantId,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.CREATED,
        message: 'Customer created successfully',
        data: { customer },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateCustomer(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const customer = await CustomerService.updateCustomer(
        req.user.restaurantId,
        req.params.id as string,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Customer updated successfully',
        data: { customer },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async addCustomerAddress(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const address = await CustomerService.addAddress(
        req.user.restaurantId,
        req.params.id as string,
        req.body,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.CREATED,
        message: 'Customer address added successfully',
        data: { address },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async listCustomers(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const search = req.query.search as string | undefined;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const result = await CustomerService.listCustomers(
        req.user.restaurantId,
        search,
        page,
        limit,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Customers retrieved successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // ===========================================================================
  // Delivery Zone Endpoints
  // ===========================================================================

  public static async listDeliveryZones(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const zones = await DeliveryZoneService.listZones(req.user.restaurantId);
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Delivery zones retrieved successfully',
        data: { zones },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getDeliveryZone(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const zone = await DeliveryZoneService.getZoneById(
        req.user.restaurantId,
        req.params.id as string,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Delivery zone retrieved successfully',
        data: { zone },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async createDeliveryZone(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const zone = await DeliveryZoneService.createZone(
        req.user.restaurantId,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.CREATED,
        message: 'Delivery zone created successfully',
        data: { zone },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateDeliveryZone(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const zone = await DeliveryZoneService.updateZone(
        req.user.restaurantId,
        req.params.id as string,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Delivery zone updated successfully',
        data: { zone },
      });
    } catch (error) {
      next(error);
    }
  }

  // ===========================================================================
  // Delivery Order Endpoints
  // ===========================================================================

  public static async createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const order = await DeliveryService.createOrder(
        req.user.restaurantId,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.CREATED,
        message: 'Delivery order created successfully',
        data: { order },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getDispatcherQueue(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const queue = await DeliveryService.getDispatcherQueue(req.user.restaurantId);
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Dispatcher delivery queue retrieved successfully',
        data: queue,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async listOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const query = req.query as unknown as ListDeliveryOrdersQueryInput;
      const result = await DeliveryService.listOrders(req.user.restaurantId, query);
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Delivery orders retrieved successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const order = await DeliveryService.getOrderById(
        req.user.restaurantId,
        req.params.id as string,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Delivery order retrieved successfully',
        data: { order },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const order = await DeliveryService.updateOrderStatus(
        req.user.restaurantId,
        req.params.id as string,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: `Delivery order status updated to ${req.body.status}`,
        data: { order },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async assignRider(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const order = await RiderService.assignRider(
        req.user.restaurantId,
        req.params.id as string,
        req.body.riderId,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Rider assigned to delivery order successfully',
        data: { order },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async cancelOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const result = await DeliveryService.cancelOrder(
        req.user.restaurantId,
        req.params.id as string,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Delivery order cancelled successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // ===========================================================================
  // Rider & Settlement Endpoints
  // ===========================================================================

  public static async listRiders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const riders = await RiderService.listEligibleRiders(req.user.restaurantId);
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Eligible delivery riders retrieved successfully',
        data: { riders },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getRiderActiveDeliveries(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const deliveries = await RiderService.getRiderActiveDeliveries(
        req.user.restaurantId,
        req.params.riderId as string,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Rider active deliveries retrieved successfully',
        data: { deliveries },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getRiderOutstandingSummary(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const summary = await RiderService.getRiderOutstandingSummary(
        req.user.restaurantId,
        req.params.riderId as string,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Rider outstanding cash summary retrieved successfully',
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  }

  public static async recordRiderSettlement(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const clientIp = req.ip || req.socket.remoteAddress;
      const settlement = await RiderService.recordRiderSettlement(
        req.user.restaurantId,
        req.body,
        req.user,
        clientIp,
      );
      ApiResponse.success(res, {
        statusCode: HttpStatus.CREATED,
        message: 'Rider cash settlement recorded successfully',
        data: { settlement },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async listSettlements(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) throw new UnauthorizedError();
      const riderId = req.query.riderId as string | undefined;
      const settlements = await RiderService.listSettlements(req.user.restaurantId, riderId);
      ApiResponse.success(res, {
        statusCode: HttpStatus.OK,
        message: 'Rider settlements retrieved successfully',
        data: { settlements },
      });
    } catch (error) {
      next(error);
    }
  }
}
