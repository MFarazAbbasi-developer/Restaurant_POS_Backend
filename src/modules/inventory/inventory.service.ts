import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import { AuditService } from '../../common/services/audit.service.js';
import { RealtimeService } from '../../common/services/realtime.service.js';
import {
  CreateLocationInput,
  UpdateLocationInput,
  CreateSupplierInput,
  UpdateSupplierInput,
  CreateInventoryItemInput,
  UpdateInventoryItemInput,
  ListInventoryItemsQuery,
  UpsertRecipeInput,
  CreatePurchaseOrderInput,
  ListPurchasesQuery,
  CreateStockAdjustmentInput,
  ListAdjustmentsQuery,
  CreateStockWastageInput,
  ListWastageQuery,
  CreateStockTransferInput,
  ListTransfersQuery,
  ListLedgerQuery,
} from './inventory.schema.js';

export class InventoryService {
  // ---------------------------------------------------------------------------
  // 1. Stock Location Management
  // ---------------------------------------------------------------------------
  public static async listLocations(restaurantId: string) {
    return prisma.stockLocation.findMany({
      where: { restaurantId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: {
        _count: {
          select: { inventoryItems: true },
        },
      },
    });
  }

  public static async getLocation(restaurantId: string, id: string) {
    const location = await prisma.stockLocation.findFirst({
      where: { id, restaurantId },
    });
    if (!location) {
      throw new NotFoundError('Stock location not found');
    }
    return location;
  }

  public static async createLocation(restaurantId: string, input: CreateLocationInput) {
    const existing = await prisma.stockLocation.findUnique({
      where: {
        restaurantId_name: { restaurantId, name: input.name },
      },
    });
    if (existing) {
      throw new ConflictError(`A stock location with name "${input.name}" already exists`);
    }

    if (input.isDefault) {
      await prisma.stockLocation.updateMany({
        where: { restaurantId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return prisma.stockLocation.create({
      data: {
        restaurantId,
        name: input.name,
        code: input.code?.trim() ?? null,
        isDefault: input.isDefault ?? false,
      },
    });
  }

  public static async updateLocation(restaurantId: string, id: string, input: UpdateLocationInput) {
    await this.getLocation(restaurantId, id);

    if (input.name) {
      const existing = await prisma.stockLocation.findFirst({
        where: {
          restaurantId,
          name: input.name,
          id: { not: id },
        },
      });
      if (existing) {
        throw new ConflictError(`A stock location with name "${input.name}" already exists`);
      }
    }

    if (input.isDefault) {
      await prisma.stockLocation.updateMany({
        where: { restaurantId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    return prisma.stockLocation.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.code !== undefined ? { code: input.code?.trim() ?? null } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }

  public static async deleteLocation(restaurantId: string, id: string) {
    await this.getLocation(restaurantId, id);

    const itemsCount = await prisma.inventoryItem.count({
      where: { locationId: id, restaurantId },
    });
    if (itemsCount > 0) {
      return prisma.stockLocation.update({
        where: { id },
        data: { isActive: false },
      });
    }

    return prisma.stockLocation.delete({
      where: { id },
    });
  }

  // ---------------------------------------------------------------------------
  // 2. Supplier Management
  // ---------------------------------------------------------------------------
  public static async listSuppliers(restaurantId: string) {
    return prisma.supplier.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { inventoryItems: true, purchaseOrders: true },
        },
      },
    });
  }

  public static async getSupplier(restaurantId: string, id: string) {
    const supplier = await prisma.supplier.findFirst({
      where: { id, restaurantId },
    });
    if (!supplier) {
      throw new NotFoundError('Supplier not found');
    }
    return supplier;
  }

  public static async createSupplier(restaurantId: string, input: CreateSupplierInput) {
    const existing = await prisma.supplier.findUnique({
      where: {
        restaurantId_name: { restaurantId, name: input.name },
      },
    });
    if (existing) {
      throw new ConflictError(`A supplier with name "${input.name}" already exists`);
    }

    return prisma.supplier.create({
      data: {
        restaurantId,
        name: input.name,
        contactPerson: input.contactPerson?.trim() ?? null,
        phone: input.phone?.trim() ?? null,
        email: input.email?.trim() || null,
        address: input.address?.trim() ?? null,
        taxNumber: input.taxNumber?.trim() ?? null,
      },
    });
  }

  public static async updateSupplier(restaurantId: string, id: string, input: UpdateSupplierInput) {
    await this.getSupplier(restaurantId, id);

    if (input.name) {
      const existing = await prisma.supplier.findFirst({
        where: {
          restaurantId,
          name: input.name,
          id: { not: id },
        },
      });
      if (existing) {
        throw new ConflictError(`A supplier with name "${input.name}" already exists`);
      }
    }

    return prisma.supplier.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.contactPerson !== undefined
          ? { contactPerson: input.contactPerson?.trim() ?? null }
          : {}),
        ...(input.phone !== undefined ? { phone: input.phone?.trim() ?? null } : {}),
        ...(input.email !== undefined ? { email: input.email?.trim() || null } : {}),
        ...(input.address !== undefined ? { address: input.address?.trim() ?? null } : {}),
        ...(input.taxNumber !== undefined ? { taxNumber: input.taxNumber?.trim() ?? null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  }

  public static async deleteSupplier(restaurantId: string, id: string) {
    await this.getSupplier(restaurantId, id);
    return prisma.supplier.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ---------------------------------------------------------------------------
  // 3. Inventory Item Management
  // ---------------------------------------------------------------------------
  public static async listItems(restaurantId: string, query: ListInventoryItemsQuery) {
    const where: Prisma.InventoryItemWhereInput = { restaurantId };

    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.locationId) where.locationId = query.locationId;
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { itemCode: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [total, rawItems] = await Promise.all([
      prisma.inventoryItem.count({ where }),
      prisma.inventoryItem.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { name: 'asc' },
        include: {
          location: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
        },
      }),
    ]);

    let items = rawItems.map((i) => ({
      ...i,
      costPerUnit: Number(i.costPerUnit),
      currentStock: Number(i.currentStock),
      minStockLevel: Number(i.minStockLevel),
      targetStockLevel: i.targetStockLevel ? Number(i.targetStockLevel) : null,
      totalValuation: Number((Number(i.currentStock) * Number(i.costPerUnit)).toFixed(2)),
      isLowStock: Number(i.currentStock) <= Number(i.minStockLevel),
    }));

    if (query.lowStock) {
      items = items.filter((i) => i.isLowStock);
    }

    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  public static async getItem(restaurantId: string, id: string) {
    const item = await prisma.inventoryItem.findFirst({
      where: { id, restaurantId },
      include: {
        location: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        _count: { select: { recipes: true, movements: true } },
      },
    });
    if (!item) {
      throw new NotFoundError('Inventory item not found');
    }

    return {
      ...item,
      costPerUnit: Number(item.costPerUnit),
      currentStock: Number(item.currentStock),
      minStockLevel: Number(item.minStockLevel),
      targetStockLevel: item.targetStockLevel ? Number(item.targetStockLevel) : null,
      totalValuation: Number((Number(item.currentStock) * Number(item.costPerUnit)).toFixed(2)),
      isLowStock: Number(item.currentStock) <= Number(item.minStockLevel),
    };
  }

  public static async createItem(
    restaurantId: string,
    input: CreateInventoryItemInput,
    actorId?: string,
  ) {
    const existing = await prisma.inventoryItem.findUnique({
      where: {
        restaurantId_itemCode: { restaurantId, itemCode: input.itemCode },
      },
    });
    if (existing) {
      throw new ConflictError(`An inventory item with code "${input.itemCode}" already exists`);
    }

    const currentStockDec = new Prisma.Decimal(input.currentStock || 0);
    const costPerUnitDec = new Prisma.Decimal(input.costPerUnit || 0);

    const item = await prisma.$transaction(async (tx) => {
      const newItem = await tx.inventoryItem.create({
        data: {
          restaurantId,
          supplierId: input.supplierId ?? null,
          locationId: input.locationId ?? null,
          itemCode: input.itemCode,
          name: input.name,
          description: input.description?.trim() ?? null,
          unit: input.unit.toUpperCase(),
          costPerUnit: costPerUnitDec,
          currentStock: currentStockDec,
          minStockLevel: new Prisma.Decimal(input.minStockLevel || 0),
          targetStockLevel: input.targetStockLevel
            ? new Prisma.Decimal(input.targetStockLevel)
            : null,
        },
        include: {
          location: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
        },
      });

      // Record initial stock movement in ledger if initial stock > 0
      if (currentStockDec.greaterThan(0)) {
        await tx.stockMovement.create({
          data: {
            restaurantId,
            inventoryItemId: newItem.id,
            toLocationId: input.locationId ?? null,
            type: 'ADJUSTMENT_INCREASE',
            quantityChange: currentStockDec,
            balanceAfter: currentStockDec,
            unitCost: costPerUnitDec,
            totalCost: currentStockDec.mul(costPerUnitDec),
            referenceType: 'INITIAL_STOCK',
            reason: 'Opening inventory stock setup',
            createdById: actorId ?? null,
          },
        });
      }

      return newItem;
    });

    return {
      ...item,
      costPerUnit: Number(item.costPerUnit),
      currentStock: Number(item.currentStock),
      minStockLevel: Number(item.minStockLevel),
      targetStockLevel: item.targetStockLevel ? Number(item.targetStockLevel) : null,
    };
  }

  public static async updateItem(
    restaurantId: string,
    id: string,
    input: UpdateInventoryItemInput,
  ) {
    await this.getItem(restaurantId, id);

    if (input.itemCode) {
      const existing = await prisma.inventoryItem.findFirst({
        where: {
          restaurantId,
          itemCode: input.itemCode,
          id: { not: id },
        },
      });
      if (existing) {
        throw new ConflictError(`An inventory item with code "${input.itemCode}" already exists`);
      }
    }

    const updated = await prisma.inventoryItem.update({
      where: { id },
      data: {
        ...(input.itemCode !== undefined ? { itemCode: input.itemCode } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() ?? null }
          : {}),
        ...(input.unit !== undefined ? { unit: input.unit.toUpperCase() } : {}),
        ...(input.costPerUnit !== undefined
          ? { costPerUnit: new Prisma.Decimal(input.costPerUnit) }
          : {}),
        ...(input.minStockLevel !== undefined
          ? { minStockLevel: new Prisma.Decimal(input.minStockLevel) }
          : {}),
        ...(input.targetStockLevel !== undefined
          ? {
              targetStockLevel: input.targetStockLevel
                ? new Prisma.Decimal(input.targetStockLevel)
                : null,
            }
          : {}),
        ...(input.locationId !== undefined ? { locationId: input.locationId ?? null } : {}),
        ...(input.supplierId !== undefined ? { supplierId: input.supplierId ?? null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: {
        location: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    });

    return {
      ...updated,
      costPerUnit: Number(updated.costPerUnit),
      currentStock: Number(updated.currentStock),
      minStockLevel: Number(updated.minStockLevel),
      targetStockLevel: updated.targetStockLevel ? Number(updated.targetStockLevel) : null,
    };
  }

  public static async deleteItem(restaurantId: string, id: string) {
    await this.getItem(restaurantId, id);
    return prisma.inventoryItem.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ---------------------------------------------------------------------------
  // 4. Recipes / Bill of Materials (BOM)
  // ---------------------------------------------------------------------------
  public static async upsertRecipe(restaurantId: string, input: UpsertRecipeInput) {
    // Validate target inventory item
    await this.getItem(restaurantId, input.inventoryItemId);

    const quantityDec = new Prisma.Decimal(input.quantity);
    const wastePercentDec = new Prisma.Decimal(input.wastePercentage || 0);

    const recipe = await prisma.menuItemIngredient.create({
      data: {
        restaurantId,
        menuItemId: input.menuItemId ?? null,
        variantId: input.variantId ?? null,
        modifierId: input.modifierId ?? null,
        inventoryItemId: input.inventoryItemId,
        quantity: quantityDec,
        wastePercentage: wastePercentDec,
      },
      include: {
        inventoryItem: {
          select: { id: true, itemCode: true, name: true, unit: true, costPerUnit: true },
        },
      },
    });

    return {
      ...recipe,
      quantity: Number(recipe.quantity),
      wastePercentage: Number(recipe.wastePercentage),
      inventoryItem: {
        ...recipe.inventoryItem,
        costPerUnit: Number(recipe.inventoryItem.costPerUnit),
      },
    };
  }

  public static async getMenuItemRecipes(restaurantId: string, menuItemId: string) {
    const menuItem = await prisma.menuItem.findFirst({
      where: { id: menuItemId, restaurantId },
      include: {
        variants: true,
        modifierGroups: {
          include: {
            modifierGroup: {
              include: {
                modifiers: true,
              },
            },
          },
        },
      },
    });

    if (!menuItem) {
      throw new NotFoundError('Menu item not found');
    }

    const variantIds = menuItem.variants.map((v) => v.id);
    const modifierIds: string[] = [];
    for (const mg of menuItem.modifierGroups) {
      for (const m of mg.modifierGroup.modifiers) {
        modifierIds.push(m.id);
      }
    }

    const recipes = await prisma.menuItemIngredient.findMany({
      where: {
        restaurantId,
        OR: [
          { menuItemId },
          { variantId: { in: variantIds } },
          { modifierId: { in: modifierIds } },
        ],
      },
      include: {
        inventoryItem: {
          select: {
            id: true,
            itemCode: true,
            name: true,
            unit: true,
            costPerUnit: true,
            currentStock: true,
          },
        },
      },
    });

    return recipes.map((r) => ({
      ...r,
      quantity: Number(r.quantity),
      wastePercentage: Number(r.wastePercentage),
      inventoryItem: {
        ...r.inventoryItem,
        costPerUnit: Number(r.inventoryItem.costPerUnit),
        currentStock: Number(r.inventoryItem.currentStock),
      },
    }));
  }

  public static async deleteRecipe(restaurantId: string, id: string) {
    const recipe = await prisma.menuItemIngredient.findFirst({
      where: { id, restaurantId },
    });
    if (!recipe) {
      throw new NotFoundError('Recipe ingredient not found');
    }
    return prisma.menuItemIngredient.delete({ where: { id } });
  }

  // ---------------------------------------------------------------------------
  // 5. Purchases & Receiving
  // ---------------------------------------------------------------------------
  public static async createPurchaseOrder(
    restaurantId: string,
    input: CreatePurchaseOrderInput,
    actorId?: string,
    ipAddress?: string,
  ) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const countToday = await prisma.purchaseOrder.count({
      where: {
        restaurantId,
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    });
    const orderNumber = `PO-${dateStr}-${String(countToday + 1).padStart(3, '0')}`;

    let totalCostDec = new Prisma.Decimal(0);
    const validatedItems: {
      inventoryItemId: string;
      quantity: Prisma.Decimal;
      unitCost: Prisma.Decimal;
      totalCost: Prisma.Decimal;
    }[] = [];

    for (const it of input.items) {
      const q = new Prisma.Decimal(it.quantity);
      const c = new Prisma.Decimal(it.unitCost);
      const itemTotal = q.mul(c);
      totalCostDec = totalCostDec.add(itemTotal);
      validatedItems.push({
        inventoryItemId: it.inventoryItemId,
        quantity: q,
        unitCost: c,
        totalCost: itemTotal,
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
          totalCost: totalCostDec,
          notes: input.notes?.trim() ?? null,
          createdById: actorId ?? null,
          items: {
            create: validatedItems.map((it) => ({
              inventoryItemId: it.inventoryItemId,
              quantity: it.quantity,
              unitCost: it.unitCost,
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
          supplier: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
        },
      });

      // Update Inventory Item stock and log ledger entries
      for (const it of validatedItems) {
        const item = await tx.inventoryItem.findUniqueOrThrow({
          where: { id: it.inventoryItemId },
        });

        const newStock = item.currentStock.add(it.quantity);

        await tx.inventoryItem.update({
          where: { id: item.id },
          data: {
            currentStock: newStock,
            costPerUnit: it.unitCost,
          },
        });

        await tx.stockMovement.create({
          data: {
            restaurantId,
            inventoryItemId: item.id,
            toLocationId: input.locationId ?? item.locationId ?? null,
            type: 'PURCHASE_RECEIPT',
            quantityChange: it.quantity,
            balanceAfter: newStock,
            unitCost: it.unitCost,
            totalCost: it.totalCost,
            referenceType: 'PURCHASE_ORDER',
            referenceId: po.id,
            reason: `Purchase Receiving ${orderNumber}`,
            createdById: actorId ?? null,
          },
        });
      }

      return po;
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'PURCHASE_ORDER_RECEIVED',
      entityType: 'PURCHASE_ORDER',
      entityId: purchaseOrder.id,
      metadata: {
        orderNumber,
        totalCost: totalCostDec.toNumber(),
        itemsCount: validatedItems.length,
      },
      ipAddress,
    });

    return {
      ...purchaseOrder,
      totalCost: Number(purchaseOrder.totalCost),
      items: purchaseOrder.items.map((it) => ({
        ...it,
        quantity: Number(it.quantity),
        unitCost: Number(it.unitCost),
        totalCost: Number(it.totalCost),
      })),
    };
  }

  public static async listPurchases(restaurantId: string, query: ListPurchasesQuery) {
    const where: Prisma.PurchaseOrderWhereInput = { restaurantId };
    if (query.supplierId) where.supplierId = query.supplierId;
    if (query.locationId) where.locationId = query.locationId;
    if (query.startDate && query.endDate) {
      where.receivedAt = {
        gte: new Date(query.startDate),
        lte: new Date(new Date(query.endDate).setHours(23, 59, 59, 999)),
      };
    }

    const [total, pos] = await Promise.all([
      prisma.purchaseOrder.count({ where }),
      prisma.purchaseOrder.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { receivedAt: 'desc' },
        include: {
          supplier: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
          items: {
            include: {
              inventoryItem: { select: { id: true, itemCode: true, name: true, unit: true } },
            },
          },
        },
      }),
    ]);

    return {
      purchases: pos.map((p) => ({
        ...p,
        totalCost: Number(p.totalCost),
        items: p.items.map((it) => ({
          ...it,
          quantity: Number(it.quantity),
          unitCost: Number(it.unitCost),
          totalCost: Number(it.totalCost),
        })),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  public static async getPurchase(restaurantId: string, id: string) {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id, restaurantId },
      include: {
        supplier: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        items: {
          include: {
            inventoryItem: { select: { id: true, itemCode: true, name: true, unit: true } },
          },
        },
        createdByUser: { select: { id: true, name: true, username: true } },
      },
    });

    if (!po) {
      throw new NotFoundError('Purchase order not found');
    }

    return {
      ...po,
      totalCost: Number(po.totalCost),
      items: po.items.map((it) => ({
        ...it,
        quantity: Number(it.quantity),
        unitCost: Number(it.unitCost),
        totalCost: Number(it.totalCost),
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // 6. Stock Adjustments (Physical Inventory Reconciliation)
  // ---------------------------------------------------------------------------
  public static async createStockAdjustment(
    restaurantId: string,
    input: CreateStockAdjustmentInput,
    actorId?: string,
    ipAddress?: string,
  ) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const countToday = await prisma.stockAdjustment.count({
      where: {
        restaurantId,
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    });
    const adjustmentNumber = `ADJ-${dateStr}-${String(countToday + 1).padStart(3, '0')}`;

    const adjustment = await prisma.$transaction(async (tx) => {
      let netValuationDiff = new Prisma.Decimal(0);

      const itemsData: {
        inventoryItemId: string;
        previousStock: Prisma.Decimal;
        actualStock: Prisma.Decimal;
        difference: Prisma.Decimal;
        unitCost: Prisma.Decimal;
        valuationDifference: Prisma.Decimal;
      }[] = [];

      for (const it of input.items) {
        const item = await tx.inventoryItem.findUniqueOrThrow({
          where: { id: it.inventoryItemId },
        });

        const actual = new Prisma.Decimal(it.actualStock);
        const prev = item.currentStock;
        const diff = actual.minus(prev);
        const valDiff = diff.mul(item.costPerUnit);
        netValuationDiff = netValuationDiff.add(valDiff);

        itemsData.push({
          inventoryItemId: it.inventoryItemId,
          previousStock: prev,
          actualStock: actual,
          difference: diff,
          unitCost: item.costPerUnit,
          valuationDifference: valDiff,
        });
      }

      const adj = await tx.stockAdjustment.create({
        data: {
          restaurantId,
          locationId: input.locationId ?? null,
          adjustmentNumber,
          reason: input.reason,
          totalItemsAdjusted: itemsData.length,
          netValuationDifference: netValuationDiff,
          notes: input.notes?.trim() ?? null,
          createdById: actorId ?? null,
          items: {
            create: itemsData.map((it) => ({
              inventoryItemId: it.inventoryItemId,
              previousStock: it.previousStock,
              actualStock: it.actualStock,
              difference: it.difference,
              unitCost: it.unitCost,
              valuationDifference: it.valuationDifference,
            })),
          },
        },
        include: {
          items: {
            include: {
              inventoryItem: { select: { id: true, itemCode: true, name: true, unit: true } },
            },
          },
          location: { select: { id: true, name: true } },
        },
      });

      // Update current stock and log movement ledger
      for (const it of itemsData) {
        await tx.inventoryItem.update({
          where: { id: it.inventoryItemId },
          data: { currentStock: it.actualStock },
        });

        const movementType = it.difference.greaterThanOrEqualTo(0)
          ? 'ADJUSTMENT_INCREASE'
          : 'ADJUSTMENT_DECREASE';

        await tx.stockMovement.create({
          data: {
            restaurantId,
            inventoryItemId: it.inventoryItemId,
            toLocationId: input.locationId ?? null,
            type: movementType,
            quantityChange: it.difference,
            balanceAfter: it.actualStock,
            unitCost: it.unitCost,
            totalCost: it.valuationDifference.abs(),
            referenceType: 'ADJUSTMENT',
            referenceId: adj.id,
            reason: input.reason,
            createdById: actorId ?? null,
          },
        });
      }

      return adj;
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'STOCK_ADJUSTED',
      entityType: 'STOCK_ADJUSTMENT',
      entityId: adjustment.id,
      metadata: {
        adjustmentNumber,
        reason: input.reason,
        itemsCount: input.items.length,
      },
      ipAddress,
    });

    return {
      ...adjustment,
      netValuationDifference: Number(adjustment.netValuationDifference),
      items: adjustment.items.map((it) => ({
        ...it,
        previousStock: Number(it.previousStock),
        actualStock: Number(it.actualStock),
        difference: Number(it.difference),
        unitCost: Number(it.unitCost),
        valuationDifference: Number(it.valuationDifference),
      })),
    };
  }

  public static async listAdjustments(restaurantId: string, query: ListAdjustmentsQuery) {
    const where: Prisma.StockAdjustmentWhereInput = { restaurantId };
    if (query.locationId) where.locationId = query.locationId;
    if (query.startDate && query.endDate) {
      where.createdAt = {
        gte: new Date(query.startDate),
        lte: new Date(new Date(query.endDate).setHours(23, 59, 59, 999)),
      };
    }

    const [total, adjustments] = await Promise.all([
      prisma.stockAdjustment.count({ where }),
      prisma.stockAdjustment.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          location: { select: { id: true, name: true } },
          items: {
            include: {
              inventoryItem: { select: { id: true, itemCode: true, name: true, unit: true } },
            },
          },
        },
      }),
    ]);

    return {
      adjustments: adjustments.map((a) => ({
        ...a,
        netValuationDifference: Number(a.netValuationDifference),
        items: a.items.map((it) => ({
          ...it,
          previousStock: Number(it.previousStock),
          actualStock: Number(it.actualStock),
          difference: Number(it.difference),
          unitCost: Number(it.unitCost),
          valuationDifference: Number(it.valuationDifference),
        })),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  public static async getAdjustment(restaurantId: string, id: string) {
    const adj = await prisma.stockAdjustment.findFirst({
      where: { id, restaurantId },
      include: {
        location: { select: { id: true, name: true } },
        items: {
          include: {
            inventoryItem: { select: { id: true, itemCode: true, name: true, unit: true } },
          },
        },
        createdByUser: { select: { id: true, name: true, username: true } },
      },
    });

    if (!adj) {
      throw new NotFoundError('Stock adjustment not found');
    }

    return {
      ...adj,
      netValuationDifference: Number(adj.netValuationDifference),
      items: adj.items.map((it) => ({
        ...it,
        previousStock: Number(it.previousStock),
        actualStock: Number(it.actualStock),
        difference: Number(it.difference),
        unitCost: Number(it.unitCost),
        valuationDifference: Number(it.valuationDifference),
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // 7. Stock Wastage / Spoilage
  // ---------------------------------------------------------------------------
  public static async createStockWastage(
    restaurantId: string,
    input: CreateStockWastageInput,
    actorId?: string,
    ipAddress?: string,
  ) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const countToday = await prisma.stockWastage.count({
      where: {
        restaurantId,
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    });
    const wastageNumber = `WST-${dateStr}-${String(countToday + 1).padStart(3, '0')}`;

    const lowStockAlerts: {
      itemId: string;
      name: string;
      currentStock: number;
      minStockLevel: number;
    }[] = [];

    const wastage = await prisma.$transaction(async (tx) => {
      let totalWastedVal = new Prisma.Decimal(0);
      const itemsData: {
        inventoryItemId: string;
        quantity: Prisma.Decimal;
        unitCost: Prisma.Decimal;
        totalCost: Prisma.Decimal;
        itemReason?: string;
      }[] = [];

      for (const it of input.items) {
        const item = await tx.inventoryItem.findUniqueOrThrow({
          where: { id: it.inventoryItemId },
        });

        const q = new Prisma.Decimal(it.quantity);
        const uCost =
          it.unitCost !== undefined ? new Prisma.Decimal(it.unitCost) : item.costPerUnit;
        const itemTot = q.mul(uCost);
        totalWastedVal = totalWastedVal.add(itemTot);

        itemsData.push({
          inventoryItemId: it.inventoryItemId,
          quantity: q,
          unitCost: uCost,
          totalCost: itemTot,
          ...(it.itemReason !== undefined && { itemReason: it.itemReason }),
        });
      }

      const wst = await tx.stockWastage.create({
        data: {
          restaurantId,
          locationId: input.locationId ?? null,
          wastageNumber,
          reason: input.reason,
          totalWastedValue: totalWastedVal,
          notes: input.notes?.trim() ?? null,
          createdById: actorId ?? null,
          items: {
            create: itemsData.map((it) => ({
              inventoryItemId: it.inventoryItemId,
              quantity: it.quantity,
              unitCost: it.unitCost,
              totalCost: it.totalCost,
              itemReason: it.itemReason?.trim() ?? null,
            })),
          },
        },
        include: {
          items: {
            include: {
              inventoryItem: { select: { id: true, itemCode: true, name: true, unit: true } },
            },
          },
          location: { select: { id: true, name: true } },
        },
      });

      // Deduct stock and record in ledger
      for (const it of itemsData) {
        const item = await tx.inventoryItem.findUniqueOrThrow({
          where: { id: it.inventoryItemId },
        });

        const newStock = item.currentStock.minus(it.quantity);

        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { currentStock: newStock },
        });

        await tx.stockMovement.create({
          data: {
            restaurantId,
            inventoryItemId: item.id,
            fromLocationId: input.locationId ?? item.locationId ?? null,
            type: 'WASTAGE',
            quantityChange: it.quantity.negated(),
            balanceAfter: newStock,
            unitCost: it.unitCost,
            totalCost: it.totalCost,
            referenceType: 'WASTAGE',
            referenceId: wst.id,
            reason: `${input.reason}${it.itemReason ? `: ${it.itemReason}` : ''}`,
            createdById: actorId ?? null,
          },
        });

        if (newStock.lessThanOrEqualTo(item.minStockLevel)) {
          lowStockAlerts.push({
            itemId: item.id,
            name: item.name,
            currentStock: newStock.toNumber(),
            minStockLevel: item.minStockLevel.toNumber(),
          });
        }
      }

      return wst;
    });

    // Real-time alerts
    for (const alert of lowStockAlerts) {
      RealtimeService.emitToRestaurant(restaurantId, 'inventory:low_stock', alert);
    }

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'STOCK_WASTED',
      entityType: 'STOCK_WASTAGE',
      entityId: wastage.id,
      metadata: {
        wastageNumber,
        reason: input.reason,
        totalWastedValue: Number(wastage.totalWastedValue),
        itemsCount: input.items.length,
      },
      ipAddress,
    });

    return {
      ...wastage,
      totalWastedValue: Number(wastage.totalWastedValue),
      items: wastage.items.map((it) => ({
        ...it,
        quantity: Number(it.quantity),
        unitCost: Number(it.unitCost),
        totalCost: Number(it.totalCost),
      })),
    };
  }

  public static async listWastage(restaurantId: string, query: ListWastageQuery) {
    const where: Prisma.StockWastageWhereInput = { restaurantId };
    if (query.locationId) where.locationId = query.locationId;
    if (query.reason) where.reason = query.reason;
    if (query.startDate && query.endDate) {
      where.createdAt = {
        gte: new Date(query.startDate),
        lte: new Date(new Date(query.endDate).setHours(23, 59, 59, 999)),
      };
    }

    const [total, records] = await Promise.all([
      prisma.stockWastage.count({ where }),
      prisma.stockWastage.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          location: { select: { id: true, name: true } },
          items: {
            include: {
              inventoryItem: { select: { id: true, itemCode: true, name: true, unit: true } },
            },
          },
        },
      }),
    ]);

    return {
      wastage: records.map((w) => ({
        ...w,
        totalWastedValue: Number(w.totalWastedValue),
        items: w.items.map((it) => ({
          ...it,
          quantity: Number(it.quantity),
          unitCost: Number(it.unitCost),
          totalCost: Number(it.totalCost),
        })),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  public static async getWastage(restaurantId: string, id: string) {
    const wst = await prisma.stockWastage.findFirst({
      where: { id, restaurantId },
      include: {
        location: { select: { id: true, name: true } },
        items: {
          include: {
            inventoryItem: { select: { id: true, itemCode: true, name: true, unit: true } },
          },
        },
        createdByUser: { select: { id: true, name: true, username: true } },
      },
    });

    if (!wst) {
      throw new NotFoundError('Stock wastage record not found');
    }

    return {
      ...wst,
      totalWastedValue: Number(wst.totalWastedValue),
      items: wst.items.map((it) => ({
        ...it,
        quantity: Number(it.quantity),
        unitCost: Number(it.unitCost),
        totalCost: Number(it.totalCost),
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // 8. Stock Transfers Between Locations
  // ---------------------------------------------------------------------------
  public static async createStockTransfer(
    restaurantId: string,
    input: CreateStockTransferInput,
    actorId?: string,
    ipAddress?: string,
  ) {
    await this.getLocation(restaurantId, input.fromLocationId);
    await this.getLocation(restaurantId, input.toLocationId);

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const countToday = await prisma.stockTransfer.count({
      where: {
        restaurantId,
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    });
    const transferNumber = `TRF-${dateStr}-${String(countToday + 1).padStart(3, '0')}`;

    const transfer = await prisma.$transaction(async (tx) => {
      const itemsData: {
        inventoryItemId: string;
        quantity: Prisma.Decimal;
        unitCost: Prisma.Decimal;
      }[] = [];

      for (const it of input.items) {
        const item = await tx.inventoryItem.findUniqueOrThrow({
          where: { id: it.inventoryItemId },
        });

        const q = new Prisma.Decimal(it.quantity);
        if (q.greaterThan(item.currentStock)) {
          throw new BadRequestError(
            `Insufficient stock for item "${item.name}". Available: ${item.currentStock.toFixed(2)}, Requested: ${q.toFixed(2)}`,
          );
        }

        itemsData.push({
          inventoryItemId: it.inventoryItemId,
          quantity: q,
          unitCost: item.costPerUnit,
        });
      }

      const trf = await tx.stockTransfer.create({
        data: {
          restaurantId,
          fromLocationId: input.fromLocationId,
          toLocationId: input.toLocationId,
          transferNumber,
          notes: input.notes?.trim() ?? null,
          createdById: actorId ?? null,
          items: {
            create: itemsData.map((it) => ({
              inventoryItemId: it.inventoryItemId,
              quantity: it.quantity,
              unitCost: it.unitCost,
            })),
          },
        },
        include: {
          fromLocation: { select: { id: true, name: true } },
          toLocation: { select: { id: true, name: true } },
          items: {
            include: {
              inventoryItem: { select: { id: true, itemCode: true, name: true, unit: true } },
            },
          },
        },
      });

      // Record Transfer Out & Transfer In Movements
      for (const it of itemsData) {
        const item = await tx.inventoryItem.findUniqueOrThrow({
          where: { id: it.inventoryItemId },
        });

        await tx.stockMovement.create({
          data: {
            restaurantId,
            inventoryItemId: item.id,
            fromLocationId: input.fromLocationId,
            toLocationId: input.toLocationId,
            type: 'TRANSFER_OUT',
            quantityChange: it.quantity.negated(),
            balanceAfter: item.currentStock.minus(it.quantity),
            unitCost: it.unitCost,
            totalCost: it.quantity.mul(it.unitCost),
            referenceType: 'TRANSFER',
            referenceId: trf.id,
            reason: `Transfer to ${trf.toLocation.name}`,
            createdById: actorId ?? null,
          },
        });

        await tx.stockMovement.create({
          data: {
            restaurantId,
            inventoryItemId: item.id,
            fromLocationId: input.fromLocationId,
            toLocationId: input.toLocationId,
            type: 'TRANSFER_IN',
            quantityChange: it.quantity,
            balanceAfter: item.currentStock,
            unitCost: it.unitCost,
            totalCost: it.quantity.mul(it.unitCost),
            referenceType: 'TRANSFER',
            referenceId: trf.id,
            reason: `Transfer from ${trf.fromLocation.name}`,
            createdById: actorId ?? null,
          },
        });
      }

      return trf;
    });

    await AuditService.log({
      restaurantId,
      userId: actorId,
      action: 'STOCK_TRANSFERRED',
      entityType: 'STOCK_TRANSFER',
      entityId: transfer.id,
      metadata: {
        transferNumber,
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
        itemsCount: input.items.length,
      },
      ipAddress,
    });

    return {
      ...transfer,
      items: transfer.items.map((it) => ({
        ...it,
        quantity: Number(it.quantity),
        unitCost: Number(it.unitCost),
      })),
    };
  }

  public static async listTransfers(restaurantId: string, query: ListTransfersQuery) {
    const where: Prisma.StockTransferWhereInput = { restaurantId };
    if (query.fromLocationId) where.fromLocationId = query.fromLocationId;
    if (query.toLocationId) where.toLocationId = query.toLocationId;
    if (query.startDate && query.endDate) {
      where.createdAt = {
        gte: new Date(query.startDate),
        lte: new Date(new Date(query.endDate).setHours(23, 59, 59, 999)),
      };
    }

    const [total, records] = await Promise.all([
      prisma.stockTransfer.count({ where }),
      prisma.stockTransfer.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          fromLocation: { select: { id: true, name: true } },
          toLocation: { select: { id: true, name: true } },
          items: {
            include: {
              inventoryItem: { select: { id: true, itemCode: true, name: true, unit: true } },
            },
          },
        },
      }),
    ]);

    return {
      transfers: records.map((t) => ({
        ...t,
        items: t.items.map((it) => ({
          ...it,
          quantity: Number(it.quantity),
          unitCost: Number(it.unitCost),
        })),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  public static async getTransfer(restaurantId: string, id: string) {
    const trf = await prisma.stockTransfer.findFirst({
      where: { id, restaurantId },
      include: {
        fromLocation: { select: { id: true, name: true } },
        toLocation: { select: { id: true, name: true } },
        items: {
          include: {
            inventoryItem: { select: { id: true, itemCode: true, name: true, unit: true } },
          },
        },
        createdByUser: { select: { id: true, name: true, username: true } },
      },
    });

    if (!trf) {
      throw new NotFoundError('Stock transfer not found');
    }

    return {
      ...trf,
      items: trf.items.map((it) => ({
        ...it,
        quantity: Number(it.quantity),
        unitCost: Number(it.unitCost),
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // 9. Automatic Order Recipe Stock Consumption Engine
  // ---------------------------------------------------------------------------
  public static async consumeStockForOrder(
    restaurantId: string,
    orderId: string,
    actorId?: string,
  ) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: {
        items: {
          where: { status: { not: 'VOIDED' } },
          include: {
            modifiers: true,
          },
        },
      },
    });

    if (!order || order.items.length === 0) return;

    // Check if stock has already been deducted for this order
    const existingMovements = await prisma.stockMovement.findFirst({
      where: {
        restaurantId,
        referenceType: 'ORDER',
        referenceId: order.id,
        type: 'SALE_CONSUMPTION',
      },
    });

    if (existingMovements) {
      return; // Already consumed
    }

    const menuItemIds = order.items.map((i) => i.menuItemId);
    const variantIds = order.items.map((i) => i.variantId).filter((v): v is string => v !== null);
    const modifierIds: string[] = [];
    for (const it of order.items) {
      for (const m of it.modifiers) {
        modifierIds.push(m.modifierId);
      }
    }

    // Fetch all applicable recipes
    const recipes = await prisma.menuItemIngredient.findMany({
      where: {
        restaurantId,
        OR: [
          { menuItemId: { in: menuItemIds } },
          { variantId: { in: variantIds } },
          { modifierId: { in: modifierIds } },
        ],
      },
      include: {
        inventoryItem: true,
      },
    });

    if (recipes.length === 0) return;

    const deductionsMap = new Map<
      string,
      {
        inventoryItemId: string;
        totalQuantity: Prisma.Decimal;
        unitCost: Prisma.Decimal;
      }
    >();

    for (const orderItem of order.items) {
      // 1. Match Menu Item or Variant recipe
      const matchingItemRecipes = recipes.filter(
        (r) =>
          (orderItem.variantId && r.variantId === orderItem.variantId) ||
          (!orderItem.variantId && r.menuItemId === orderItem.menuItemId),
      );

      for (const rec of matchingItemRecipes) {
        const itemQty = new Prisma.Decimal(orderItem.quantity);
        const portionQty = rec.quantity;
        const wasteMultiplier = new Prisma.Decimal(1).add(rec.wastePercentage.div(100));
        const needed = itemQty.mul(portionQty).mul(wasteMultiplier);

        const existing = deductionsMap.get(rec.inventoryItemId);
        if (!existing) {
          deductionsMap.set(rec.inventoryItemId, {
            inventoryItemId: rec.inventoryItemId,
            totalQuantity: needed,
            unitCost: rec.inventoryItem.costPerUnit,
          });
        } else {
          existing.totalQuantity = existing.totalQuantity.add(needed);
        }
      }

      // 2. Match Modifiers recipe
      for (const mod of orderItem.modifiers) {
        const matchingModRecipes = recipes.filter((r) => r.modifierId === mod.modifierId);
        for (const rec of matchingModRecipes) {
          const modQty = new Prisma.Decimal(orderItem.quantity);
          const portionQty = rec.quantity;
          const wasteMultiplier = new Prisma.Decimal(1).add(rec.wastePercentage.div(100));
          const needed = modQty.mul(portionQty).mul(wasteMultiplier);

          const existing = deductionsMap.get(rec.inventoryItemId);
          if (!existing) {
            deductionsMap.set(rec.inventoryItemId, {
              inventoryItemId: rec.inventoryItemId,
              totalQuantity: needed,
              unitCost: rec.inventoryItem.costPerUnit,
            });
          } else {
            existing.totalQuantity = existing.totalQuantity.add(needed);
          }
        }
      }
    }

    if (deductionsMap.size === 0) return;

    const lowStockAlerts: {
      itemId: string;
      name: string;
      currentStock: number;
      minStockLevel: number;
    }[] = [];

    await prisma.$transaction(async (tx) => {
      for (const deduction of deductionsMap.values()) {
        const item = await tx.inventoryItem.findUniqueOrThrow({
          where: { id: deduction.inventoryItemId },
        });

        const newStock = item.currentStock.minus(deduction.totalQuantity);

        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { currentStock: newStock },
        });

        await tx.stockMovement.create({
          data: {
            restaurantId,
            inventoryItemId: item.id,
            fromLocationId: item.locationId ?? null,
            type: 'SALE_CONSUMPTION',
            quantityChange: deduction.totalQuantity.negated(),
            balanceAfter: newStock,
            unitCost: deduction.unitCost,
            totalCost: deduction.totalQuantity.mul(deduction.unitCost),
            referenceType: 'ORDER',
            referenceId: order.id,
            reason: `Order ${order.orderCode} consumption`,
            createdById: actorId ?? null,
          },
        });

        if (newStock.lessThanOrEqualTo(item.minStockLevel)) {
          lowStockAlerts.push({
            itemId: item.id,
            name: item.name,
            currentStock: newStock.toNumber(),
            minStockLevel: item.minStockLevel.toNumber(),
          });
        }
      }
    });

    for (const alert of lowStockAlerts) {
      RealtimeService.emitToRestaurant(restaurantId, 'inventory:low_stock', alert);
    }
  }

  // ---------------------------------------------------------------------------
  // 10. Immutable Stock Movement Ledger History
  // ---------------------------------------------------------------------------
  public static async listLedger(restaurantId: string, query: ListLedgerQuery) {
    const where: Prisma.StockMovementWhereInput = { restaurantId };
    if (query.inventoryItemId) where.inventoryItemId = query.inventoryItemId;
    if (query.locationId) {
      where.OR = [{ fromLocationId: query.locationId }, { toLocationId: query.locationId }];
    }
    if (query.type) where.type = query.type;
    if (query.referenceType) where.referenceType = query.referenceType;
    if (query.startDate && query.endDate) {
      where.createdAt = {
        gte: new Date(query.startDate),
        lte: new Date(new Date(query.endDate).setHours(23, 59, 59, 999)),
      };
    }

    const [total, movements] = await Promise.all([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          inventoryItem: {
            select: { id: true, itemCode: true, name: true, unit: true },
          },
          fromLocation: { select: { id: true, name: true } },
          toLocation: { select: { id: true, name: true } },
          createdByUser: { select: { id: true, name: true, username: true } },
        },
      }),
    ]);

    return {
      movements: movements.map((m) => ({
        ...m,
        quantityChange: Number(m.quantityChange),
        balanceAfter: Number(m.balanceAfter),
        unitCost: Number(m.unitCost),
        totalCost: Number(m.totalCost),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // 11. Summaries, Low-Stock Alerts & Valuation Reports
  // ---------------------------------------------------------------------------
  public static async getInventorySummary(restaurantId: string) {
    const items = await prisma.inventoryItem.findMany({
      where: { restaurantId, isActive: true },
      select: {
        currentStock: true,
        costPerUnit: true,
        minStockLevel: true,
      },
    });

    let totalValuation = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    for (const i of items) {
      const stock = Number(i.currentStock);
      const cost = Number(i.costPerUnit);
      const minStock = Number(i.minStockLevel);

      totalValuation += stock * cost;
      if (stock <= minStock) lowStockCount += 1;
      if (stock <= 0) outOfStockCount += 1;
    }

    return {
      totalItemsCount: items.length,
      totalValuation: Number(totalValuation.toFixed(2)),
      lowStockItemsCount: lowStockCount,
      outOfStockItemsCount: outOfStockCount,
    };
  }

  public static async getLowStockItems(restaurantId: string) {
    const items = await prisma.inventoryItem.findMany({
      where: { restaurantId, isActive: true },
      include: {
        supplier: { select: { id: true, name: true, phone: true, email: true } },
        location: { select: { id: true, name: true } },
      },
    });

    const lowStock = items
      .filter((i) => Number(i.currentStock) <= Number(i.minStockLevel))
      .map((i) => {
        const stock = Number(i.currentStock);
        const minLevel = Number(i.minStockLevel);
        const target = i.targetStockLevel ? Number(i.targetStockLevel) : minLevel * 2;
        return {
          id: i.id,
          itemCode: i.itemCode,
          name: i.name,
          unit: i.unit,
          costPerUnit: Number(i.costPerUnit),
          currentStock: stock,
          minStockLevel: minLevel,
          targetStockLevel: target,
          recommendedReorderQuantity: Math.max(0, Number((target - stock).toFixed(2))),
          estimatedReorderCost: Number(
            (Math.max(0, target - stock) * Number(i.costPerUnit)).toFixed(2),
          ),
          supplier: i.supplier,
          location: i.location,
        };
      });

    return {
      totalLowStockItems: lowStock.length,
      items: lowStock,
    };
  }

  public static async getValuationReport(restaurantId: string) {
    const items = await prisma.inventoryItem.findMany({
      where: { restaurantId, isActive: true },
      include: {
        location: { select: { id: true, name: true } },
      },
    });

    const locationMap = new Map<
      string,
      { locationName: string; itemCount: number; totalValuation: number }
    >();
    let grandValuation = 0;

    const itemized = items.map((i) => {
      const stock = Number(i.currentStock);
      const cost = Number(i.costPerUnit);
      const val = Number((stock * cost).toFixed(2));
      grandValuation += val;

      const locId = i.location?.id ?? 'unassigned';
      const locName = i.location?.name ?? 'Unassigned Location';

      const existingLoc = locationMap.get(locId);
      if (!existingLoc) {
        locationMap.set(locId, {
          locationName: locName,
          itemCount: 1,
          totalValuation: val,
        });
      } else {
        existingLoc.itemCount += 1;
        existingLoc.totalValuation += val;
      }

      return {
        id: i.id,
        itemCode: i.itemCode,
        name: i.name,
        unit: i.unit,
        costPerUnit: cost,
        currentStock: stock,
        totalValuation: val,
        location: i.location,
      };
    });

    return {
      grandTotalValuation: Number(grandValuation.toFixed(2)),
      locationsBreakdown: Array.from(locationMap.entries()).map(([locId, data]) => ({
        locationId: locId,
        locationName: data.locationName,
        itemCount: data.itemCount,
        totalValuation: Number(data.totalValuation.toFixed(2)),
        percentageOfTotal:
          grandValuation > 0
            ? Number(((data.totalValuation / grandValuation) * 100).toFixed(2))
            : 0,
      })),
      items: itemized,
    };
  }
}
