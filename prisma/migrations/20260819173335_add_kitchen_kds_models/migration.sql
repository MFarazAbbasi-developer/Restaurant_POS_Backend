-- CreateEnum
CREATE TYPE "ItemKitchenStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'SERVED');

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "kitchenNotes" TEXT,
ADD COLUMN     "kitchenStatus" "ItemKitchenStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "preparedAt" TIMESTAMP(3),
ADD COLUMN     "stationId" TEXT;

-- CreateTable
CREATE TABLE "kitchen_stations" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kitchen_stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_kitchen_stations" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_kitchen_stations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kitchen_stations_restaurantId_idx" ON "kitchen_stations"("restaurantId");

-- CreateIndex
CREATE INDEX "kitchen_stations_restaurantId_isActive_idx" ON "kitchen_stations"("restaurantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "kitchen_stations_restaurantId_name_key" ON "kitchen_stations"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "category_kitchen_stations_stationId_idx" ON "category_kitchen_stations"("stationId");

-- CreateIndex
CREATE INDEX "category_kitchen_stations_categoryId_idx" ON "category_kitchen_stations"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "category_kitchen_stations_stationId_categoryId_key" ON "category_kitchen_stations"("stationId", "categoryId");

-- CreateIndex
CREATE INDEX "order_items_stationId_idx" ON "order_items"("stationId");

-- CreateIndex
CREATE INDEX "order_items_kitchenStatus_idx" ON "order_items"("kitchenStatus");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "kitchen_stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_stations" ADD CONSTRAINT "kitchen_stations_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_kitchen_stations" ADD CONSTRAINT "category_kitchen_stations_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "kitchen_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_kitchen_stations" ADD CONSTRAINT "category_kitchen_stations_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
