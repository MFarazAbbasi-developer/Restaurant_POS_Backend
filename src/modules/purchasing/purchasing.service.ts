import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import { AuditService } from '../../common/services/audit.service.js';
import { RealtimeService } from '../../common/services/realtime.service.js';
import {
  CreateSupplierInput,
  UpdateSupplierInput,
  ListSuppliersQuery,
  CreatePurchaseOrderInput,
  UpdatePurchaseOrderInput,
  ReceiveGoodsInput,
  CreatePurchaseReturnInput,
  ListPurchasesQuery,
  PurchasingSummaryQuery,
} from './purchasing.schema.js';

export class PurchasingService {
  // ===========================================================================
  // 1. Supplier Management
  // ===========================================================================

  public static async createSupplier(
    restaurantId: string,
    input: CreateSupplierInput,
    actorId?: string,
  ) {
    const existing = await prisma.supplier.findUnique({
      where: {
        restaurantId_name: {
          restaurantId,
          name: input.name.trim(),
        },
      },
    });

    if (existing) {
      throw new ConflictError(`Supplier with name "${input.name.trim()}" already exists`);
    }

    const supplier = await prisma.supplier.create({
      data: {
        restaurantId,
        name: input.name.trim(),
        contactPerson: input.contactPerson?.trim() ?? null,
        phone: input.phone?.trim() ?? null,
        email: input.email?.trim() ?? null,
        address: input.address?.trim() ?? null,
        taxNumber: input.taxNumber?.trim() ?? null,
        isActive: input.isActive ?? true,
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'SUPPLIER_CREATED',
      entityType: 'SUPPLIER',
      entityId: supplier.id,
      metadata: { name: supplier.name },
    });

    RealtimeService.emitToRestaurant(restaurantId, 'supplier:created', { supplier });

    return supplier;
  }

  public static async listSuppliers(restaurantId: string, query: ListSuppliersQuery) {
    const { page, limit, search, isActive } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.SupplierWhereInput = {
      restaurantId,
      ...(isActive !== undefined ? { isActive } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { contactPerson: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, suppliers] = await Promise.all([
      prisma.supplier.count({ where }),
      prisma.supplier.findMany({
        where,
        skip,
        take: limit,
        include: {
          _count: {
            select: {
              inventoryItems: true,
              purchaseOrders: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      items: suppliers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  public static async getSupplier(restaurantId: string, id: string) {
    const supplier = await prisma.supplier.findFirst({
      where: { id, restaurantId },
      include: {
        inventoryItems: {
          where: { isActive: true },
          select: {
            id: true,
            itemCode: true,
            name: true,
            unit: true,
            costPerUnit: true,
            currentStock: true,
          },
        },
        purchaseOrders: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true,
            totalCost: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            inventoryItems: true,
            purchaseOrders: true,
          },
        },
      },
    });

    if (!supplier) {
      throw new NotFoundError('Supplier not found');
    }

    return supplier;
  }

  public static async updateSupplier(
    restaurantId: string,
    id: string,
    input: UpdateSupplierInput,
    actorId?: string,
  ) {
    const supplier = await prisma.supplier.findFirst({
      where: { id, restaurantId },
    });

    if (!supplier) {
      throw new NotFoundError('Supplier not found');
    }

    if (input.name && input.name.trim() !== supplier.name) {
      const existing = await prisma.supplier.findUnique({
        where: {
          restaurantId_name: {
            restaurantId,
            name: input.name.trim(),
          },
        },
      });

      if (existing) {
        throw new ConflictError(`Supplier with name "${input.name.trim()}" already exists`);
      }
    }

    const updated = await prisma.supplier.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.contactPerson !== undefined
          ? { contactPerson: input.contactPerson?.trim() ?? null }
          : {}),
        ...(input.phone !== undefined ? { phone: input.phone?.trim() ?? null } : {}),
        ...(input.email !== undefined ? { email: input.email?.trim() ?? null } : {}),
        ...(input.address !== undefined ? { address: input.address?.trim() ?? null } : {}),
        ...(input.taxNumber !== undefined ? { taxNumber: input.taxNumber?.trim() ?? null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'SUPPLIER_UPDATED',
      entityType: 'SUPPLIER',
      entityId: id,
      metadata: { changes: input },
    });

    RealtimeService.emitToRestaurant(restaurantId, 'supplier:updated', { supplier: updated });

    return updated;
  }

  public static async deleteSupplier(restaurantId: string, id: string, actorId?: string) {
    const supplier = await prisma.supplier.findFirst({
      where: { id, restaurantId },
    });

    if (!supplier) {
      throw new NotFoundError('Supplier not found');
    }

    const updated = await prisma.supplier.update({
      where: { id },
      data: { isActive: false },
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'SUPPLIER_DEACTIVATED',
      entityType: 'SUPPLIER',
      entityId: id,
    });

    return updated;
  }

  public static async getSupplierPurchaseHistory(restaurantId: string, id: string) {
    const supplier = await prisma.supplier.findFirst({
      where: { id, restaurantId },
    });

    if (!supplier) {
      throw new NotFoundError('Supplier not found');
    }

    const orders = await prisma.purchaseOrder.findMany({
      where: { restaurantId, supplierId: id },
      include: {
        items: {
          include: {
            inventoryItem: { select: { id: true, itemCode: true, name: true, unit: true } },
          },
        },
        returns: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    let totalSpent = new Prisma.Decimal(0);
    let totalReceivedOrders = 0;
    let totalPendingOrders = 0;

    for (const ord of orders) {
      if (ord.status === 'RECEIVED' || ord.status === 'PARTIALLY_RECEIVED') {
        totalSpent = totalSpent.add(ord.totalAmount.gt(0) ? ord.totalAmount : ord.totalCost);
        totalReceivedOrders++;
      } else if (ord.status === 'ORDERED' || ord.status === 'DRAFT') {
        totalPendingOrders++;
      }
    }

    return {
      supplier: {
        id: supplier.id,
        name: supplier.name,
        contactPerson: supplier.contactPerson,
        phone: supplier.phone,
        email: supplier.email,
      },
      summary: {
        totalOrders: orders.length,
        totalReceivedOrders,
        totalPendingOrders,
        totalSpent: totalSpent.toNumber(),
      },
      orders,
    };
  }

  // ===========================================================================
  // 2. Purchase Orders Workflow
  // ===========================================================================

  private static generateOrderNumber(date: Date, countToday: number): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const seq = String(countToday + 1).padStart(3, '0');
    return `PO-${y}${m}${d}-${seq}`;
  }

  private static generateReturnNumber(date: Date, countToday: number): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const seq = String(countToday + 1).padStart(3, '0');
    return `PR-${y}${m}${d}-${seq}`;
  }

  public static async createPurchaseOrder(
    restaurantId: string,
    input: CreatePurchaseOrderInput,
    actorId?: string,
  ) {
    if (input.supplierId) {
      const supplier = await prisma.supplier.findFirst({
        where: { id: input.supplierId, restaurantId },
      });
      if (!supplier) throw new NotFoundError('Supplier not found');
    }

    if (input.locationId) {
      const location = await prisma.stockLocation.findFirst({
        where: { id: input.locationId, restaurantId },
      });
      if (!location) throw new NotFoundError('Stock location not found');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const countToday = await prisma.purchaseOrder.count({
      where: { restaurantId, createdAt: { gte: today } },
    });
    const orderNumber = this.generateOrderNumber(new Date(), countToday);

    // Compute line items
    let grandSubtotal = new Prisma.Decimal(0);
    let grandDiscount = new Prisma.Decimal(0);
    let grandTax = new Prisma.Decimal(0);
    let grandTotal = new Prisma.Decimal(0);

    const computedItems: {
      inventoryItemId: string;
      quantity: Prisma.Decimal;
      quantityReceived: Prisma.Decimal;
      unitCost: Prisma.Decimal;
      taxRate: Prisma.Decimal;
      discountRate: Prisma.Decimal;
      subtotal: Prisma.Decimal;
      totalCost: Prisma.Decimal;
    }[] = [];

    const isAutoReceived = input.status === 'RECEIVED';

    for (const item of input.items) {
      const invItem = await prisma.inventoryItem.findFirst({
        where: { id: item.inventoryItemId, restaurantId },
      });
      if (!invItem) {
        throw new NotFoundError(`Inventory item '${item.inventoryItemId}' not found`);
      }

      const qty = new Prisma.Decimal(item.quantity);
      const cost = new Prisma.Decimal(item.unitCost);
      const taxRate = new Prisma.Decimal(item.taxRate ?? 0);
      const discountRate = new Prisma.Decimal(item.discountRate ?? 0);

      const lineSubtotal = qty.mul(cost);
      const lineDiscount = lineSubtotal.mul(discountRate.div(100));
      const taxable = lineSubtotal.sub(lineDiscount);
      const lineTax = taxable.mul(taxRate.div(100));
      const lineTotal = taxable.add(lineTax);

      grandSubtotal = grandSubtotal.add(lineSubtotal);
      grandDiscount = grandDiscount.add(lineDiscount);
      grandTax = grandTax.add(lineTax);
      grandTotal = grandTotal.add(lineTotal);

      computedItems.push({
        inventoryItemId: item.inventoryItemId,
        quantity: qty,
        quantityReceived: isAutoReceived ? qty : new Prisma.Decimal(0),
        unitCost: cost,
        taxRate,
        discountRate,
        subtotal: lineSubtotal,
        totalCost: lineTotal,
      });
    }

    const purchaseOrder = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          restaurantId,
          supplierId: input.supplierId ?? null,
          locationId: input.locationId ?? null,
          orderNumber,
          invoiceNumber: input.invoiceNumber?.trim() ?? null,
          status: input.status ?? 'ORDERED',
          subtotal: grandSubtotal,
          taxAmount: grandTax,
          discountAmount: grandDiscount,
          totalAmount: grandTotal,
          totalCost: grandTotal,
          orderedAt: input.status === 'ORDERED' || input.status === 'RECEIVED' ? new Date() : null,
          expectedDeliveryDate: input.expectedDeliveryDate
            ? new Date(input.expectedDeliveryDate)
            : null,
          receivedAt: isAutoReceived ? new Date() : null,
          notes: input.notes?.trim() ?? null,
          createdById: actorId ?? null,
          items: {
            create: computedItems.map((it) => ({
              inventoryItemId: it.inventoryItemId,
              quantity: it.quantity,
              quantityReceived: it.quantityReceived,
              unitCost: it.unitCost,
              taxRate: it.taxRate,
              discountRate: it.discountRate,
              subtotal: it.subtotal,
              totalCost: it.totalCost,
            })),
          },
        },
        include: {
          items: {
            include: {
              inventoryItem: { select: { id: true, itemCode: true, name: true, unit: true } },
            },
          },
          supplier: true,
          location: true,
        },
      });

      // If created directly in RECEIVED status, update inventory stock and create stock movements
      if (isAutoReceived) {
        for (const it of computedItems) {
          const currentItem = await tx.inventoryItem.findUniqueOrThrow({
            where: { id: it.inventoryItemId },
          });

          const newStock = currentItem.currentStock.add(it.quantity);

          await tx.inventoryItem.update({
            where: { id: currentItem.id },
            data: {
              currentStock: newStock,
              costPerUnit: it.unitCost,
            },
          });

          await tx.stockMovement.create({
            data: {
              restaurantId,
              inventoryItemId: currentItem.id,
              toLocationId: input.locationId ?? currentItem.locationId ?? null,
              type: 'PURCHASE_RECEIPT',
              quantityChange: it.quantity,
              balanceAfter: newStock,
              unitCost: it.unitCost,
              totalCost: it.totalCost,
              referenceType: 'PURCHASE_ORDER',
              referenceId: po.id,
              reason: `Direct Purchase Receipt ${orderNumber}`,
              createdById: actorId ?? null,
            },
          });
        }
      }

      return po;
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'PURCHASE_ORDER_CREATED',
      entityType: 'PURCHASE_ORDER',
      entityId: purchaseOrder.id,
      metadata: {
        orderNumber: purchaseOrder.orderNumber,
        status: purchaseOrder.status,
        totalAmount: purchaseOrder.totalAmount,
      },
    });

    RealtimeService.emitToRestaurant(restaurantId, 'purchasing:created', { purchaseOrder });

    return purchaseOrder;
  }

  public static async updatePurchaseOrder(
    restaurantId: string,
    id: string,
    input: UpdatePurchaseOrderInput,
    actorId?: string,
  ) {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id, restaurantId },
      include: { items: true },
    });

    if (!po) throw new NotFoundError('Purchase order not found');

    if (po.status !== 'DRAFT' && po.status !== 'ORDERED') {
      throw new BadRequestError(`Cannot edit a purchase order that is in ${po.status} status`);
    }

    const hasReceivedItems = po.items.some((i) => i.quantityReceived.gt(0));
    if (hasReceivedItems) {
      throw new BadRequestError(
        'Cannot edit items for a purchase order with partially received stock',
      );
    }

    let grandSubtotal = po.subtotal;
    let grandDiscount = po.discountAmount;
    let grandTax = po.taxAmount;
    let grandTotal = po.totalAmount;

    let computedItems:
      | {
          inventoryItemId: string;
          quantity: Prisma.Decimal;
          quantityReceived: Prisma.Decimal;
          unitCost: Prisma.Decimal;
          taxRate: Prisma.Decimal;
          discountRate: Prisma.Decimal;
          subtotal: Prisma.Decimal;
          totalCost: Prisma.Decimal;
        }[]
      | undefined;

    if (input.items && input.items.length > 0) {
      grandSubtotal = new Prisma.Decimal(0);
      grandDiscount = new Prisma.Decimal(0);
      grandTax = new Prisma.Decimal(0);
      grandTotal = new Prisma.Decimal(0);
      computedItems = [];

      for (const item of input.items) {
        const invItem = await prisma.inventoryItem.findFirst({
          where: { id: item.inventoryItemId, restaurantId },
        });
        if (!invItem) {
          throw new NotFoundError(`Inventory item '${item.inventoryItemId}' not found`);
        }

        const qty = new Prisma.Decimal(item.quantity);
        const cost = new Prisma.Decimal(item.unitCost);
        const taxRate = new Prisma.Decimal(item.taxRate ?? 0);
        const discountRate = new Prisma.Decimal(item.discountRate ?? 0);

        const lineSubtotal = qty.mul(cost);
        const lineDiscount = lineSubtotal.mul(discountRate.div(100));
        const taxable = lineSubtotal.sub(lineDiscount);
        const lineTax = taxable.mul(taxRate.div(100));
        const lineTotal = taxable.add(lineTax);

        grandSubtotal = grandSubtotal.add(lineSubtotal);
        grandDiscount = grandDiscount.add(lineDiscount);
        grandTax = grandTax.add(lineTax);
        grandTotal = grandTotal.add(lineTotal);

        computedItems.push({
          inventoryItemId: item.inventoryItemId,
          quantity: qty,
          quantityReceived: new Prisma.Decimal(0),
          unitCost: cost,
          taxRate,
          discountRate,
          subtotal: lineSubtotal,
          totalCost: lineTotal,
        });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (computedItems) {
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          ...(input.supplierId !== undefined ? { supplierId: input.supplierId ?? null } : {}),
          ...(input.locationId !== undefined ? { locationId: input.locationId ?? null } : {}),
          ...(input.invoiceNumber !== undefined
            ? { invoiceNumber: input.invoiceNumber?.trim() ?? null }
            : {}),
          ...(input.expectedDeliveryDate !== undefined
            ? {
                expectedDeliveryDate: input.expectedDeliveryDate
                  ? new Date(input.expectedDeliveryDate)
                  : null,
              }
            : {}),
          ...(input.notes !== undefined ? { notes: input.notes?.trim() ?? null } : {}),
          subtotal: grandSubtotal,
          taxAmount: grandTax,
          discountAmount: grandDiscount,
          totalAmount: grandTotal,
          totalCost: grandTotal,
          ...(computedItems
            ? {
                items: {
                  create: computedItems.map((it) => ({
                    inventoryItemId: it.inventoryItemId,
                    quantity: it.quantity,
                    quantityReceived: it.quantityReceived,
                    unitCost: it.unitCost,
                    taxRate: it.taxRate,
                    discountRate: it.discountRate,
                    subtotal: it.subtotal,
                    totalCost: it.totalCost,
                  })),
                },
              }
            : {}),
        },
        include: {
          items: {
            include: {
              inventoryItem: { select: { id: true, itemCode: true, name: true, unit: true } },
            },
          },
          supplier: true,
          location: true,
        },
      });
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'PURCHASE_ORDER_UPDATED',
      entityType: 'PURCHASE_ORDER',
      entityId: id,
    });

    RealtimeService.emitToRestaurant(restaurantId, 'purchasing:updated', {
      purchaseOrder: updated,
    });

    return updated;
  }

  public static async orderPurchaseOrder(restaurantId: string, id: string, actorId?: string) {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id, restaurantId },
    });

    if (!po) throw new NotFoundError('Purchase order not found');

    if (po.status !== 'DRAFT') {
      throw new BadRequestError(`Cannot send order for purchase order in status ${po.status}`);
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: 'ORDERED',
        orderedAt: new Date(),
      },
      include: { items: true, supplier: true },
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'PURCHASE_ORDER_SENT',
      entityType: 'PURCHASE_ORDER',
      entityId: id,
    });

    RealtimeService.emitToRestaurant(restaurantId, 'purchasing:status_changed', {
      purchaseOrder: updated,
      status: 'ORDERED',
    });

    return updated;
  }

  // ===========================================================================
  // 3. Receiving Goods Workflow
  // ===========================================================================

  public static async receiveGoods(
    restaurantId: string,
    id: string,
    input: ReceiveGoodsInput,
    actorId?: string,
  ) {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id, restaurantId },
      include: {
        items: {
          include: {
            inventoryItem: true,
          },
        },
      },
    });

    if (!po) throw new NotFoundError('Purchase order not found');

    if (po.status === 'RECEIVED') {
      throw new BadRequestError('This purchase order has already been fully received');
    }

    if (po.status === 'CANCELLED') {
      throw new BadRequestError('Cannot receive goods against a cancelled purchase order');
    }

    const itemMap = new Map(po.items.map((it) => [it.id, it]));

    const updated = await prisma.$transaction(async (tx) => {
      for (const rec of input.items) {
        const lineItem = itemMap.get(rec.purchaseOrderItemId);
        if (!lineItem) {
          throw new NotFoundError(
            `Purchase order item '${rec.purchaseOrderItemId}' not found on this order`,
          );
        }

        const qtyToReceive = new Prisma.Decimal(rec.quantityReceived);
        const remainingToReceive = lineItem.quantity.sub(lineItem.quantityReceived);

        if (qtyToReceive.gt(remainingToReceive)) {
          throw new BadRequestError(
            `Cannot receive ${qtyToReceive} for '${lineItem.inventoryItem.name}'. Maximum remaining is ${remainingToReceive}`,
          );
        }

        const newQtyReceived = lineItem.quantityReceived.add(qtyToReceive);

        // Update purchase order item quantityReceived
        await tx.purchaseOrderItem.update({
          where: { id: lineItem.id },
          data: { quantityReceived: newQtyReceived },
        });

        // Update inventory item stock & unit cost
        const currentItem = await tx.inventoryItem.findUniqueOrThrow({
          where: { id: lineItem.inventoryItemId },
        });

        const newStock = currentItem.currentStock.add(qtyToReceive);

        await tx.inventoryItem.update({
          where: { id: currentItem.id },
          data: {
            currentStock: newStock,
            costPerUnit: lineItem.unitCost,
          },
        });

        // Record stock movement ledger
        await tx.stockMovement.create({
          data: {
            restaurantId,
            inventoryItemId: currentItem.id,
            toLocationId:
              input.receivedLocationId ?? po.locationId ?? currentItem.locationId ?? null,
            type: 'PURCHASE_RECEIPT',
            quantityChange: qtyToReceive,
            balanceAfter: newStock,
            unitCost: lineItem.unitCost,
            totalCost: qtyToReceive.mul(lineItem.unitCost),
            referenceType: 'PURCHASE_ORDER',
            referenceId: po.id,
            reason: `Purchase Received for ${po.orderNumber}`,
            createdById: actorId ?? null,
          },
        });
      }

      // Re-fetch all items to calculate if whole order is fully received
      const allItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: id },
      });

      const allFullyReceived = allItems.every((it) => it.quantityReceived.gte(it.quantity));
      const anyReceived = allItems.some((it) => it.quantityReceived.gt(0));

      let newStatus = po.status;
      if (allFullyReceived) {
        newStatus = 'RECEIVED';
      } else if (anyReceived) {
        newStatus = 'PARTIALLY_RECEIVED';
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          status: newStatus,
          ...(input.invoiceNumber ? { invoiceNumber: input.invoiceNumber.trim() } : {}),
          receivedAt: new Date(),
        },
        include: {
          items: {
            include: {
              inventoryItem: { select: { id: true, itemCode: true, name: true, unit: true } },
            },
          },
          supplier: true,
          location: true,
        },
      });
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'PURCHASE_ORDER_RECEIVED',
      entityType: 'PURCHASE_ORDER',
      entityId: id,
      metadata: {
        orderNumber: po.orderNumber,
        status: updated.status,
        receivedItems: input.items,
      },
    });

    RealtimeService.emitToRestaurant(restaurantId, 'purchasing:received', {
      purchaseOrder: updated,
    });

    return updated;
  }

  // ===========================================================================
  // 4. Purchase Returns
  // ===========================================================================

  public static async createPurchaseReturn(
    restaurantId: string,
    id: string,
    input: CreatePurchaseReturnInput,
    actorId?: string,
  ) {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id, restaurantId },
      include: {
        items: {
          include: {
            inventoryItem: true,
            returnItems: true,
          },
        },
        supplier: true,
      },
    });

    if (!po) throw new NotFoundError('Purchase order not found');

    if (po.status !== 'RECEIVED' && po.status !== 'PARTIALLY_RECEIVED') {
      throw new BadRequestError(
        'Cannot process a return against a purchase order with no received goods',
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const countToday = await prisma.purchaseReturn.count({
      where: { restaurantId, createdAt: { gte: today } },
    });
    const returnNumber = this.generateReturnNumber(new Date(), countToday);

    const itemMap = new Map(po.items.map((it) => [it.id, it]));
    let totalRefundDec = new Prisma.Decimal(0);

    const validatedReturnItems: {
      purchaseOrderItemId: string;
      inventoryItemId: string;
      quantity: Prisma.Decimal;
      unitCost: Prisma.Decimal;
      totalAmount: Prisma.Decimal;
    }[] = [];

    for (const ret of input.items) {
      const lineItem = itemMap.get(ret.purchaseOrderItemId);
      if (!lineItem) {
        throw new NotFoundError(
          `Item '${ret.purchaseOrderItemId}' not found on this purchase order`,
        );
      }

      const alreadyReturned = lineItem.returnItems.reduce(
        (acc, r) => acc.add(r.quantity),
        new Prisma.Decimal(0),
      );
      const availableToReturn = lineItem.quantityReceived.sub(alreadyReturned);
      const qtyToReturn = new Prisma.Decimal(ret.quantity);

      if (qtyToReturn.gt(availableToReturn)) {
        throw new BadRequestError(
          `Cannot return ${qtyToReturn} of '${lineItem.inventoryItem.name}'. Maximum returnable received quantity is ${availableToReturn}`,
        );
      }

      if (lineItem.inventoryItem.currentStock.lt(qtyToReturn)) {
        throw new BadRequestError(
          `Insufficient stock to return '${lineItem.inventoryItem.name}'. Current stock is ${lineItem.inventoryItem.currentStock}, attempted to return ${qtyToReturn}`,
        );
      }

      const lineTotal = qtyToReturn.mul(lineItem.unitCost);
      totalRefundDec = totalRefundDec.add(lineTotal);

      validatedReturnItems.push({
        purchaseOrderItemId: lineItem.id,
        inventoryItemId: lineItem.inventoryItemId,
        quantity: qtyToReturn,
        unitCost: lineItem.unitCost,
        totalAmount: lineTotal,
      });
    }

    const purchaseReturn = await prisma.$transaction(async (tx) => {
      const pr = await tx.purchaseReturn.create({
        data: {
          restaurantId,
          purchaseOrderId: id,
          supplierId: po.supplierId ?? null,
          returnNumber,
          reason: input.reason.trim(),
          totalRefundAmount: totalRefundDec,
          status: 'COMPLETED',
          notes: input.notes?.trim() ?? null,
          createdById: actorId ?? null,
          items: {
            create: validatedReturnItems.map((it) => ({
              purchaseOrderItemId: it.purchaseOrderItemId,
              inventoryItemId: it.inventoryItemId,
              quantity: it.quantity,
              unitCost: it.unitCost,
              totalAmount: it.totalAmount,
            })),
          },
        },
        include: {
          items: {
            include: {
              inventoryItem: { select: { id: true, itemCode: true, name: true, unit: true } },
            },
          },
          supplier: true,
          purchaseOrder: true,
        },
      });

      // Deduct stock and log stock movement
      for (const it of validatedReturnItems) {
        const currentItem = await tx.inventoryItem.findUniqueOrThrow({
          where: { id: it.inventoryItemId },
        });

        const newStock = currentItem.currentStock.sub(it.quantity);

        await tx.inventoryItem.update({
          where: { id: currentItem.id },
          data: { currentStock: newStock },
        });

        await tx.stockMovement.create({
          data: {
            restaurantId,
            inventoryItemId: currentItem.id,
            fromLocationId: po.locationId ?? currentItem.locationId ?? null,
            type: 'PURCHASE_RETURN',
            quantityChange: it.quantity.negated(),
            balanceAfter: newStock,
            unitCost: it.unitCost,
            totalCost: it.totalAmount,
            referenceType: 'PURCHASE_RETURN',
            referenceId: pr.id,
            reason: `Purchase Return ${returnNumber} (${input.reason})`,
            createdById: actorId ?? null,
          },
        });
      }

      return pr;
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'PURCHASE_RETURN_PROCESSED',
      entityType: 'PURCHASE_RETURN',
      entityId: purchaseReturn.id,
      metadata: {
        returnNumber,
        purchaseOrderNumber: po.orderNumber,
        totalRefundAmount: totalRefundDec,
      },
    });

    RealtimeService.emitToRestaurant(restaurantId, 'purchasing:returned', { purchaseReturn });

    return purchaseReturn;
  }

  // ===========================================================================
  // 5. Cancellation & Queries
  // ===========================================================================

  public static async cancelPurchaseOrder(restaurantId: string, id: string, actorId?: string) {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id, restaurantId },
      include: { items: true },
    });

    if (!po) throw new NotFoundError('Purchase order not found');

    if (po.status === 'CANCELLED') {
      throw new BadRequestError('Purchase order is already cancelled');
    }

    if (po.status === 'RECEIVED') {
      throw new BadRequestError(
        'Cannot cancel a fully received purchase order. Please process a purchase return instead',
      );
    }

    const hasReceivedItems = po.items.some((i) => i.quantityReceived.gt(0));
    if (hasReceivedItems) {
      throw new BadRequestError('Cannot cancel a purchase order with partially received goods');
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: { items: true, supplier: true },
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'PURCHASE_ORDER_CANCELLED',
      entityType: 'PURCHASE_ORDER',
      entityId: id,
    });

    RealtimeService.emitToRestaurant(restaurantId, 'purchasing:status_changed', {
      purchaseOrder: updated,
      status: 'CANCELLED',
    });

    return updated;
  }

  public static async listPurchaseOrders(restaurantId: string, query: ListPurchasesQuery) {
    const { page, limit, status, supplierId, locationId, startDate, endDate, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.PurchaseOrderWhereInput = {
      restaurantId,
      ...(status ? { status } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(locationId ? { locationId } : {}),
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate ? { gte: new Date(startDate) } : {}),
              ...(endDate ? { lte: new Date(endDate) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { orderNumber: { contains: search, mode: 'insensitive' } },
              { invoiceNumber: { contains: search, mode: 'insensitive' } },
              { supplier: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [total, orders] = await Promise.all([
      prisma.purchaseOrder.count({ where }),
      prisma.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        include: {
          supplier: { select: { id: true, name: true, contactPerson: true, phone: true } },
          location: { select: { id: true, name: true } },
          items: {
            include: {
              inventoryItem: { select: { id: true, itemCode: true, name: true, unit: true } },
            },
          },
          returns: true,
          createdByUser: { select: { id: true, name: true, username: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      items: orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  public static async getPurchaseOrder(restaurantId: string, id: string) {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id, restaurantId },
      include: {
        supplier: true,
        location: true,
        items: {
          include: {
            inventoryItem: true,
            returnItems: true,
          },
        },
        returns: {
          include: {
            items: {
              include: {
                inventoryItem: { select: { id: true, itemCode: true, name: true, unit: true } },
              },
            },
          },
        },
        createdByUser: { select: { id: true, name: true, username: true } },
      },
    });

    if (!po) throw new NotFoundError('Purchase order not found');

    return po;
  }

  // ===========================================================================
  // 6. Summary & Analytics
  // ===========================================================================

  public static async getPurchasingSummary(restaurantId: string, query: PurchasingSummaryQuery) {
    const { startDate, endDate, supplierId } = query;

    const where: Prisma.PurchaseOrderWhereInput = {
      restaurantId,
      ...(supplierId ? { supplierId } : {}),
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate ? { gte: new Date(startDate) } : {}),
              ...(endDate ? { lte: new Date(endDate) } : {}),
            },
          }
        : {}),
    };

    const orders = await prisma.purchaseOrder.findMany({
      where,
      include: {
        items: {
          include: {
            inventoryItem: { select: { id: true, name: true, unit: true } },
          },
        },
        supplier: { select: { id: true, name: true } },
      },
    });

    let totalSpend = new Prisma.Decimal(0);
    const statusCounts: Record<string, number> = {
      DRAFT: 0,
      ORDERED: 0,
      PARTIALLY_RECEIVED: 0,
      RECEIVED: 0,
      CANCELLED: 0,
    };

    const supplierSpendMap = new Map<
      string,
      { name: string; total: Prisma.Decimal; ordersCount: number }
    >();
    const itemQuantityMap = new Map<
      string,
      { name: string; unit: string; totalQty: Prisma.Decimal; totalSpend: Prisma.Decimal }
    >();

    for (const po of orders) {
      statusCounts[po.status] = (statusCounts[po.status] || 0) + 1;

      if (po.status === 'RECEIVED' || po.status === 'PARTIALLY_RECEIVED') {
        const orderAmount = po.totalAmount.gt(0) ? po.totalAmount : po.totalCost;
        totalSpend = totalSpend.add(orderAmount);

        if (po.supplier) {
          const prev = supplierSpendMap.get(po.supplier.id) || {
            name: po.supplier.name,
            total: new Prisma.Decimal(0),
            ordersCount: 0,
          };
          supplierSpendMap.set(po.supplier.id, {
            name: po.supplier.name,
            total: prev.total.add(orderAmount),
            ordersCount: prev.ordersCount + 1,
          });
        }

        for (const it of po.items) {
          const prevItem = itemQuantityMap.get(it.inventoryItemId) || {
            name: it.inventoryItem.name,
            unit: it.inventoryItem.unit,
            totalQty: new Prisma.Decimal(0),
            totalSpend: new Prisma.Decimal(0),
          };

          itemQuantityMap.set(it.inventoryItemId, {
            name: it.inventoryItem.name,
            unit: it.inventoryItem.unit,
            totalQty: prevItem.totalQty.add(it.quantityReceived),
            totalSpend: prevItem.totalSpend.add(it.quantityReceived.mul(it.unitCost)),
          });
        }
      }
    }

    const topSuppliers = Array.from(supplierSpendMap.entries())
      .map(([id, data]) => ({
        supplierId: id,
        name: data.name,
        totalSpend: data.total.toNumber(),
        ordersCount: data.ordersCount,
      }))
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 5);

    const topPurchasedItems = Array.from(itemQuantityMap.entries())
      .map(([id, data]) => ({
        inventoryItemId: id,
        name: data.name,
        unit: data.unit,
        totalQuantity: data.totalQty.toNumber(),
        totalSpend: data.totalSpend.toNumber(),
      }))
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(5);

    return {
      totalOrders: orders.length,
      totalSpend: totalSpend.toNumber(),
      statusBreakdown: statusCounts,
      topSuppliers,
      topPurchasedItems,
    };
  }
}
