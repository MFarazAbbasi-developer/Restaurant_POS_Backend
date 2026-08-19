import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import {
  BaseReportFilter,
  OrderTypeFilter,
  PaymentMethodFilter,
  ItemsRankingFilter,
} from './report.schema.js';

export class ReportService {
  /**
   * Helper to construct Order where clause for date filtering.
   */
  private static buildOrderWhere(
    restaurantId: string,
    filter: BaseReportFilter,
  ): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = { restaurantId };

    if (filter.startDate && filter.endDate) {
      where.businessDate = { gte: filter.startDate, lte: filter.endDate };
    } else if (filter.startDate) {
      where.businessDate = { gte: filter.startDate };
    } else if (filter.endDate) {
      where.businessDate = { lte: filter.endDate };
    }

    if (filter.from && filter.to) {
      where.createdAt = { gte: new Date(filter.from), lte: new Date(filter.to) };
    } else if (filter.from) {
      where.createdAt = { gte: new Date(filter.from) };
    } else if (filter.to) {
      where.createdAt = { lte: new Date(filter.to) };
    }

    return where;
  }

  /**
   * 1. Executive Sales Summary.
   */
  public static async getSalesSummary(restaurantId: string, filter: BaseReportFilter) {
    const baseWhere = this.buildOrderWhere(restaurantId, filter);

    const validOrdersWhere: Prisma.OrderWhereInput = {
      ...baseWhere,
      status: { notIn: ['CANCELLED', 'VOIDED'] },
    };

    const [validAgg, allStatusCounts, paymentsAgg] = await Promise.all([
      prisma.order.aggregate({
        where: validOrdersWhere,
        _sum: {
          subtotal: true,
          itemDiscountsTotal: true,
          orderDiscountAmount: true,
          totalDiscount: true,
          taxAmount: true,
          serviceChargeAmount: true,
          deliveryCharge: true,
          packagingCharge: true,
          roundingAmount: true,
          grandTotal: true,
          paidAmount: true,
          changeAmount: true,
        },
        _count: { id: true },
      }),
      prisma.order.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: { id: true },
        _sum: { grandTotal: true },
      }),
      prisma.payment.aggregate({
        where: {
          restaurantId,
          status: { not: 'VOIDED' },
          order: baseWhere,
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    const grossSales = Number(validAgg._sum.subtotal || 0);
    const itemDiscounts = Number(validAgg._sum.itemDiscountsTotal || 0);
    const orderDiscounts = Number(validAgg._sum.orderDiscountAmount || 0);
    const totalDiscounts = Number(validAgg._sum.totalDiscount || 0);
    const netSales = grossSales - totalDiscounts;
    const taxCollected = Number(validAgg._sum.taxAmount || 0);
    const serviceCharges = Number(validAgg._sum.serviceChargeAmount || 0);
    const deliveryCharges = Number(validAgg._sum.deliveryCharge || 0);
    const packagingCharges = Number(validAgg._sum.packagingCharge || 0);
    const rounding = Number(validAgg._sum.roundingAmount || 0);
    const grandTotal = Number(validAgg._sum.grandTotal || 0);
    const totalPaid = Number(validAgg._sum.paidAmount || 0);
    const validOrdersCount = validAgg._count.id;
    const averageOrderValue =
      validOrdersCount > 0 ? Number((grandTotal / validOrdersCount).toFixed(2)) : 0;

    let totalOrdersCount = 0;
    let completedOrdersCount = 0;
    let cancelledOrdersCount = 0;
    let cancelledValue = 0;
    let voidedOrdersCount = 0;
    let voidedValue = 0;

    for (const row of allStatusCounts) {
      totalOrdersCount += row._count.id;
      if (row.status === 'COMPLETED') completedOrdersCount = row._count.id;
      if (row.status === 'CANCELLED') {
        cancelledOrdersCount = row._count.id;
        cancelledValue = Number(row._sum.grandTotal || 0);
      }
      if (row.status === 'VOIDED') {
        voidedOrdersCount = row._count.id;
        voidedValue = Number(row._sum.grandTotal || 0);
      }
    }

    return {
      period: {
        startDate: filter.startDate || null,
        endDate: filter.endDate || null,
        from: filter.from || null,
        to: filter.to || null,
      },
      summary: {
        grossSales,
        itemDiscounts,
        orderDiscounts,
        totalDiscounts,
        netSales,
        taxCollected,
        serviceCharges,
        deliveryCharges,
        packagingCharges,
        rounding,
        grandTotal,
        totalPaid,
        outstandingBalance: Math.max(0, Number((grandTotal - totalPaid).toFixed(2))),
        totalPaymentsCollected: Number(paymentsAgg._sum.amount || 0),
        totalPaymentsCount: paymentsAgg._count.id,
      },
      ordersMetrics: {
        totalOrdersCount,
        validOrdersCount,
        completedOrdersCount,
        cancelledOrdersCount,
        cancelledValue,
        voidedOrdersCount,
        voidedValue,
        averageOrderValue,
      },
    };
  }

  /**
   * 2. Sales by Order Type (DINE_IN, TAKEAWAY, DELIVERY).
   */
  public static async getSalesByOrderType(restaurantId: string, filter: OrderTypeFilter) {
    const baseWhere = this.buildOrderWhere(restaurantId, filter);
    const where: Prisma.OrderWhereInput = {
      ...baseWhere,
      status: { notIn: ['CANCELLED', 'VOIDED'] },
    };

    if (filter.orderType) {
      where.orderType = filter.orderType;
    }

    const groups = await prisma.order.groupBy({
      by: ['orderType'],
      where,
      _sum: {
        subtotal: true,
        totalDiscount: true,
        taxAmount: true,
        serviceChargeAmount: true,
        deliveryCharge: true,
        packagingCharge: true,
        grandTotal: true,
        paidAmount: true,
      },
      _count: { id: true },
    });

    const totalRevenue = groups.reduce((acc, g) => acc + Number(g._sum.grandTotal || 0), 0);

    const breakdown = groups.map((g) => {
      const orderCount = g._count.id;
      const grossSales = Number(g._sum.subtotal || 0);
      const discounts = Number(g._sum.totalDiscount || 0);
      const netSales = grossSales - discounts;
      const tax = Number(g._sum.taxAmount || 0);
      const serviceCharge = Number(g._sum.serviceChargeAmount || 0);
      const deliveryCharge = Number(g._sum.deliveryCharge || 0);
      const packagingCharge = Number(g._sum.packagingCharge || 0);
      const grandTotal = Number(g._sum.grandTotal || 0);
      const paid = Number(g._sum.paidAmount || 0);
      const avgTicket = orderCount > 0 ? Number((grandTotal / orderCount).toFixed(2)) : 0;
      const percentageOfTotal =
        totalRevenue > 0 ? Number(((grandTotal / totalRevenue) * 100).toFixed(2)) : 0;

      return {
        orderType: g.orderType,
        orderCount,
        grossSales,
        discounts,
        netSales,
        tax,
        serviceCharge,
        deliveryCharge,
        packagingCharge,
        grandTotal,
        paid,
        averageTicket: avgTicket,
        percentageOfTotal,
      };
    });

    return {
      totalRevenue,
      channels: breakdown,
    };
  }

  /**
   * 3. Sales by Payment Method.
   */
  public static async getSalesByPaymentMethod(restaurantId: string, filter: PaymentMethodFilter) {
    const orderWhere = this.buildOrderWhere(restaurantId, filter);

    const paymentWhere: Prisma.PaymentWhereInput = {
      restaurantId,
      status: { not: 'VOIDED' },
      order: orderWhere,
    };

    if (filter.paymentMethod) {
      paymentWhere.paymentMethod = filter.paymentMethod;
    }

    const [paymentGroups, refundGroups] = await Promise.all([
      prisma.payment.groupBy({
        by: ['paymentMethod'],
        where: paymentWhere,
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.paymentRefund.groupBy({
        by: ['refundMethod'],
        where: {
          restaurantId,
          order: orderWhere,
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    const refundsMap = new Map<string, number>();
    for (const r of refundGroups) {
      if (r.refundMethod) {
        refundsMap.set(r.refundMethod, Number(r._sum.amount || 0));
      }
    }

    const totalCollected = paymentGroups.reduce((acc, p) => acc + Number(p._sum.amount || 0), 0);

    const methods = paymentGroups.map((p) => {
      const grossAmount = Number(p._sum.amount || 0);
      const refundAmount = refundsMap.get(p.paymentMethod) || 0;
      const netAmount = Math.max(0, grossAmount - refundAmount);
      const transactionCount = p._count.id;
      const percentageOfTotal =
        totalCollected > 0 ? Number(((grossAmount / totalCollected) * 100).toFixed(2)) : 0;

      return {
        paymentMethod: p.paymentMethod,
        transactionCount,
        grossAmount,
        refundAmount,
        netAmount,
        percentageOfTotal,
      };
    });

    return {
      totalCollected,
      methods,
    };
  }

  /**
   * 4. Product / Item Sales Ranking.
   */
  public static async getItemsRanking(restaurantId: string, filter: ItemsRankingFilter) {
    const orderWhere = this.buildOrderWhere(restaurantId, filter);

    const itemWhere: Prisma.OrderItemWhereInput = {
      status: 'ACTIVE',
      order: {
        ...orderWhere,
        status: { notIn: ['CANCELLED', 'VOIDED'] },
      },
    };

    if (filter.categoryId) {
      itemWhere.menuItem = { categoryId: filter.categoryId };
    }

    const itemGroups = await prisma.orderItem.groupBy({
      by: ['menuItemId'],
      where: itemWhere,
      _sum: {
        quantity: true,
        itemGrossTotal: true,
        discountAmount: true,
        itemNetTotal: true,
      },
      _count: { id: true },
    });

    if (itemGroups.length === 0) {
      return {
        totalItems: 0,
        page: filter.page,
        limit: filter.limit,
        totalPages: 0,
        items: [],
      };
    }

    const menuItemIds = itemGroups.map((g) => g.menuItemId);
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds } },
      select: {
        id: true,
        itemCode: true,
        name: true,
        basePrice: true,
        category: {
          select: { id: true, name: true },
        },
      },
    });

    const menuMap = new Map(menuItems.map((m) => [m.id, m]));
    const totalSalesVolume = itemGroups.reduce(
      (acc, g) => acc + Number(g._sum.itemNetTotal || 0),
      0,
    );

    const ranked = itemGroups.map((g) => {
      const meta = menuMap.get(g.menuItemId);
      const quantitySold = Number(g._sum.quantity || 0);
      const grossRevenue = Number(g._sum.itemGrossTotal || 0);
      const totalDiscount = Number(g._sum.discountAmount || 0);
      const netRevenue = Number(g._sum.itemNetTotal || 0);
      const revenueShare =
        totalSalesVolume > 0 ? Number(((netRevenue / totalSalesVolume) * 100).toFixed(2)) : 0;

      return {
        menuItemId: g.menuItemId,
        itemCode: meta?.itemCode ?? 'N/A',
        name: meta?.name ?? 'Unknown Item',
        categoryId: meta?.category?.id ?? null,
        categoryName: meta?.category?.name ?? 'Uncategorized',
        quantitySold,
        grossRevenue,
        totalDiscount,
        netRevenue,
        revenueShare,
      };
    });

    // Sort
    ranked.sort((a, b) => {
      const valA = filter.sortBy === 'quantity' ? a.quantitySold : a.netRevenue;
      const valB = filter.sortBy === 'quantity' ? b.quantitySold : b.netRevenue;
      return filter.sortOrder === 'asc' ? valA - valB : valB - valA;
    });

    // Paginate
    const totalItems = ranked.length;
    const totalPages = Math.ceil(totalItems / filter.limit);
    const startIndex = (filter.page - 1) * filter.limit;
    const paginatedItems = ranked.slice(startIndex, startIndex + filter.limit);

    return {
      totalItems,
      page: filter.page,
      limit: filter.limit,
      totalPages,
      totalSalesVolume,
      items: paginatedItems,
    };
  }

  /**
   * 5. Sales by Category.
   */
  public static async getCategorySales(restaurantId: string, filter: BaseReportFilter) {
    const orderWhere = this.buildOrderWhere(restaurantId, filter);

    const activeItems = await prisma.orderItem.findMany({
      where: {
        status: 'ACTIVE',
        order: {
          ...orderWhere,
          status: { notIn: ['CANCELLED', 'VOIDED'] },
        },
      },
      select: {
        quantity: true,
        itemGrossTotal: true,
        discountAmount: true,
        itemNetTotal: true,
        menuItem: {
          select: {
            category: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    const categoryMap = new Map<
      string,
      {
        categoryId: string;
        categoryName: string;
        itemsSold: number;
        grossRevenue: number;
        discountAmount: number;
        netRevenue: number;
      }
    >();

    let grandCategorySales = 0;

    for (const it of activeItems) {
      const catId = it.menuItem.category.id;
      const catName = it.menuItem.category.name;
      const net = Number(it.itemNetTotal);
      grandCategorySales += net;

      const existing = categoryMap.get(catId);
      if (!existing) {
        categoryMap.set(catId, {
          categoryId: catId,
          categoryName: catName,
          itemsSold: it.quantity,
          grossRevenue: Number(it.itemGrossTotal),
          discountAmount: Number(it.discountAmount),
          netRevenue: net,
        });
      } else {
        existing.itemsSold += it.quantity;
        existing.grossRevenue += Number(it.itemGrossTotal);
        existing.discountAmount += Number(it.discountAmount);
        existing.netRevenue += net;
      }
    }

    const categories = Array.from(categoryMap.values()).map((c) => ({
      ...c,
      revenueShare:
        grandCategorySales > 0 ? Number(((c.netRevenue / grandCategorySales) * 100).toFixed(2)) : 0,
    }));

    categories.sort((a, b) => b.netRevenue - a.netRevenue);

    return {
      totalCategoryRevenue: grandCategorySales,
      categories,
    };
  }

  /**
   * 6. Taxes, Discounts, Voids and Cancellations Audit.
   */
  public static async getFinancialAdjustmentsReport(
    restaurantId: string,
    filter: BaseReportFilter,
  ) {
    const baseWhere = this.buildOrderWhere(restaurantId, filter);

    const [validOrdersAgg, discountReasons, voidedItems, voidedOrders, cancelledOrders] =
      await Promise.all([
        prisma.order.aggregate({
          where: {
            ...baseWhere,
            status: { notIn: ['CANCELLED', 'VOIDED'] },
          },
          _sum: {
            subtotal: true,
            itemDiscountsTotal: true,
            orderDiscountAmount: true,
            totalDiscount: true,
            taxAmount: true,
            serviceChargeAmount: true,
          },
          _count: { id: true },
        }),
        prisma.order.groupBy({
          by: ['orderDiscountReason'],
          where: {
            ...baseWhere,
            orderDiscountAmount: { gt: 0 },
            status: { notIn: ['CANCELLED', 'VOIDED'] },
          },
          _sum: { orderDiscountAmount: true },
          _count: { id: true },
        }),
        prisma.orderItem.findMany({
          where: {
            status: 'VOIDED',
            order: baseWhere,
          },
          select: {
            id: true,
            itemName: true,
            quantity: true,
            itemGrossTotal: true,
            voidReason: true,
          },
        }),
        prisma.order.findMany({
          where: {
            ...baseWhere,
            status: 'VOIDED',
          },
          select: {
            id: true,
            orderCode: true,
            grandTotal: true,
            voidReason: true,
          },
        }),
        prisma.order.findMany({
          where: {
            ...baseWhere,
            status: 'CANCELLED',
          },
          select: {
            id: true,
            orderCode: true,
            grandTotal: true,
            cancelReason: true,
          },
        }),
      ]);

    // Voids aggregation
    const totalVoidedItemsCount = voidedItems.reduce((acc, i) => acc + i.quantity, 0);
    const totalVoidedItemsValue = voidedItems.reduce((acc, i) => acc + Number(i.itemGrossTotal), 0);
    const totalVoidedOrdersCount = voidedOrders.length;
    const totalVoidedOrdersValue = voidedOrders.reduce((acc, o) => acc + Number(o.grandTotal), 0);

    const voidReasonsMap = new Map<string, number>();
    for (const v of voidedItems) {
      const reason = v.voidReason || 'Not specified';
      voidReasonsMap.set(reason, (voidReasonsMap.get(reason) || 0) + 1);
    }

    // Cancellations aggregation
    const totalCancelledOrdersCount = cancelledOrders.length;
    const totalCancelledOrdersValue = cancelledOrders.reduce(
      (acc, o) => acc + Number(o.grandTotal),
      0,
    );
    const cancelReasonsMap = new Map<string, number>();
    for (const c of cancelledOrders) {
      const reason = c.cancelReason || 'Not specified';
      cancelReasonsMap.set(reason, (cancelReasonsMap.get(reason) || 0) + 1);
    }

    return {
      taxes: {
        totalTaxCollected: Number(validOrdersAgg._sum.taxAmount || 0),
        totalServiceCharges: Number(validOrdersAgg._sum.serviceChargeAmount || 0),
        taxableSubtotal: Number(validOrdersAgg._sum.subtotal || 0),
      },
      discounts: {
        itemDiscountsTotal: Number(validOrdersAgg._sum.itemDiscountsTotal || 0),
        orderDiscountsTotal: Number(validOrdersAgg._sum.orderDiscountAmount || 0),
        totalDiscounts: Number(validOrdersAgg._sum.totalDiscount || 0),
        reasonsBreakdown: discountReasons.map((d) => ({
          reason: d.orderDiscountReason || 'General Promotion',
          amount: Number(d._sum.orderDiscountAmount || 0),
          ordersCount: d._count.id,
        })),
      },
      voids: {
        voidedItemsCount: totalVoidedItemsCount,
        voidedItemsValue: totalVoidedItemsValue,
        voidedOrdersCount: totalVoidedOrdersCount,
        voidedOrdersValue: totalVoidedOrdersValue,
        reasonsBreakdown: Array.from(voidReasonsMap.entries()).map(([reason, count]) => ({
          reason,
          count,
        })),
      },
      cancellations: {
        cancelledOrdersCount: totalCancelledOrdersCount,
        cancelledOrdersValue: totalCancelledOrdersValue,
        reasonsBreakdown: Array.from(cancelReasonsMap.entries()).map(([reason, count]) => ({
          reason,
          count,
        })),
      },
    };
  }

  /**
   * 7. Hourly Sales & Traffic Trends.
   */
  public static async getHourlyTrends(restaurantId: string, filter: BaseReportFilter) {
    const baseWhere = this.buildOrderWhere(restaurantId, filter);

    const orders = await prisma.order.findMany({
      where: {
        ...baseWhere,
        status: { notIn: ['CANCELLED', 'VOIDED'] },
      },
      select: {
        createdAt: true,
        subtotal: true,
        totalDiscount: true,
        grandTotal: true,
      },
    });

    const hourlyBuckets = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      hourLabel: `${String(i).padStart(2, '0')}:00 - ${String(i).padStart(2, '0')}:59`,
      orderCount: 0,
      grossSales: 0,
      netSales: 0,
      grandTotal: 0,
    }));

    for (const o of orders) {
      const hour = new Date(o.createdAt).getHours();
      const bucket = hourlyBuckets[hour];
      if (bucket) {
        bucket.orderCount += 1;
        const gross = Number(o.subtotal);
        const discount = Number(o.totalDiscount);
        bucket.grossSales += gross;
        bucket.netSales += gross - discount;
        bucket.grandTotal += Number(o.grandTotal);
      }
    }

    // Find peak hour
    let peakHour = 0;
    let maxRevenue = 0;
    for (const b of hourlyBuckets) {
      if (b.grandTotal > maxRevenue) {
        maxRevenue = b.grandTotal;
        peakHour = b.hour;
      }
    }

    return {
      totalOrders: orders.length,
      peakHour: {
        hour: peakHour,
        hourLabel: hourlyBuckets[peakHour]?.hourLabel ?? '',
        revenue: maxRevenue,
      },
      hourlyDistribution: hourlyBuckets,
    };
  }

  /**
   * 8. Staff & Cashier Performance.
   */
  public static async getStaffPerformance(restaurantId: string, filter: BaseReportFilter) {
    const baseWhere = this.buildOrderWhere(restaurantId, filter);

    const [orderGroups, shifts] = await Promise.all([
      prisma.order.groupBy({
        by: ['createdById'],
        where: {
          ...baseWhere,
          status: { notIn: ['CANCELLED', 'VOIDED'] },
          createdById: { not: null },
        },
        _sum: {
          subtotal: true,
          totalDiscount: true,
          grandTotal: true,
        },
        _count: { id: true },
      }),
      prisma.cashierShift.findMany({
        where: {
          restaurantId,
          ...(filter.startDate && filter.endDate
            ? { businessDate: { gte: filter.startDate, lte: filter.endDate } }
            : {}),
        },
        select: {
          cashierId: true,
          status: true,
        },
      }),
    ]);

    const shiftsMap = new Map<string, number>();
    for (const s of shifts) {
      shiftsMap.set(s.cashierId, (shiftsMap.get(s.cashierId) || 0) + 1);
    }

    const userIds = orderGroups.map((g) => g.createdById).filter((id): id is string => id !== null);

    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, username: true },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    const staffMetrics = orderGroups.map((g) => {
      const staffId = g.createdById!;
      const user = userMap.get(staffId);
      const ordersProcessed = g._count.id;
      const grossSales = Number(g._sum.subtotal || 0);
      const totalDiscounts = Number(g._sum.totalDiscount || 0);
      const totalRevenue = Number(g._sum.grandTotal || 0);
      const shiftsCount = shiftsMap.get(staffId) || 0;

      return {
        staffId,
        name: user?.name ?? 'Unknown',
        username: user?.username ?? 'unknown',
        shiftsCount,
        ordersProcessed,
        grossSales,
        totalDiscounts,
        totalRevenue,
      };
    });

    staffMetrics.sort((a, b) => b.totalRevenue - a.totalRevenue);

    return {
      staff: staffMetrics,
    };
  }

  /**
   * 9. Shift Settlement Summary.
   */
  public static async getShiftsSummary(restaurantId: string, filter: BaseReportFilter) {
    const shiftWhere: Prisma.CashierShiftWhereInput = { restaurantId };

    if (filter.startDate && filter.endDate) {
      shiftWhere.businessDate = { gte: filter.startDate, lte: filter.endDate };
    } else if (filter.startDate) {
      shiftWhere.businessDate = { gte: filter.startDate };
    } else if (filter.endDate) {
      shiftWhere.businessDate = { lte: filter.endDate };
    }

    const [agg, shifts] = await Promise.all([
      prisma.cashierShift.aggregate({
        where: shiftWhere,
        _sum: {
          openingCash: true,
          cashSales: true,
          cashRefunds: true,
          cashDrops: true,
          cashAdjustments: true,
          expectedClosingCash: true,
          actualClosingCash: true,
          variance: true,
        },
        _count: { id: true },
      }),
      prisma.cashierShift.findMany({
        where: shiftWhere,
        orderBy: [{ openedAt: 'desc' }],
        take: 50,
        include: {
          cashier: { select: { name: true, username: true } },
        },
      }),
    ]);

    return {
      summary: {
        totalShifts: agg._count.id,
        totalOpeningCash: Number(agg._sum.openingCash || 0),
        totalCashSales: Number(agg._sum.cashSales || 0),
        totalCashRefunds: Number(agg._sum.cashRefunds || 0),
        totalCashDrops: Number(agg._sum.cashDrops || 0),
        totalCashAdjustments: Number(agg._sum.cashAdjustments || 0),
        totalExpectedCash: Number(agg._sum.expectedClosingCash || 0),
        totalActualCash: Number(agg._sum.actualClosingCash || 0),
        totalVariance: Number(agg._sum.variance || 0),
      },
      shifts: shifts.map((s) => ({
        id: s.id,
        registerName: s.registerName,
        businessDate: s.businessDate,
        status: s.status,
        cashierName: s.cashier.name,
        openedAt: s.openedAt.toISOString(),
        closedAt: s.closedAt ? s.closedAt.toISOString() : null,
        openingCash: Number(s.openingCash),
        cashSales: Number(s.cashSales),
        cashDrops: Number(s.cashDrops),
        expectedClosingCash: s.expectedClosingCash ? Number(s.expectedClosingCash) : null,
        actualClosingCash: s.actualClosingCash ? Number(s.actualClosingCash) : null,
        variance: s.variance ? Number(s.variance) : null,
      })),
    };
  }

  /**
   * 10. Delivery and Takeaway Operational Performance.
   */
  public static async getOperationsPerformance(restaurantId: string, filter: BaseReportFilter) {
    const baseWhere = this.buildOrderWhere(restaurantId, filter);

    const [deliveryOrders, takeawayCount] = await Promise.all([
      prisma.order.findMany({
        where: {
          ...baseWhere,
          orderType: 'DELIVERY',
        },
        select: {
          id: true,
          status: true,
          deliveryCharge: true,
          riderId: true,
          rider: { select: { id: true, name: true, phone: true } },
        },
      }),
      prisma.order.count({
        where: {
          ...baseWhere,
          orderType: 'TAKEAWAY',
          status: { notIn: ['CANCELLED', 'VOIDED'] },
        },
      }),
    ]);

    const totalDeliveries = deliveryOrders.length;
    const completedDeliveries = deliveryOrders.filter(
      (d) => d.status === 'COMPLETED' || d.status === 'SERVED',
    ).length;
    const cancelledDeliveries = deliveryOrders.filter((d) => d.status === 'CANCELLED').length;
    const totalDeliveryFees = deliveryOrders.reduce((acc, d) => acc + Number(d.deliveryCharge), 0);

    const riderMap = new Map<string, { riderName: string; deliveriesCount: number }>();
    for (const d of deliveryOrders) {
      if (d.rider) {
        const existing = riderMap.get(d.rider.id);
        if (!existing) {
          riderMap.set(d.rider.id, {
            riderName: d.rider.name,
            deliveriesCount: 1,
          });
        } else {
          existing.deliveriesCount += 1;
        }
      }
    }

    return {
      takeaway: {
        totalOrders: takeawayCount,
      },
      delivery: {
        totalOrders: totalDeliveries,
        completedDeliveries,
        cancelledDeliveries,
        totalDeliveryFees,
        ridersBreakdown: Array.from(riderMap.values()),
      },
    };
  }
}
