import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import { AuditService } from '../../common/services/audit.service.js';
import { RealtimeService } from '../../common/services/realtime.service.js';
import {
  CreateReservationInput,
  UpdateReservationInput,
  UpdateReservationStatusInput,
  AssignTableInput,
  CheckAvailabilityQuery,
  ListReservationsQuery,
} from './reservations.schema.js';

export class ReservationsService {
  /**
   * Helper to parse date, startTime, and duration into start/end Date objects.
   */
  public static parseTimeWindow(
    reservationDateStr: string,
    startTimeStr: string,
    durationMinutes = 90,
  ): { reservationDate: Date; startDateTime: Date; endDateTime: Date } {
    let startDateTime: Date;

    // Check if startTime is a full ISO datetime string
    if (startTimeStr.includes('T') || startTimeStr.includes('-')) {
      startDateTime = new Date(startTimeStr);
    } else {
      // e.g. "19:00" or "19:00:00"
      const datePart = reservationDateStr.split('T')[0];
      startDateTime = new Date(
        `${datePart}T${startTimeStr.length === 5 ? startTimeStr + ':00' : startTimeStr}`,
      );
    }

    if (isNaN(startDateTime.getTime())) {
      throw new BadRequestError(`Invalid date/time format: ${reservationDateStr} ${startTimeStr}`);
    }

    // Standardize reservation date part (midnight)
    const dateOnly = new Date(startDateTime);
    dateOnly.setUTCHours(0, 0, 0, 0);

    const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60 * 1000);

    return {
      reservationDate: dateOnly,
      startDateTime,
      endDateTime,
    };
  }

  /**
   * Checks for overlapping reservations on a specific table.
   */
  public static async validateTableAvailability(
    db: Prisma.TransactionClient | typeof prisma,
    restaurantId: string,
    tableId: string,
    startDateTime: Date,
    endDateTime: Date,
    guestCount?: number,
    excludeReservationId?: string,
  ) {
    const table = await db.restaurantTable.findFirst({
      where: { id: tableId, restaurantId },
    });

    if (!table || !table.isActive) {
      throw new NotFoundError('Table not found or is currently inactive');
    }

    if (guestCount && table.capacity < guestCount) {
      throw new BadRequestError(
        `Table '${table.name}' capacity (${table.capacity}) is insufficient for ${guestCount} guests`,
      );
    }

    // Check overlapping bookings on the same table
    const conflicting = await db.reservation.findFirst({
      where: {
        restaurantId,
        tableId,
        status: { in: ['PENDING', 'CONFIRMED', 'SEATED'] },
        ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
        AND: [{ startTime: { lt: endDateTime } }, { endTime: { gt: startDateTime } }],
      },
      include: { customer: true },
    });

    if (conflicting) {
      throw new ConflictError(
        `Table '${table.name}' is already reserved (${conflicting.reservationCode}) between ${conflicting.startTime.toISOString()} and ${conflicting.endTime.toISOString()}`,
      );
    }

    return table;
  }

  /**
   * Generates formatted daily sequential reservation code (e.g. RES-20260820-001).
   */
  private static generateReservationCode(date: Date, countToday: number): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const dateCompact = `${y}${m}${d}`;
    const seq = String(countToday + 1).padStart(3, '0');
    return `RES-${dateCompact}-${seq}`;
  }

  // ---------------------------------------------------------------------------
  // 1. Create Reservation
  // ---------------------------------------------------------------------------
  public static async createReservation(
    restaurantId: string,
    input: CreateReservationInput,
    actorId?: string,
  ) {
    const { reservationDate, startDateTime, endDateTime } = this.parseTimeWindow(
      input.reservationDate,
      input.startTime,
      input.durationMinutes,
    );

    // Verify table if specified
    if (input.tableId) {
      await this.validateTableAvailability(
        prisma,
        restaurantId,
        input.tableId,
        startDateTime,
        endDateTime,
        input.guestCount,
      );
    }

    // Link or auto-create Customer
    let customerId = input.customerId;
    if (!customerId && input.customerPhone) {
      let customer = await prisma.customer.findFirst({
        where: { restaurantId, phone: input.customerPhone.trim() },
      });
      if (!customer) {
        customer = await prisma.customer.create({
          data: {
            restaurantId,
            name: input.customerName.trim(),
            phone: input.customerPhone.trim(),
          },
        });
      }
      customerId = customer.id;
    }

    // Count today's reservations for sequential code
    const countToday = await prisma.reservation.count({
      where: { restaurantId, reservationDate },
    });
    const reservationCode = this.generateReservationCode(startDateTime, countToday);

    const reservation = await prisma.reservation.create({
      data: {
        restaurantId,
        reservationCode,
        customerId: customerId ?? null,
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone.trim(),
        customerEmail: input.customerEmail?.trim() ?? null,
        guestCount: input.guestCount,
        tableId: input.tableId ?? null,
        reservationDate,
        startTime: startDateTime,
        endTime: endDateTime,
        durationMinutes: input.durationMinutes,
        status: input.status ?? 'CONFIRMED',
        specialRequests: input.specialRequests?.trim() ?? null,
        createdById: actorId ?? null,
      },
      include: {
        table: {
          include: { zone: true },
        },
        customer: true,
        createdByUser: {
          select: { id: true, name: true, username: true },
        },
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'RESERVATION_CREATED',
      entityType: 'RESERVATION',
      entityId: reservation.id,
      metadata: {
        reservationCode: reservation.reservationCode,
        customerName: reservation.customerName,
        guestCount: reservation.guestCount,
        tableId: reservation.tableId,
        startTime: reservation.startTime,
      },
    });

    RealtimeService.emitToRestaurant(restaurantId, 'reservation:created', {
      reservation,
    });

    return reservation;
  }

  // ---------------------------------------------------------------------------
  // 2. Check Table Availability
  // ---------------------------------------------------------------------------
  public static async checkAvailability(restaurantId: string, query: CheckAvailabilityQuery) {
    const { startDateTime, endDateTime } = this.parseTimeWindow(
      query.reservationDate,
      query.startTime,
      query.durationMinutes,
    );

    // 1. Get all active tables in restaurant
    const allTables = await prisma.restaurantTable.findMany({
      where: { restaurantId, isActive: true },
      include: { zone: true },
      orderBy: [{ zone: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    });

    // 2. Find overlapping active reservations
    const overlappingReservations = await prisma.reservation.findMany({
      where: {
        restaurantId,
        tableId: { not: null },
        status: { in: ['PENDING', 'CONFIRMED', 'SEATED'] },
        AND: [{ startTime: { lt: endDateTime } }, { endTime: { gt: startDateTime } }],
      },
      select: {
        tableId: true,
        reservationCode: true,
        startTime: true,
        endTime: true,
        customerName: true,
      },
    });

    const bookedTableMap = new Map(overlappingReservations.map((r) => [r.tableId!, r]));

    const availableTables = [];
    const unavailableTables = [];

    for (const table of allTables) {
      const conflict = bookedTableMap.get(table.id);
      const isCapacitySuitable = table.capacity >= query.guestCount;

      if (!conflict && isCapacitySuitable) {
        availableTables.push({
          id: table.id,
          name: table.name,
          capacity: table.capacity,
          zone: table.zone.name,
          currentStatus: table.status,
        });
      } else {
        unavailableTables.push({
          id: table.id,
          name: table.name,
          capacity: table.capacity,
          zone: table.zone.name,
          currentStatus: table.status,
          reason: conflict
            ? `Booked by ${conflict.customerName} (${conflict.reservationCode})`
            : `Insufficient capacity (${table.capacity} < ${query.guestCount})`,
        });
      }
    }

    return {
      query: {
        reservationDate: query.reservationDate,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        guestCount: query.guestCount,
        durationMinutes: query.durationMinutes,
      },
      totalTables: allTables.length,
      availableCount: availableTables.length,
      availableTables,
      unavailableTables,
    };
  }

  // ---------------------------------------------------------------------------
  // 3. Assign / Reassign Table
  // ---------------------------------------------------------------------------
  public static async assignTable(
    restaurantId: string,
    id: string,
    input: AssignTableInput,
    actorId?: string,
  ) {
    const reservation = await prisma.reservation.findFirst({
      where: { id, restaurantId },
    });

    if (!reservation) {
      throw new NotFoundError('Reservation not found');
    }

    if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(reservation.status)) {
      throw new BadRequestError(
        `Cannot assign table to a reservation that is already ${reservation.status}`,
      );
    }

    // Validate table availability
    const table = await this.validateTableAvailability(
      prisma,
      restaurantId,
      input.tableId,
      reservation.startTime,
      reservation.endTime,
      reservation.guestCount,
      reservation.id,
    );

    const updated = await prisma.reservation.update({
      where: { id },
      data: {
        tableId: input.tableId,
      },
      include: {
        table: {
          include: { zone: true },
        },
        customer: true,
        createdByUser: {
          select: { id: true, name: true, username: true },
        },
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'RESERVATION_TABLE_ASSIGNED',
      entityType: 'RESERVATION',
      entityId: id,
      metadata: {
        reservationCode: reservation.reservationCode,
        tableId: input.tableId,
        tableName: table.name,
      },
    });

    RealtimeService.emitToRestaurant(restaurantId, 'reservation:table_assigned', {
      reservation: updated,
      tableId: input.tableId,
      tableName: table.name,
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // 4. Update Reservation
  // ---------------------------------------------------------------------------
  public static async updateReservation(
    restaurantId: string,
    id: string,
    input: UpdateReservationInput,
    actorId?: string,
  ) {
    const reservation = await prisma.reservation.findFirst({
      where: { id, restaurantId },
    });

    if (!reservation) {
      throw new NotFoundError('Reservation not found');
    }

    if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(reservation.status)) {
      throw new BadRequestError(
        `Cannot update a reservation that is already ${reservation.status}`,
      );
    }

    // Recompute time window if any timing field is updated
    let startDateTime = reservation.startTime;
    let endDateTime = reservation.endTime;
    let reservationDate = reservation.reservationDate;
    let durationMinutes = reservation.durationMinutes;

    if (input.reservationDate || input.startTime || input.durationMinutes) {
      const dateStr =
        input.reservationDate ?? reservation.reservationDate.toISOString().substring(0, 10);
      const timeStr = input.startTime ?? reservation.startTime.toISOString();
      durationMinutes = input.durationMinutes ?? reservation.durationMinutes;

      const window = this.parseTimeWindow(dateStr, timeStr, durationMinutes);
      reservationDate = window.reservationDate;
      startDateTime = window.startDateTime;
      endDateTime = window.endDateTime;
    }

    const targetTableId = input.tableId !== undefined ? input.tableId : reservation.tableId;
    const targetGuestCount = input.guestCount ?? reservation.guestCount;

    if (targetTableId) {
      await this.validateTableAvailability(
        prisma,
        restaurantId,
        targetTableId,
        startDateTime,
        endDateTime,
        targetGuestCount,
        reservation.id,
      );
    }

    const updated = await prisma.reservation.update({
      where: { id },
      data: {
        ...(input.customerName && { customerName: input.customerName.trim() }),
        ...(input.customerPhone && { customerPhone: input.customerPhone.trim() }),
        ...(input.customerEmail !== undefined && {
          customerEmail: input.customerEmail?.trim() ?? null,
        }),
        ...(input.guestCount && { guestCount: input.guestCount }),
        ...(input.tableId !== undefined && { tableId: input.tableId }),
        reservationDate,
        startTime: startDateTime,
        endTime: endDateTime,
        durationMinutes,
        ...(input.specialRequests !== undefined && {
          specialRequests: input.specialRequests?.trim() ?? null,
        }),
      },
      include: {
        table: {
          include: { zone: true },
        },
        customer: true,
        createdByUser: {
          select: { id: true, name: true, username: true },
        },
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'RESERVATION_UPDATED',
      entityType: 'RESERVATION',
      entityId: id,
      metadata: { changes: input },
    });

    RealtimeService.emitToRestaurant(restaurantId, 'reservation:updated', {
      reservation: updated,
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // 5. Status Transitions (Confirm, Seat, Complete, Cancel, No-Show)
  // ---------------------------------------------------------------------------
  public static async updateStatus(
    restaurantId: string,
    id: string,
    input: UpdateReservationStatusInput,
    actorId?: string,
  ) {
    const reservation = await prisma.reservation.findFirst({
      where: { id, restaurantId },
      include: { table: true },
    });

    if (!reservation) {
      throw new NotFoundError('Reservation not found');
    }

    const previousStatus = reservation.status;
    const newStatus = input.status;

    if (previousStatus === newStatus) {
      return reservation;
    }

    if (['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(previousStatus)) {
      throw new BadRequestError(
        `Cannot change status of a reservation that is already ${previousStatus}`,
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. If SEATING guests, ensure table exists and update table occupancy
      if (newStatus === 'SEATED') {
        if (reservation.tableId) {
          await tx.restaurantTable.update({
            where: { id: reservation.tableId },
            data: { status: 'OCCUPIED' },
          });
        }
      }

      // 2. Update reservation record
      const res = await tx.reservation.update({
        where: { id },
        data: {
          status: newStatus,
          ...(newStatus === 'SEATED' ? { seatedAt: new Date() } : {}),
          ...(newStatus === 'COMPLETED' ? { completedAt: new Date() } : {}),
          ...(newStatus === 'CANCELLED' && input.cancelReason
            ? { cancelReason: input.cancelReason.trim() }
            : {}),
        },
        include: {
          table: {
            include: { zone: true },
          },
          customer: true,
          createdByUser: {
            select: { id: true, name: true, username: true },
          },
        },
      });

      return res;
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'RESERVATION_STATUS_CHANGED',
      entityType: 'RESERVATION',
      entityId: id,
      metadata: {
        previousStatus,
        newStatus,
        cancelReason: input.cancelReason,
      },
    });

    // Realtime events
    RealtimeService.emitToRestaurant(restaurantId, 'reservation:status_changed', {
      reservation: updated,
      previousStatus,
      newStatus,
    });

    if (newStatus === 'SEATED') {
      RealtimeService.emitToRestaurant(restaurantId, 'reservation:seated', {
        reservation: updated,
        tableId: reservation.tableId,
      });
      if (reservation.tableId) {
        RealtimeService.emitToRestaurant(restaurantId, 'table:status_updated', {
          tableId: reservation.tableId,
          status: 'OCCUPIED',
        });
      }
    } else if (newStatus === 'CANCELLED') {
      RealtimeService.emitToRestaurant(restaurantId, 'reservation:cancelled', {
        reservation: updated,
        cancelReason: input.cancelReason,
      });
    }

    return updated;
  }

  // ---------------------------------------------------------------------------
  // 6. List & Get Queries
  // ---------------------------------------------------------------------------
  public static async listReservations(restaurantId: string, query: ListReservationsQuery) {
    const {
      page,
      limit,
      reservationDate,
      startDate,
      endDate,
      status,
      tableId,
      customerId,
      search,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ReservationWhereInput = {
      restaurantId,
      ...(status && { status }),
      ...(tableId && { tableId }),
      ...(customerId && { customerId }),
      ...(reservationDate
        ? {
            reservationDate: new Date(reservationDate),
          }
        : {}),
      ...(startDate || endDate
        ? {
            startTime: {
              ...(startDate && { gte: new Date(startDate) }),
              ...(endDate && { lte: new Date(endDate) }),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { reservationCode: { contains: search, mode: 'insensitive' } },
              { customerName: { contains: search, mode: 'insensitive' } },
              { customerPhone: { contains: search } },
            ],
          }
        : {}),
    };

    const [total, reservations] = await Promise.all([
      prisma.reservation.count({ where }),
      prisma.reservation.findMany({
        where,
        skip,
        take: limit,
        include: {
          table: {
            include: { zone: true },
          },
          customer: true,
          createdByUser: {
            select: { id: true, name: true, username: true },
          },
        },
        orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    return {
      reservations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  public static async getReservation(restaurantId: string, id: string) {
    const reservation = await prisma.reservation.findFirst({
      where: { id, restaurantId },
      include: {
        table: {
          include: { zone: true },
        },
        customer: true,
        createdByUser: {
          select: { id: true, name: true, username: true },
        },
      },
    });

    if (!reservation) {
      throw new NotFoundError('Reservation not found');
    }

    return reservation;
  }
}
