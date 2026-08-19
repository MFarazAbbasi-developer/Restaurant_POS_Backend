-- CreateEnum
CREATE TYPE "TakeawayOrderStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TakeawayPaymentStatus" AS ENUM ('PAID', 'PENDING');

-- CreateTable
CREATE TABLE "takeaway_orders" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tokenNumber" INTEGER NOT NULL,
    "orderCode" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "status" "TakeawayOrderStatus" NOT NULL DEFAULT 'PENDING',
    "paymentStatus" "TakeawayPaymentStatus" NOT NULL DEFAULT 'PAID',
    "paymentMethod" TEXT NOT NULL DEFAULT 'CASH',
    "subtotal" DECIMAL(10,2) NOT NULL,
    "taxRate" DECIMAL(5,2),
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "isPayOnPickup" BOOLEAN NOT NULL DEFAULT false,
    "specialInstructions" TEXT,
    "cancelReason" TEXT,
    "createdById" TEXT,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "takeaway_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "takeaway_order_items" (
    "id" TEXT NOT NULL,
    "takeawayOrderId" TEXT NOT NULL,
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

    CONSTRAINT "takeaway_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "takeaway_daily_sequences" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "lastTokenNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "takeaway_daily_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "takeaway_orders_restaurantId_idx" ON "takeaway_orders"("restaurantId");

-- CreateIndex
CREATE INDEX "takeaway_orders_restaurantId_status_idx" ON "takeaway_orders"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "takeaway_orders_restaurantId_businessDate_idx" ON "takeaway_orders"("restaurantId", "businessDate");

-- CreateIndex
CREATE INDEX "takeaway_orders_restaurantId_createdAt_idx" ON "takeaway_orders"("restaurantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "takeaway_orders_restaurantId_orderCode_key" ON "takeaway_orders"("restaurantId", "orderCode");

-- CreateIndex
CREATE UNIQUE INDEX "takeaway_orders_restaurantId_businessDate_tokenNumber_key" ON "takeaway_orders"("restaurantId", "businessDate", "tokenNumber");

-- CreateIndex
CREATE INDEX "takeaway_order_items_takeawayOrderId_idx" ON "takeaway_order_items"("takeawayOrderId");

-- CreateIndex
CREATE INDEX "takeaway_order_items_menuItemId_idx" ON "takeaway_order_items"("menuItemId");

-- CreateIndex
CREATE INDEX "takeaway_daily_sequences_restaurantId_idx" ON "takeaway_daily_sequences"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "takeaway_daily_sequences_restaurantId_businessDate_key" ON "takeaway_daily_sequences"("restaurantId", "businessDate");

-- AddForeignKey
ALTER TABLE "takeaway_orders" ADD CONSTRAINT "takeaway_orders_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takeaway_orders" ADD CONSTRAINT "takeaway_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takeaway_order_items" ADD CONSTRAINT "takeaway_order_items_takeawayOrderId_fkey" FOREIGN KEY ("takeawayOrderId") REFERENCES "takeaway_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takeaway_order_items" ADD CONSTRAINT "takeaway_order_items_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takeaway_order_items" ADD CONSTRAINT "takeaway_order_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "menu_item_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takeaway_daily_sequences" ADD CONSTRAINT "takeaway_daily_sequences_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
