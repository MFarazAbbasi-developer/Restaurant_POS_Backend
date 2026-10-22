import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { AppError } from '../../common/errors/app-error.js';
import { HttpStatus } from '../../common/http/http-status.js';
import { AuditService } from '../../common/services/audit.service.js';
import { ManagerAuthService } from '../auth/manager-auth.service.js';
import {
  UpdateLoyaltyProgramInput,
  CreateLoyaltyTierInput,
  UpdateLoyaltyTierInput,
  EnrollCustomerInput,
  PreviewRedemptionInput,
  ManualPointAdjustmentInput,
  ListLoyaltyAccountsQuery,
  ListLoyaltyTransactionsQuery,
} from './loyalty.schema.js';
import { AuthenticatedUserContext } from '../../common/types/index.js';

export class LoyaltyService {
  // ---------------------------------------------------------------------------
  // 1. Program Configuration
  // ---------------------------------------------------------------------------

  /**
   * Retrieves or initializes default loyalty program configuration for a restaurant.
   */
  public static async getOrCreateProgram(restaurantId: string) {
    let program = await prisma.loyaltyProgram.findUnique({
      where: { restaurantId },
    });

    if (!program) {
      program = await prisma.loyaltyProgram.create({
        data: {
          restaurantId,
          isEnabled: true,
          programName: 'FARMAX Rewards Club',
          pointsPerCurrencyUnit: 1.0,
          redemptionRate: new Prisma.Decimal('0.01'), // 100 points = $1.00
          minPointsToRedeem: 50,
          maxDiscountPercentage: 100.0,
          roundingMode: 'FLOOR',
          minOrderSubtotal: new Prisma.Decimal('0.00'),
        },
      });
    }

    return {
      ...program,
      redemptionRate: program.redemptionRate.toNumber(),
      minOrderSubtotal: program.minOrderSubtotal.toNumber(),
    };
  }

  /**
   * Updates loyalty program rules.
   */
  public static async updateProgram(
    restaurantId: string,
    input: UpdateLoyaltyProgramInput,
    actorId?: string,
  ) {
    await this.getOrCreateProgram(restaurantId);

    const updated = await prisma.loyaltyProgram.update({
      where: { restaurantId },
      data: {
        ...(input.isEnabled !== undefined && { isEnabled: input.isEnabled }),
        ...(input.programName !== undefined && { programName: input.programName }),
        ...(input.pointsPerCurrencyUnit !== undefined && {
          pointsPerCurrencyUnit: input.pointsPerCurrencyUnit,
        }),
        ...(input.redemptionRate !== undefined && {
          redemptionRate: new Prisma.Decimal(input.redemptionRate),
        }),
        ...(input.minPointsToRedeem !== undefined && {
          minPointsToRedeem: input.minPointsToRedeem,
        }),
        ...(input.maxPointsPerOrder !== undefined && {
          maxPointsPerOrder: input.maxPointsPerOrder,
        }),
        ...(input.maxDiscountPercentage !== undefined && {
          maxDiscountPercentage: input.maxDiscountPercentage,
        }),
        ...(input.pointsExpiryDays !== undefined && {
          pointsExpiryDays: input.pointsExpiryDays,
        }),
        ...(input.roundingMode !== undefined && { roundingMode: input.roundingMode }),
        ...(input.minOrderSubtotal !== undefined && {
          minOrderSubtotal: new Prisma.Decimal(input.minOrderSubtotal),
        }),
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'LOYALTY_PROGRAM_UPDATED',
      entityType: 'LOYALTY_PROGRAM',
      entityId: updated.id,
      metadata: { changes: input },
    });

    return {
      ...updated,
      redemptionRate: updated.redemptionRate.toNumber(),
      minOrderSubtotal: updated.minOrderSubtotal.toNumber(),
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Loyalty Tiers
  // ---------------------------------------------------------------------------

  /**
   * Lists all tiers for a restaurant.
   */
  public static async listTiers(restaurantId: string) {
    const tiers = await prisma.loyaltyTier.findMany({
      where: { restaurantId },
      orderBy: [{ sortOrder: 'asc' }, { minPoints: 'asc' }],
    });
    return tiers;
  }

  /**
   * Creates a new tier level.
   */
  public static async createTier(
    restaurantId: string,
    input: CreateLoyaltyTierInput,
    actorId?: string,
  ) {
    const existing = await prisma.loyaltyTier.findFirst({
      where: { restaurantId, name: { equals: input.name, mode: 'insensitive' } },
    });

    if (existing) {
      throw new AppError(
        `Loyalty tier with name "${input.name}" already exists`,
        HttpStatus.CONFLICT,
      );
    }

    const tier = await prisma.loyaltyTier.create({
      data: {
        restaurantId,
        name: input.name,
        minPoints: input.minPoints,
        multiplier: input.multiplier,
        discountPercentage: input.discountPercentage,
        color: input.color ?? null,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'LOYALTY_TIER_CREATED',
      entityType: 'LOYALTY_TIER',
      entityId: tier.id,
      metadata: { name: tier.name, minPoints: tier.minPoints },
    });

    return tier;
  }

  /**
   * Updates an existing tier.
   */
  public static async updateTier(
    restaurantId: string,
    id: string,
    input: UpdateLoyaltyTierInput,
    actorId?: string,
  ) {
    const existing = await prisma.loyaltyTier.findFirst({
      where: { id, restaurantId },
    });

    if (!existing) {
      throw new AppError('Loyalty tier not found', HttpStatus.NOT_FOUND);
    }

    if (input.name && input.name.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await prisma.loyaltyTier.findFirst({
        where: { restaurantId, name: { equals: input.name, mode: 'insensitive' }, id: { not: id } },
      });
      if (duplicate) {
        throw new AppError(
          `Loyalty tier with name "${input.name}" already exists`,
          HttpStatus.CONFLICT,
        );
      }
    }

    const updated = await prisma.loyaltyTier.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.minPoints !== undefined && { minPoints: input.minPoints }),
        ...(input.multiplier !== undefined && { multiplier: input.multiplier }),
        ...(input.discountPercentage !== undefined && {
          discountPercentage: input.discountPercentage,
        }),
        ...(input.color !== undefined && { color: input.color }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'LOYALTY_TIER_UPDATED',
      entityType: 'LOYALTY_TIER',
      entityId: id,
      metadata: { changes: input },
    });

    return updated;
  }

  /**
   * Deletes a tier.
   */
  public static async deleteTier(restaurantId: string, id: string, actorId?: string) {
    const existing = await prisma.loyaltyTier.findFirst({
      where: { id, restaurantId },
    });

    if (!existing) {
      throw new AppError('Loyalty tier not found', HttpStatus.NOT_FOUND);
    }

    await prisma.loyaltyTier.delete({ where: { id } });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'LOYALTY_TIER_DELETED',
      entityType: 'LOYALTY_TIER',
      entityId: id,
      metadata: { name: existing.name },
    });
  }

  // ---------------------------------------------------------------------------
  // 3. Customer Enrollment & Account Operations
  // ---------------------------------------------------------------------------

  /**
   * Retrieves a customer's loyalty account profile.
   */
  public static async getAccountByCustomerId(restaurantId: string, customerId: string) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, restaurantId },
    });

    if (!customer) {
      throw new AppError('Customer not found', HttpStatus.NOT_FOUND);
    }

    let account = await prisma.loyaltyAccount.findUnique({
      where: { customerId },
      include: {
        tier: true,
        customer: {
          select: { id: true, name: true, phone: true },
        },
      },
    });

    if (!account) {
      // Auto enroll
      account = await prisma.loyaltyAccount.create({
        data: {
          restaurantId,
          customerId,
          pointsBalance: 0,
          lifetimePoints: 0,
          totalRedeemedPoints: 0,
          isActive: true,
        },
        include: {
          tier: true,
          customer: {
            select: { id: true, name: true, phone: true },
          },
        },
      });
    }

    const program = await this.getOrCreateProgram(restaurantId);
    const cashValue = new Prisma.Decimal(account.pointsBalance)
      .mul(new Prisma.Decimal(program.redemptionRate))
      .toNumber();

    return {
      ...account,
      cashValue,
      program: {
        isEnabled: program.isEnabled,
        minPointsToRedeem: program.minPointsToRedeem,
        redemptionRate: program.redemptionRate,
      },
    };
  }

  /**
   * Explicitly enrolls a customer into the loyalty rewards program.
   */
  public static async enrollCustomer(
    restaurantId: string,
    input: EnrollCustomerInput,
    actorId?: string,
  ) {
    const customer = await prisma.customer.findFirst({
      where: { id: input.customerId, restaurantId },
    });

    if (!customer) {
      throw new AppError('Customer not found', HttpStatus.NOT_FOUND);
    }

    const existing = await prisma.loyaltyAccount.findUnique({
      where: { customerId: input.customerId },
      include: { tier: true },
    });

    if (existing) {
      if (!existing.isActive) {
        const reactivated = await prisma.loyaltyAccount.update({
          where: { id: existing.id },
          data: { isActive: true },
          include: { tier: true },
        });
        return reactivated;
      }
      return existing;
    }

    // Determine initial tier
    const initialTier = await prisma.loyaltyTier.findFirst({
      where: { restaurantId, isActive: true, minPoints: { lte: input.initialPoints ?? 0 } },
      orderBy: { minPoints: 'desc' },
    });

    const account = await prisma.$transaction(async (tx) => {
      const created = await tx.loyaltyAccount.create({
        data: {
          restaurantId,
          customerId: input.customerId,
          tierId: initialTier?.id ?? null,
          pointsBalance: input.initialPoints ?? 0,
          lifetimePoints: input.initialPoints ?? 0,
          totalRedeemedPoints: 0,
          isActive: true,
        },
        include: { tier: true },
      });

      if (input.initialPoints && input.initialPoints > 0) {
        await tx.loyaltyTransaction.create({
          data: {
            restaurantId,
            accountId: created.id,
            customerId: input.customerId,
            type: 'EARN',
            points: input.initialPoints,
            pointsBalanceAfter: input.initialPoints,
            reason: 'Welcome bonus / enrollment points',
            createdById: actorId ?? null,
          },
        });
      }

      return created;
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'LOYALTY_ACCOUNT_ENROLLED',
      entityType: 'LOYALTY_ACCOUNT',
      entityId: account.id,
      metadata: { customerId: input.customerId, initialPoints: input.initialPoints },
    });

    return account;
  }

  /**
   * Lists customer loyalty accounts with filtering and pagination.
   */
  public static async listAccounts(restaurantId: string, query: ListLoyaltyAccountsQuery) {
    const { page, limit, search, tierId, isActive } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.LoyaltyAccountWhereInput = {
      restaurantId,
      ...(tierId && { tierId }),
      ...(isActive !== undefined && { isActive }),
      ...(search && {
        customer: {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
          ],
        },
      }),
    };

    const [total, accounts] = await Promise.all([
      prisma.loyaltyAccount.count({ where }),
      prisma.loyaltyAccount.findMany({
        where,
        skip,
        take: limit,
        include: {
          tier: true,
          customer: {
            select: { id: true, name: true, phone: true },
          },
        },
        orderBy: { lifetimePoints: 'desc' },
      }),
    ]);

    return {
      accounts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // 4. Pre-Checkout Redemption Preview
  // ---------------------------------------------------------------------------

  /**
   * Calculates maximum redeemable points and estimated discount before order checkout.
   */
  public static async previewRedemption(restaurantId: string, input: PreviewRedemptionInput) {
    const program = await this.getOrCreateProgram(restaurantId);

    if (!program.isEnabled) {
      return {
        isEligible: false,
        reason: 'Loyalty rewards program is currently disabled',
        availablePoints: 0,
        redeemablePoints: 0,
        discountAmount: 0,
      };
    }

    const account = await prisma.loyaltyAccount.findUnique({
      where: { customerId: input.customerId },
      include: { tier: true },
    });

    if (!account || !account.isActive) {
      return {
        isEligible: false,
        reason: 'Customer does not have an active loyalty rewards account',
        availablePoints: 0,
        redeemablePoints: 0,
        discountAmount: 0,
      };
    }

    const subtotal = new Prisma.Decimal(input.subtotal);
    if (subtotal.lessThan(new Prisma.Decimal(program.minOrderSubtotal))) {
      return {
        isEligible: false,
        reason: `Order subtotal does not meet minimum spend threshold of $${program.minOrderSubtotal.toFixed(2)}`,
        availablePoints: account.pointsBalance,
        redeemablePoints: 0,
        discountAmount: 0,
      };
    }

    if (account.pointsBalance < program.minPointsToRedeem) {
      return {
        isEligible: false,
        reason: `Customer points balance (${account.pointsBalance}) is below the minimum redemption threshold of ${program.minPointsToRedeem} points`,
        availablePoints: account.pointsBalance,
        redeemablePoints: 0,
        discountAmount: 0,
      };
    }

    // Maximum discount allowed by program rule
    const maxDiscountDollar = subtotal
      .mul(new Prisma.Decimal(program.maxDiscountPercentage))
      .div(100);

    const rate = new Prisma.Decimal(program.redemptionRate);

    // Maximum points to achieve max allowed discount
    const maxPointsForOrderCap = maxDiscountDollar.div(rate).floor().toNumber();

    let eligiblePoints = Math.min(account.pointsBalance, maxPointsForOrderCap);

    if (program.maxPointsPerOrder) {
      eligiblePoints = Math.min(eligiblePoints, program.maxPointsPerOrder);
    }

    // If requested specific pointsToRedeem
    let pointsToRedeem = eligiblePoints;
    if (input.pointsToRedeem !== undefined) {
      if (input.pointsToRedeem > account.pointsBalance) {
        throw new AppError(
          `Requested redemption points (${input.pointsToRedeem}) exceed available balance (${account.pointsBalance})`,
          HttpStatus.BAD_REQUEST,
        );
      }
      if (input.pointsToRedeem < program.minPointsToRedeem) {
        throw new AppError(
          `Requested points (${input.pointsToRedeem}) are below minimum threshold of ${program.minPointsToRedeem}`,
          HttpStatus.BAD_REQUEST,
        );
      }
      pointsToRedeem = Math.min(input.pointsToRedeem, eligiblePoints);
    }

    const discountAmount = new Prisma.Decimal(pointsToRedeem)
      .mul(rate)
      .toDecimalPlaces(2)
      .toNumber();

    const discountedSubtotal = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      subtotal.minus(new Prisma.Decimal(discountAmount)),
    ).toNumber();

    return {
      isEligible: true,
      availablePoints: account.pointsBalance,
      redeemablePoints: eligiblePoints,
      pointsToRedeem,
      redemptionRate: program.redemptionRate,
      discountAmount,
      discountedSubtotal,
      remainingPoints: account.pointsBalance - pointsToRedeem,
    };
  }

  // ---------------------------------------------------------------------------
  // 5. Transactional Order Earning & Redemption Handlers
  // ---------------------------------------------------------------------------

  /**
   * Deducts redeemed points during checkout inside an active transaction.
   */
  public static async processOrderRedemption(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    orderId: string,
    customerId: string,
    pointsToRedeem: number,
    loyaltyDiscount: Prisma.Decimal | number,
    actorId?: string,
  ) {
    if (pointsToRedeem <= 0) return;

    const account = await tx.loyaltyAccount.findUnique({
      where: { customerId },
    });

    if (!account || !account.isActive) {
      throw new AppError(
        'Customer loyalty account is inactive or not found',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (account.pointsBalance < pointsToRedeem) {
      throw new AppError(
        `Insufficient loyalty points. Balance: ${account.pointsBalance}, Requested: ${pointsToRedeem}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const newBalance = account.pointsBalance - pointsToRedeem;
    const discountDec = new Prisma.Decimal(loyaltyDiscount);

    await tx.loyaltyAccount.update({
      where: { id: account.id },
      data: {
        pointsBalance: newBalance,
        totalRedeemedPoints: { increment: pointsToRedeem },
      },
    });

    await tx.loyaltyTransaction.create({
      data: {
        restaurantId,
        accountId: account.id,
        customerId,
        orderId,
        type: 'REDEEM',
        points: -pointsToRedeem,
        pointsBalanceAfter: newBalance,
        monetaryValue: discountDec,
        reason: `Checkout redemption on order`,
        createdById: actorId ?? null,
      },
    });
  }

  /**
   * Awards points when an order is completed/paid. Idempotently skips if already awarded.
   */
  public static async processOrderEarning(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    order: {
      id: string;
      orderCode?: string;
      customerId?: string | null;
      subtotal: Prisma.Decimal;
      totalDiscount: Prisma.Decimal;
      grandTotal: Prisma.Decimal;
      paymentStatus: string;
    },
    actorId?: string,
  ) {
    if (!order.customerId) return;

    // Idempotency check: don't award points twice for same order
    const existingEarn = await tx.loyaltyTransaction.findFirst({
      where: {
        restaurantId,
        orderId: order.id,
        type: 'EARN',
      },
    });
    if (existingEarn) return;

    const program = await tx.loyaltyProgram.findUnique({
      where: { restaurantId },
    });
    if (!program || !program.isEnabled) return;

    // Calculate eligible spend (Net product spend after discounts)
    const netSpend = order.subtotal.minus(order.totalDiscount);
    if (netSpend.lessThanOrEqualTo(0) || netSpend.lessThan(program.minOrderSubtotal)) {
      return;
    }

    // Get customer account
    let account = await tx.loyaltyAccount.findUnique({
      where: { customerId: order.customerId },
      include: { tier: true },
    });

    if (!account) {
      account = await tx.loyaltyAccount.create({
        data: {
          restaurantId,
          customerId: order.customerId,
          pointsBalance: 0,
          lifetimePoints: 0,
          totalRedeemedPoints: 0,
          isActive: true,
        },
        include: { tier: true },
      });
    }

    if (!account.isActive) return;

    const multiplier = account.tier?.multiplier ?? 1.0;
    const basePoints = netSpend.toNumber() * program.pointsPerCurrencyUnit * multiplier;

    let pointsEarned = 0;
    if (program.roundingMode === 'CEIL') {
      pointsEarned = Math.ceil(basePoints);
    } else if (program.roundingMode === 'ROUND') {
      pointsEarned = Math.round(basePoints);
    } else {
      pointsEarned = Math.floor(basePoints);
    }

    if (pointsEarned <= 0) return;

    const newBalance = account.pointsBalance + pointsEarned;
    const newLifetime = account.lifetimePoints + pointsEarned;

    // Check tier progression
    const qualifyingTier = await tx.loyaltyTier.findFirst({
      where: {
        restaurantId,
        isActive: true,
        minPoints: { lte: newLifetime },
      },
      orderBy: { minPoints: 'desc' },
    });

    await tx.loyaltyAccount.update({
      where: { id: account.id },
      data: {
        pointsBalance: newBalance,
        lifetimePoints: newLifetime,
        tierId: qualifyingTier?.id ?? account.tierId,
      },
    });

    await tx.loyaltyTransaction.create({
      data: {
        restaurantId,
        accountId: account.id,
        customerId: order.customerId,
        orderId: order.id,
        type: 'EARN',
        points: pointsEarned,
        pointsBalanceAfter: newBalance,
        monetaryValue: netSpend,
        reason: `Points earned on Order ${order.orderCode ?? order.id}`,
        createdById: actorId ?? null,
      },
    });
  }

  /**
   * Reverses points when an order is cancelled or refunded.
   */
  public static async reverseOrderPoints(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    orderId: string,
    reason = 'Order cancelled / refunded',
    actorId?: string,
  ) {
    const transactions = await tx.loyaltyTransaction.findMany({
      where: { restaurantId, orderId },
    });

    for (const trx of transactions) {
      if (trx.type === 'EARN' && trx.points > 0) {
        // Reverse earned points
        const account = await tx.loyaltyAccount.findUnique({
          where: { id: trx.accountId },
        });
        if (account) {
          const newBal = Math.max(0, account.pointsBalance - trx.points);
          await tx.loyaltyAccount.update({
            where: { id: account.id },
            data: { pointsBalance: newBal },
          });

          await tx.loyaltyTransaction.create({
            data: {
              restaurantId,
              accountId: account.id,
              customerId: trx.customerId,
              orderId,
              type: 'REFUND_REVERSAL',
              points: -trx.points,
              pointsBalanceAfter: newBal,
              reason: `Earn reversal: ${reason}`,
              createdById: actorId ?? null,
            },
          });
        }
      } else if (trx.type === 'REDEEM' && trx.points < 0) {
        // Return redeemed points back to customer
        const pointsToRestore = Math.abs(trx.points);
        const account = await tx.loyaltyAccount.findUnique({
          where: { id: trx.accountId },
        });
        if (account) {
          const newBal = account.pointsBalance + pointsToRestore;
          await tx.loyaltyAccount.update({
            where: { id: account.id },
            data: {
              pointsBalance: newBal,
              totalRedeemedPoints: Math.max(0, account.totalRedeemedPoints - pointsToRestore),
            },
          });

          await tx.loyaltyTransaction.create({
            data: {
              restaurantId,
              accountId: account.id,
              customerId: trx.customerId,
              orderId,
              type: 'REFUND_REVERSAL',
              points: pointsToRestore,
              pointsBalanceAfter: newBal,
              reason: `Redemption refund: ${reason}`,
              createdById: actorId ?? null,
            },
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Manual Point Adjustment
  // ---------------------------------------------------------------------------

  /**
   * Manually adds or deducts points from a customer's loyalty balance.
   */
  public static async manualAdjustment(
    restaurantId: string,
    input: ManualPointAdjustmentInput,
    actor: AuthenticatedUserContext,
  ) {
    const hasDirectPermission = actor.permissions.includes('loyalty.adjust');
    let managerPinVerified = false;

    if (!hasDirectPermission) {
      if (input.managerPin) {
        await ManagerAuthService.verifyManagerPin({
          restaurantId,
          pin: input.managerPin,
          requiredPermission: 'loyalty.adjust',
        });
        managerPinVerified = true;
      } else {
        throw new AppError(
          'Manual point adjustments require loyalty.adjust permission or manager PIN authorization',
          HttpStatus.FORBIDDEN,
        );
      }
    }

    const account = await prisma.loyaltyAccount.findUnique({
      where: { customerId: input.customerId },
    });

    if (!account) {
      throw new AppError('Customer loyalty account not found', HttpStatus.NOT_FOUND);
    }

    const newBalance = Math.max(0, account.pointsBalance + input.points);
    const newLifetime =
      input.points > 0 ? account.lifetimePoints + input.points : account.lifetimePoints;

    const result = await prisma.$transaction(async (tx) => {
      // Check tier progression if positive
      let qualifyingTierId = account.tierId;
      if (input.points > 0) {
        const tier = await tx.loyaltyTier.findFirst({
          where: {
            restaurantId,
            isActive: true,
            minPoints: { lte: newLifetime },
          },
          orderBy: { minPoints: 'desc' },
        });
        if (tier) qualifyingTierId = tier.id;
      }

      const updatedAccount = await tx.loyaltyAccount.update({
        where: { id: account.id },
        data: {
          pointsBalance: newBalance,
          lifetimePoints: newLifetime,
          tierId: qualifyingTierId,
        },
        include: { tier: true },
      });

      const transaction = await tx.loyaltyTransaction.create({
        data: {
          restaurantId,
          accountId: account.id,
          customerId: input.customerId,
          type: 'MANUAL_ADJUSTMENT',
          points: input.points,
          pointsBalanceAfter: newBalance,
          reason: input.reason,
          managerPinVerified,
          createdById: actor.id,
        },
      });

      return { updatedAccount, transaction };
    });

    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'LOYALTY_POINTS_ADJUSTED',
      entityType: 'LOYALTY_ACCOUNT',
      entityId: account.id,
      metadata: {
        customerId: input.customerId,
        points: input.points,
        newBalance,
        reason: input.reason,
        managerPinVerified,
      },
    });

    return result;
  }

  // ---------------------------------------------------------------------------
  // 7. Transaction History & Program Summary
  // ---------------------------------------------------------------------------

  /**
   * Retrieves paginated point transaction history for a customer or restaurant.
   */
  public static async listTransactions(restaurantId: string, query: ListLoyaltyTransactionsQuery) {
    const { page, limit, customerId, type, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.LoyaltyTransactionWhereInput = {
      restaurantId,
      ...(customerId && { customerId }),
      ...(type && { type }),
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate && { gte: new Date(startDate) }),
              ...(endDate && { lte: new Date(endDate) }),
            },
          }
        : {}),
    };

    const [total, transactions] = await Promise.all([
      prisma.loyaltyTransaction.count({ where }),
      prisma.loyaltyTransaction.findMany({
        where,
        skip,
        take: limit,
        include: {
          customer: {
            select: { id: true, name: true, phone: true },
          },
          createdByUser: {
            select: { id: true, name: true, username: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      transactions: transactions.map((t) => ({
        ...t,
        monetaryValue: t.monetaryValue ? t.monetaryValue.toNumber() : null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Generates summary analytics of the loyalty program.
   */
  public static async getSummary(restaurantId: string) {
    const program = await this.getOrCreateProgram(restaurantId);

    const [totalMembers, activeMembers, pointAggregates, tierDistribution] = await Promise.all([
      prisma.loyaltyAccount.count({ where: { restaurantId } }),
      prisma.loyaltyAccount.count({ where: { restaurantId, isActive: true } }),
      prisma.loyaltyAccount.aggregate({
        where: { restaurantId },
        _sum: {
          pointsBalance: true,
          lifetimePoints: true,
          totalRedeemedPoints: true,
        },
      }),
      prisma.loyaltyTier.findMany({
        where: { restaurantId },
        select: {
          id: true,
          name: true,
          color: true,
          _count: { select: { accounts: true } },
        },
      }),
    ]);

    const totalIssued = pointAggregates._sum.lifetimePoints ?? 0;
    const totalRedeemed = pointAggregates._sum.totalRedeemedPoints ?? 0;
    const currentOutstanding = pointAggregates._sum.pointsBalance ?? 0;

    const outstandingCashLiability = new Prisma.Decimal(currentOutstanding)
      .mul(new Prisma.Decimal(program.redemptionRate))
      .toNumber();

    return {
      program: {
        isEnabled: program.isEnabled,
        programName: program.programName,
        redemptionRate: program.redemptionRate,
        pointsPerCurrencyUnit: program.pointsPerCurrencyUnit,
      },
      membership: {
        totalMembers,
        activeMembers,
      },
      points: {
        totalIssued,
        totalRedeemed,
        currentOutstanding,
        outstandingCashLiability,
      },
      tiers: tierDistribution.map((t) => ({
        tierId: t.id,
        name: t.name,
        color: t.color,
        membersCount: t._count.accounts,
      })),
    };
  }
}
