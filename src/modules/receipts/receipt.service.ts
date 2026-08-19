import { prisma } from '../../config/database.js';
import { NotFoundError } from '../../common/errors/app-error.js';
import { AuditService } from '../../common/services/audit.service.js';
import {
  CustomerReceiptQuery,
  KitchenTicketQuery,
  ReprintReceiptInput,
  PreviewReceiptQuery,
} from './receipt.schema.js';
import { ReceiptFormatterService } from './receipt-formatter.service.js';
import { AuthenticatedUserContext } from '../../common/types/index.js';

export class ReceiptService {
  /**
   * Helper to format standard order records into structured Customer Receipt DTO.
   */
  private static buildCustomerReceiptPayload(
    order: Record<string, unknown>,
    options: {
      isReprint?: boolean | undefined;
      reprintCount?: number | undefined;
      reprintReason?: string | undefined;
      reprintedBy?: string | undefined;
      paperWidth?: '80mm' | '58mm' | undefined;
    } = {},
  ) {
    const restaurant = (order.restaurant as Record<string, unknown>) || {};
    const table = (order.table as Record<string, unknown>) || undefined;
    const tableZone = (table?.zone as Record<string, unknown>) || undefined;
    const customer = (order.customer as Record<string, unknown>) || undefined;
    const createdByUser = (order.createdByUser as Record<string, unknown>) || undefined;
    const rawItems = Array.isArray(order.items) ? (order.items as Record<string, unknown>[]) : [];
    const activeItems = rawItems.filter((i) => i.status !== 'VOIDED');
    const rawPayments = Array.isArray(order.payments)
      ? (order.payments as Record<string, unknown>[])
      : [];

    const createdAt = new Date(order.createdAt as string | Date);
    const formattedDate = createdAt.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const formattedTime = createdAt.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const subtotal = Number(order.subtotal || 0);
    const itemDiscountsTotal = Number(order.itemDiscountsTotal || 0);
    const orderDiscountAmount = Number(order.orderDiscountAmount || 0);
    const totalDiscount = Number(order.totalDiscount || 0);
    const taxAmount = Number(order.taxAmount || 0);
    const taxRate = order.taxRate ? Number(order.taxRate) : null;
    const taxInclusive = Boolean(order.taxInclusive);
    const serviceChargeAmount = Number(order.serviceChargeAmount || 0);
    const serviceChargeRate = order.serviceChargeRate ? Number(order.serviceChargeRate) : null;
    const deliveryCharge = Number(order.deliveryCharge || 0);
    const packagingCharge = Number(order.packagingCharge || 0);
    const roundingAmount = Number(order.roundingAmount || 0);
    const grandTotal = Number(order.grandTotal || 0);
    const paidAmount = Number(order.paidAmount || 0);
    const changeAmount = Number(order.changeAmount || 0);
    const balanceDue = Math.max(0, grandTotal - paidAmount);

    const now = new Date();
    const paperWidth = options.paperWidth || '80mm';

    const payload = {
      title: options.isReprint ? 'DUPLICATE RECEIPT' : 'CUSTOMER RECEIPT',
      isReprint: Boolean(options.isReprint),
      reprintCount: options.reprintCount || 1,
      reprintReason: options.reprintReason || null,
      reprintedBy: options.reprintedBy || null,
      printedAt: now.toISOString(),
      restaurant: {
        id: String(restaurant.id || ''),
        name: String(restaurant.name || ''),
        legalName: restaurant.legalName ? String(restaurant.legalName) : null,
        phone: restaurant.phone ? String(restaurant.phone) : null,
        address: restaurant.address ? String(restaurant.address) : null,
        logo: restaurant.logo ? String(restaurant.logo) : null,
        currency: String(restaurant.currency || 'USD'),
        taxNumber: restaurant.taxNumber ? String(restaurant.taxNumber) : null,
        receiptHeader: restaurant.receiptHeader ? String(restaurant.receiptHeader) : null,
        receiptFooter: restaurant.receiptFooter ? String(restaurant.receiptFooter) : null,
      },
      metadata: {
        orderId: String(order.id),
        orderCode: String(order.orderCode),
        dailySequence: Number(order.dailySequence || 0),
        businessDate: String(order.businessDate),
        orderType: String(order.orderType),
        orderStatus: String(order.status),
        paymentStatus: String(order.paymentStatus),
        createdAt: createdAt.toISOString(),
        formattedDate,
        formattedTime,
        tableName: table?.name ? String(table.name) : null,
        zoneName: tableZone?.name ? String(tableZone.name) : null,
        guestCount: order.guestCount !== undefined ? Number(order.guestCount) : 1,
        tokenNumber:
          order.tokenNumber !== undefined && order.tokenNumber !== null
            ? Number(order.tokenNumber)
            : null,
        customerName: order.customerName
          ? String(order.customerName)
          : customer?.name
            ? String(customer.name)
            : null,
        customerPhone: order.customerPhone
          ? String(order.customerPhone)
          : customer?.phone
            ? String(customer.phone)
            : null,
        deliveryAddress: order.deliveryAddress
          ? String(order.deliveryAddress)
          : customer?.address
            ? String(customer.address)
            : null,
        cashierName: createdByUser?.name
          ? String(createdByUser.name)
          : createdByUser?.username
            ? String(createdByUser.username)
            : 'Cashier',
        barcodePayload: String(order.orderCode),
        qrPayload: JSON.stringify({
          orderCode: order.orderCode,
          total: grandTotal,
          date: order.businessDate,
        }),
      },
      items: activeItems.map((it) => {
        const rawMods = Array.isArray(it.modifiers)
          ? (it.modifiers as Record<string, unknown>[])
          : [];
        return {
          id: String(it.id),
          menuItemId: String(it.menuItemId),
          itemName: String(it.itemName),
          variantName: it.variantName ? String(it.variantName) : null,
          quantity: Number(it.quantity || 1),
          unitPrice: Number(it.unitPrice || 0),
          modifiersPrice: Number(it.modifiersPrice || 0),
          itemGrossTotal: Number(it.itemGrossTotal || 0),
          discountAmount: Number(it.discountAmount || 0),
          lineTotal: Number(it.itemNetTotal || 0),
          specialInstructions: it.specialInstructions ? String(it.specialInstructions) : null,
          modifiers: rawMods.map((m) => ({
            id: String(m.id),
            modifierOptionName: String(m.name || m.modifierOptionName || ''),
            priceAdjustment: Number(m.priceAdjustment || 0),
          })),
        };
      }),
      totals: {
        subtotal,
        itemDiscountsTotal,
        orderDiscountAmount,
        totalDiscount,
        taxRate,
        taxInclusive,
        taxAmount,
        serviceChargeRate,
        serviceChargeAmount,
        deliveryCharge,
        packagingCharge,
        roundingAmount,
        grandTotal,
        paidAmount,
        changeAmount,
        balanceDue,
      },
      payments: rawPayments.map((p) => ({
        id: String(p.id),
        paymentMethod: String(p.paymentMethod),
        amount: Number(p.amount || 0),
        amountTendered:
          p.amountTendered !== null && p.amountTendered !== undefined
            ? Number(p.amountTendered)
            : null,
        changeGiven:
          p.changeGiven !== null && p.changeGiven !== undefined ? Number(p.changeGiven) : null,
        reference: p.reference ? String(p.reference) : null,
        cardLast4: p.cardLast4 ? String(p.cardLast4) : null,
        cardBrand: p.cardBrand ? String(p.cardBrand) : null,
        createdAt: p.createdAt ? new Date(p.createdAt as string | Date).toISOString() : null,
      })),
      renderedSlip: '',
    };

    payload.renderedSlip = ReceiptFormatterService.formatCustomerSlip(
      payload as Record<string, unknown>,
      paperWidth,
    );
    return payload;
  }

  /**
   * 1. Generate Structured Customer Receipt & Formatted Slip.
   */
  public static async generateCustomerReceipt(
    restaurantId: string,
    orderId: string,
    query: CustomerReceiptQuery,
  ): Promise<Record<string, unknown>> {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: {
        restaurant: true,
        items: {
          where: { status: 'ACTIVE' },
          include: {
            modifiers: true,
          },
        },
        payments: {
          orderBy: { createdAt: 'asc' },
        },
        table: {
          include: { zone: true },
        },
        customer: true,
        createdByUser: {
          select: { id: true, name: true, username: true },
        },
        rider: {
          select: { id: true, name: true, phone: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundError(`Order with ID ${orderId} not found`);
    }

    return this.buildCustomerReceiptPayload(order as unknown as Record<string, unknown>, {
      paperWidth: query.paperWidth,
    });
  }

  /**
   * 2. Generate Kitchen Order Ticket (KOT) Slip.
   */
  public static async generateKitchenTicket(
    restaurantId: string,
    orderId: string,
    query: KitchenTicketQuery,
  ): Promise<Record<string, unknown>> {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: {
        restaurant: true,
        items: {
          where: { status: 'ACTIVE' },
          include: {
            modifiers: true,
            station: true,
            menuItem: { select: { categoryId: true } },
          },
        },
        table: {
          include: { zone: true },
        },
        createdByUser: {
          select: { id: true, name: true, username: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundError(`Order with ID ${orderId} not found`);
    }

    let stationName: string | undefined = undefined;
    let filteredItems = order.items;

    if (query.stationId) {
      const station = await prisma.kitchenStation.findFirst({
        where: { id: query.stationId, restaurantId },
        include: { categories: true },
      });

      if (station) {
        stationName = station.name;
        const stationCategoryIds = station.categories.map((c) => c.categoryId);
        filteredItems = order.items.filter(
          (it) =>
            it.stationId === query.stationId || stationCategoryIds.includes(it.menuItem.categoryId),
        );
      }
    }

    const tableObj = order.table;
    const createdAt = new Date(order.createdAt);
    const now = new Date();

    const payload = {
      title: 'KITCHEN ORDER TICKET (KOT)',
      stationId: query.stationId || null,
      stationName: stationName || null,
      printedAt: now.toISOString(),
      metadata: {
        orderId: order.id,
        orderCode: order.orderCode,
        orderType: order.orderType,
        tokenNumber:
          order.tokenNumber !== undefined && order.tokenNumber !== null
            ? Number(order.tokenNumber)
            : null,
        tableName: tableObj?.name ?? null,
        zoneName: tableObj?.zone?.name ?? null,
        guestCount: order.guestCount ?? 1,
        serverName: order.createdByUser?.name || order.createdByUser?.username || 'POS Station',
        notes: order.notes,
        formattedTime: createdAt.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      },
      items: filteredItems.map((it) => ({
        id: it.id,
        itemName: it.itemName,
        variantName: it.variantName,
        quantity: it.quantity,
        kitchenStatus: it.kitchenStatus,
        specialInstructions: it.specialInstructions,
        modifiers: it.modifiers.map((m) => ({
          id: m.id,
          modifierOptionName: m.name,
        })),
      })),
      renderedSlip: '',
    };

    payload.renderedSlip = ReceiptFormatterService.formatKitchenSlip(
      payload as Record<string, unknown>,
      query.paperWidth,
    );

    return payload;
  }

  /**
   * 3. Process Duplicate Receipt / Bill Reprint with Audit Log.
   */
  public static async reprintReceipt(
    restaurantId: string,
    orderId: string,
    input: ReprintReceiptInput,
    actor: AuthenticatedUserContext,
    ipAddress?: string,
  ): Promise<Record<string, unknown>> {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: {
        restaurant: true,
        items: {
          where: { status: 'ACTIVE' },
          include: { modifiers: true },
        },
        payments: {
          orderBy: { createdAt: 'asc' },
        },
        table: {
          include: { zone: true },
        },
        customer: true,
        createdByUser: {
          select: { id: true, name: true, username: true },
        },
        rider: {
          select: { id: true, name: true, phone: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundError(`Order with ID ${orderId} not found`);
    }

    // Count existing reprints from audit logs
    const previousReprintsCount = await prisma.auditLog.count({
      where: {
        restaurantId,
        entityType: 'ORDER',
        entityId: orderId,
        action: 'RECEIPT_REPRINTED',
      },
    });

    const reprintCount = previousReprintsCount + 1;

    // Audit Log
    await AuditService.log({
      restaurantId,
      userId: actor.id,
      action: 'RECEIPT_REPRINTED',
      entityType: 'ORDER',
      entityId: orderId,
      metadata: {
        orderCode: order.orderCode,
        reprintCount,
        reason: input.reason,
      },
      ipAddress,
    });

    return this.buildCustomerReceiptPayload(order as unknown as Record<string, unknown>, {
      isReprint: true,
      reprintCount,
      reprintReason: input.reason,
      reprintedBy: actor.username,
      paperWidth: input.paperWidth,
    });
  }

  /**
   * 4. Generate Mock/Preview Receipt using Restaurant Configuration.
   */
  public static async generatePreviewReceipt(
    restaurantId: string,
    query: PreviewReceiptQuery,
  ): Promise<Record<string, unknown>> {
    const restaurant = await prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
    });

    const now = new Date();
    const mockOrder: Record<string, unknown> = {
      id: '00000000-0000-0000-0000-000000000000',
      orderCode: 'PREVIEW-DEMO-001',
      dailySequence: 1,
      businessDate: now.toISOString().split('T')[0],
      orderType: query.sampleType,
      status: 'COMPLETED',
      paymentStatus: 'PAID',
      createdAt: now,
      subtotal: 45.0,
      itemDiscountsTotal: 0,
      orderDiscountAmount: 5.0,
      totalDiscount: 5.0,
      taxRate: restaurant.taxRate,
      taxInclusive: restaurant.taxInclusive,
      taxAmount: 4.0,
      serviceChargeRate: restaurant.serviceChargeRate,
      serviceChargeAmount: restaurant.serviceChargeEnabled ? 2.5 : 0,
      deliveryCharge: query.sampleType === 'DELIVERY' ? 3.0 : 0,
      packagingCharge: query.sampleType === 'TAKEAWAY' ? 1.0 : 0,
      roundingAmount: 0,
      grandTotal:
        query.sampleType === 'DELIVERY' ? 49.5 : query.sampleType === 'TAKEAWAY' ? 47.5 : 46.5,
      paidAmount: 50.0,
      changeAmount:
        query.sampleType === 'DELIVERY' ? 0.5 : query.sampleType === 'TAKEAWAY' ? 2.5 : 3.5,
      guestCount: 2,
      tokenNumber: query.sampleType === 'TAKEAWAY' ? 42 : null,
      customerName: query.sampleType !== 'DINE_IN' ? 'Demo Customer' : null,
      customerPhone: query.sampleType !== 'DINE_IN' ? '+1 555 0199' : null,
      deliveryAddress: query.sampleType === 'DELIVERY' ? '123 Main St, Suite 400' : null,
      restaurant,
      table:
        query.sampleType === 'DINE_IN' ? { name: 'T-01', zone: { name: 'Main Dining' } } : null,
      createdByUser: { name: 'Demo Staff', username: 'staff_demo' },
      items: [
        {
          id: 'item-1',
          menuItemId: 'menu-1',
          itemName: 'Signature Cheeseburger',
          variantName: 'Double Patty',
          quantity: 2,
          unitPrice: 15.0,
          modifiersPrice: 2.0,
          itemGrossTotal: 34.0,
          discountAmount: 0,
          itemNetTotal: 34.0,
          specialInstructions: 'Extra sauce on side',
          status: 'ACTIVE',
          modifiers: [{ id: 'mod-1', name: 'Cheddar Cheese Slice', priceAdjustment: 1.0 }],
        },
        {
          id: 'item-2',
          menuItemId: 'menu-2',
          itemName: 'Crispy French Fries',
          variantName: 'Large',
          quantity: 1,
          unitPrice: 5.0,
          modifiersPrice: 0,
          itemGrossTotal: 5.0,
          discountAmount: 0,
          itemNetTotal: 5.0,
          status: 'ACTIVE',
          modifiers: [],
        },
        {
          id: 'item-3',
          menuItemId: 'menu-3',
          itemName: 'Iced Lemon Tea',
          variantName: null,
          quantity: 2,
          unitPrice: 3.0,
          modifiersPrice: 0,
          itemGrossTotal: 6.0,
          discountAmount: 0,
          itemNetTotal: 6.0,
          status: 'ACTIVE',
          modifiers: [],
        },
      ],
      payments: [
        {
          id: 'payment-1',
          paymentMethod: 'CASH',
          amount: 50.0,
          amountTendered: 50.0,
          changeGiven: 3.5,
          reference: null,
          cardLast4: null,
          cardBrand: null,
          createdAt: now,
        },
      ],
    };

    return this.buildCustomerReceiptPayload(mockOrder, {
      paperWidth: query.paperWidth,
    });
  }
}
