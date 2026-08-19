-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'BILL_PRINTED', 'RESERVED', 'CLEANING');

-- CreateEnum
CREATE TYPE "TableOrderStatus" AS ENUM ('ACTIVE', 'BILL_PRINTED', 'CLOSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "zones" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tables" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "TableStatus" NOT NULL DEFAULT 'AVAILABLE',
    "mergedIntoTableId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_orders" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "orderCode" TEXT NOT NULL,
    "subBillName" TEXT,
    "guestCount" INTEGER NOT NULL DEFAULT 1,
    "status" "TableOrderStatus" NOT NULL DEFAULT 'ACTIVE',
    "totalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "openedByUserId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "zones_restaurantId_idx" ON "zones"("restaurantId");

-- CreateIndex
CREATE INDEX "zones_restaurantId_isActive_sortOrder_idx" ON "zones"("restaurantId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "zones_restaurantId_name_key" ON "zones"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "tables_restaurantId_idx" ON "tables"("restaurantId");

-- CreateIndex
CREATE INDEX "tables_zoneId_idx" ON "tables"("zoneId");

-- CreateIndex
CREATE INDEX "tables_mergedIntoTableId_idx" ON "tables"("mergedIntoTableId");

-- CreateIndex
CREATE INDEX "tables_restaurantId_zoneId_isActive_sortOrder_idx" ON "tables"("restaurantId", "zoneId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "tables_restaurantId_status_idx" ON "tables"("restaurantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tables_restaurantId_name_key" ON "tables"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "table_orders_restaurantId_idx" ON "table_orders"("restaurantId");

-- CreateIndex
CREATE INDEX "table_orders_tableId_idx" ON "table_orders"("tableId");

-- CreateIndex
CREATE INDEX "table_orders_restaurantId_tableId_status_idx" ON "table_orders"("restaurantId", "tableId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "table_orders_restaurantId_orderCode_key" ON "table_orders"("restaurantId", "orderCode");

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_mergedIntoTableId_fkey" FOREIGN KEY ("mergedIntoTableId") REFERENCES "tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_orders" ADD CONSTRAINT "table_orders_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_orders" ADD CONSTRAINT "table_orders_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_orders" ADD CONSTRAINT "table_orders_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
