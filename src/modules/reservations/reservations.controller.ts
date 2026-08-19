import type { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../../common/http/response.js';
import { HttpStatus } from '../../common/http/http-status.js';
import { ReservationsService } from './reservations.service.js';
import {
  CreateReservationInput,
  UpdateReservationInput,
  UpdateReservationStatusInput,
  AssignTableInput,
  CheckAvailabilityQuery,
  ListReservationsQuery,
} from './reservations.schema.js';

export class ReservationsController {
  // ---------------------------------------------------------------------------
  // 1. List Reservations
  // ---------------------------------------------------------------------------
  public static async listReservations(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const query = req.query as unknown as ListReservationsQuery;
      const result = await ReservationsService.listReservations(restaurantId, query);
      ApiResponse.success(res, {
        data: {
          items: result.reservations,
          pagination: result.pagination,
        },
        message: 'Reservations retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Check Table Availability
  // ---------------------------------------------------------------------------
  public static async checkAvailability(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const query = req.query as unknown as CheckAvailabilityQuery;
      const result = await ReservationsService.checkAvailability(restaurantId, query);
      ApiResponse.success(res, {
        data: result,
        message: 'Table availability evaluated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Get Reservation by ID
  // ---------------------------------------------------------------------------
  public static async getReservation(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const id = req.params.id as string;
      const reservation = await ReservationsService.getReservation(restaurantId, id);
      ApiResponse.success(res, {
        data: { reservation },
        message: 'Reservation details retrieved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Create Reservation
  // ---------------------------------------------------------------------------
  public static async createReservation(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const input = req.body as CreateReservationInput;
      const reservation = await ReservationsService.createReservation(
        restaurantId,
        input,
        req.user!.id,
      );
      ApiResponse.success(res, {
        data: { reservation },
        message: 'Reservation created successfully',
        statusCode: HttpStatus.CREATED,
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Update Reservation Details
  // ---------------------------------------------------------------------------
  public static async updateReservation(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const id = req.params.id as string;
      const input = req.body as UpdateReservationInput;
      const updated = await ReservationsService.updateReservation(
        restaurantId,
        id,
        input,
        req.user!.id,
      );
      ApiResponse.success(res, {
        data: { reservation: updated },
        message: 'Reservation updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Assign / Reassign Table
  // ---------------------------------------------------------------------------
  public static async assignTable(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const id = req.params.id as string;
      const input = req.body as AssignTableInput;
      const updated = await ReservationsService.assignTable(restaurantId, id, input, req.user!.id);
      ApiResponse.success(res, {
        data: { reservation: updated },
        message: 'Table assigned to reservation successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // ---------------------------------------------------------------------------
  // 7. Status Transitions
  // ---------------------------------------------------------------------------
  public static async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.user!.restaurantId;
      const id = req.params.id as string;
      const input = req.body as UpdateReservationStatusInput;
      const updated = await ReservationsService.updateStatus(restaurantId, id, input, req.user!.id);
      ApiResponse.success(res, {
        data: { reservation: updated },
        message: `Reservation status transitioned to ${input.status} successfully`,
      });
    } catch (error) {
      next(error);
    }
  }
}
