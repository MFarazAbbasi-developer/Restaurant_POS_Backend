-- CreateEnum
CREATE TYPE "DeliveryOrderStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliveryPaymentStatus" AS ENUM ('PENDING', 'PAID');

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "landmark" TEXT,
    "deliveryZoneId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_zones" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deliveryCharge" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "estimatedMinutes" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_orders" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "orderCode" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "landmark" TEXT,
    "deliveryZoneId" TEXT,
    "deliveryZoneName" TEXT,
    "deliveryCharge" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "packagingCharge" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "taxRate" DECIMAL(5,2),
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "paymentStatus" "DeliveryPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT NOT NULL DEFAULT 'CASH',
    "status" "DeliveryOrderStatus" NOT NULL DEFAULT 'PENDING',
    "riderId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "specialInstructions" TEXT,
    "isAggregator" BOOLEAN NOT NULL DEFAULT false,
    "aggregatorName" TEXT,
    "aggregatorReference" TEXT,
    "isSettled" BOOLEAN NOT NULL DEFAULT false,
    "settledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_order_items" (
    "id" TEXT NOT NULL,
    "deliveryOrderId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "variantId" TEXT,
    "name" TEXT NOT NULL,
    "variantName" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "specialInstructions" TEXT,
    "modifiers" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_daily_sequences" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "lastOrderNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_daily_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_settlements" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "receivedById" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "expectedAmount" DECIMAL(10,2) NOT NULL,
    "collectedAmount" DECIMAL(10,2) NOT NULL,
    "remittedAmount" DECIMAL(10,2) NOT NULL,
    "varianceAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ordersCount" INTEGER NOT NULL,
    "orderIds" JSONB NOT NULL,
    "notes" TEXT,
    "settledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_restaurantId_idx" ON "customers"("restaurantId");

-- CreateIndex
CREATE INDEX "customers_restaurantId_phone_idx" ON "customers"("restaurantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "customers_restaurantId_phone_key" ON "customers"("restaurantId", "phone");

-- CreateIndex
CREATE INDEX "customer_addresses_customerId_idx" ON "customer_addresses"("customerId");

-- CreateIndex
CREATE INDEX "delivery_zones_restaurantId_idx" ON "delivery_zones"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zones_restaurantId_name_key" ON "delivery_zones"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "delivery_orders_restaurantId_idx" ON "delivery_orders"("restaurantId");

-- CreateIndex
CREATE INDEX "delivery_orders_restaurantId_status_idx" ON "delivery_orders"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "delivery_orders_restaurantId_riderId_status_idx" ON "delivery_orders"("restaurantId", "riderId", "status");

-- CreateIndex
CREATE INDEX "delivery_orders_restaurantId_businessDate_idx" ON "delivery_orders"("restaurantId", "businessDate");

-- CreateIndex
CREATE INDEX "delivery_orders_restaurantId_createdAt_idx" ON "delivery_orders"("restaurantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_orders_restaurantId_orderCode_key" ON "delivery_orders"("restaurantId", "orderCode");

-- CreateIndex
CREATE INDEX "delivery_order_items_deliveryOrderId_idx" ON "delivery_order_items"("deliveryOrderId");

-- CreateIndex
CREATE INDEX "delivery_order_items_menuItemId_idx" ON "delivery_order_items"("menuItemId");

-- CreateIndex
CREATE INDEX "delivery_daily_sequences_restaurantId_idx" ON "delivery_daily_sequences"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_daily_sequences_restaurantId_businessDate_key" ON "delivery_daily_sequences"("restaurantId", "businessDate");

-- CreateIndex
CREATE INDEX "rider_settlements_restaurantId_idx" ON "rider_settlements"("restaurantId");

-- CreateIndex
CREATE INDEX "rider_settlements_restaurantId_riderId_idx" ON "rider_settlements"("restaurantId", "riderId");

-- CreateIndex
CREATE INDEX "rider_settlements_restaurantId_businessDate_idx" ON "rider_settlements"("restaurantId", "businessDate");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "delivery_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "delivery_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_order_items" ADD CONSTRAINT "delivery_order_items_deliveryOrderId_fkey" FOREIGN KEY ("deliveryOrderId") REFERENCES "delivery_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_order_items" ADD CONSTRAINT "delivery_order_items_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_order_items" ADD CONSTRAINT "delivery_order_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "menu_item_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_daily_sequences" ADD CONSTRAINT "delivery_daily_sequences_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_settlements" ADD CONSTRAINT "rider_settlements_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_settlements" ADD CONSTRAINT "rider_settlements_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_settlements" ADD CONSTRAINT "rider_settlements_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
