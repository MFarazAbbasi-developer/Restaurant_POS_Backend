import { prisma } from '../../../config/database.js';
import { BadRequestError, NotFoundError } from '../../../common/errors/app-error.js';
import { AuditService } from '../../../common/services/audit.service.js';
import type {
  AddCustomerAddressInput,
  CreateCustomerInput,
  UpdateCustomerInput,
} from '../delivery.schema.js';
import type { AuthenticatedUserContext } from '../../../common/types/express.js';

export class CustomerService {
  /**
   * Looks up a customer by phone number within the restaurant scope.
   * Returns customer profile, saved delivery addresses, and past delivery orders.
   */
  public static async lookupByPhone(restaurantId: string, phone: string) {
    const customer = await prisma.customer.findUnique({
      where: {
        restaurantId_phone: {
          restaurantId,
          phone: phone.trim(),
        },
      },
      include: {
        addresses: {
          include: {
            deliveryZone: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        deliveryOrders: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            orderCode: true,
            businessDate: true,
            status: true,
            totalAmount: true,
            deliveryAddress: true,
            createdAt: true,
          },
        },
      },
    });

    if (!customer) {
      return null;
    }

    return {
      ...customer,
      deliveryOrders: customer.deliveryOrders.map((o) => ({
        ...o,
        totalAmount: o.totalAmount.toNumber(),
      })),
    };
  }

  /**
   * Creates a new customer with an optional initial address.
   */
  public static async createCustomer(
    restaurantId: string,
    input: CreateCustomerInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const existing = await prisma.customer.findUnique({
      where: {
        restaurantId_phone: {
          restaurantId,
          phone: input.phone.trim(),
        },
      },
    });

    if (existing) {
      throw new BadRequestError(`Customer with phone '${input.phone}' already exists`);
    }

    const customer = await prisma.$transaction(async (tx) => {
      const newCustomer = await tx.customer.create({
        data: {
          restaurantId,
          name: input.name.trim(),
          phone: input.phone.trim(),
          notes: input.notes ?? null,
        },
      });

      if (input.address) {
        await tx.customerAddress.create({
          data: {
            customerId: newCustomer.id,
            address: input.address.trim(),
            landmark: input.landmark ?? null,
            deliveryZoneId: input.deliveryZoneId ?? null,
            isDefault: true,
          },
        });
      }

      return tx.customer.findUnique({
        where: { id: newCustomer.id },
        include: {
          addresses: {
            include: { deliveryZone: true },
          },
        },
      });
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'DELIVERY_CUSTOMER_CREATED',
      entityType: 'CUSTOMER',
      entityId: customer!.id,
      metadata: {
        name: customer!.name,
        phone: customer!.phone,
      },
      ipAddress: ipAddress ?? null,
    });

    return customer;
  }

  /**
   * Updates an existing customer profile.
   */
  public static async updateCustomer(
    restaurantId: string,
    customerId: string,
    input: UpdateCustomerInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ) {
    const existing = await prisma.customer.findFirst({
      where: { id: customerId, restaurantId },
    });

    if (!existing) {
      throw new NotFoundError('Customer not found in this restaurant');
    }

    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: {
        addresses: {
          include: { deliveryZone: true },
        },
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'DELIVERY_CUSTOMER_UPDATED',
      entityType: 'CUSTOMER',
      entityId: customerId,
      metadata: {
        updatedFields: Object.keys(input),
      },
      ipAddress: ipAddress ?? null,
    });

    return updated;
  }

  /**
   * Adds a new delivery address to an existing customer.
   */
  public static async addAddress(
    restaurantId: string,
    customerId: string,
    input: AddCustomerAddressInput,
  ) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, restaurantId },
    });

    if (!customer) {
      throw new NotFoundError('Customer not found in this restaurant');
    }

    if (input.deliveryZoneId) {
      const zone = await prisma.deliveryZone.findFirst({
        where: { id: input.deliveryZoneId, restaurantId, isActive: true },
      });
      if (!zone) {
        throw new BadRequestError('Invalid or inactive delivery zone specified');
      }
    }

    const address = await prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.customerAddress.updateMany({
          where: { customerId },
          data: { isDefault: false },
        });
      }

      return tx.customerAddress.create({
        data: {
          customerId,
          address: input.address.trim(),
          landmark: input.landmark ?? null,
          deliveryZoneId: input.deliveryZoneId ?? null,
          isDefault: input.isDefault ?? false,
        },
        include: {
          deliveryZone: true,
        },
      });
    });

    return address;
  }

  /**
   * Lists customers with pagination and optional search filter.
   */
  public static async listCustomers(
    restaurantId: string,
    search?: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const skip = (page - 1) * limit;
    const whereClause = {
      restaurantId,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { phone: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, customers] = await Promise.all([
      prisma.customer.count({ where: whereClause }),
      prisma.customer.findMany({
        where: whereClause,
        include: {
          addresses: {
            include: { deliveryZone: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      customers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
