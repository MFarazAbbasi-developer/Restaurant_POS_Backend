-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'DIGITAL_WALLET', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CashTransactionType" AS ENUM ('OPENING_FLOAT', 'CASH_SALE', 'CASH_REFUND', 'CASH_DROP', 'PAY_IN', 'PAY_OUT');

-- AlterEnum
ALTER TYPE "OrderPaymentStatus" ADD VALUE 'PARTIALLY_REFUNDED';

-- CreateTable
CREATE TABLE "cashier_shifts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "registerName" TEXT NOT NULL DEFAULT 'Main Register',
    "businessDate" TEXT NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openingCash" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cashSales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cashRefunds" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cashDrops" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cashAdjustments" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "expectedClosingCash" DECIMAL(10,2),
    "actualClosingCash" DECIMAL(10,2),
    "variance" DECIMAL(10,2),
    "closedById" TEXT,
    "notes" TEXT,
    "closingNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cashier_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "shiftId" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "amount" DECIMAL(10,2) NOT NULL,
    "amountTendered" DECIMAL(10,2),
    "changeAmount" DECIMAL(10,2),
    "reference" TEXT,
    "cardLast4" TEXT,
    "cardBrand" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
    "refundedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_refunds" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "shiftId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "refundMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "managerPinVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_transactions" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "type" "CashTransactionType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT,
    "paymentId" TEXT,
    "refundId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cashier_shifts_restaurantId_idx" ON "cashier_shifts"("restaurantId");

-- CreateIndex
CREATE INDEX "cashier_shifts_restaurantId_cashierId_status_idx" ON "cashier_shifts"("restaurantId", "cashierId", "status");

-- CreateIndex
CREATE INDEX "cashier_shifts_restaurantId_businessDate_idx" ON "cashier_shifts"("restaurantId", "businessDate");

-- CreateIndex
CREATE INDEX "cashier_shifts_restaurantId_status_idx" ON "cashier_shifts"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "payments_restaurantId_idx" ON "payments"("restaurantId");

-- CreateIndex
CREATE INDEX "payments_restaurantId_orderId_idx" ON "payments"("restaurantId", "orderId");

-- CreateIndex
CREATE INDEX "payments_restaurantId_shiftId_idx" ON "payments"("restaurantId", "shiftId");

-- CreateIndex
CREATE INDEX "payments_restaurantId_paymentMethod_idx" ON "payments"("restaurantId", "paymentMethod");

-- CreateIndex
CREATE INDEX "payments_restaurantId_status_idx" ON "payments"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "payments_restaurantId_reference_idx" ON "payments"("restaurantId", "reference");

-- CreateIndex
CREATE INDEX "payments_restaurantId_createdAt_idx" ON "payments"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "payment_refunds_restaurantId_idx" ON "payment_refunds"("restaurantId");

-- CreateIndex
CREATE INDEX "payment_refunds_restaurantId_paymentId_idx" ON "payment_refunds"("restaurantId", "paymentId");

-- CreateIndex
CREATE INDEX "payment_refunds_restaurantId_orderId_idx" ON "payment_refunds"("restaurantId", "orderId");

-- CreateIndex
CREATE INDEX "payment_refunds_restaurantId_shiftId_idx" ON "payment_refunds"("restaurantId", "shiftId");

-- CreateIndex
CREATE INDEX "payment_refunds_restaurantId_createdAt_idx" ON "payment_refunds"("restaurantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "cash_transactions_paymentId_key" ON "cash_transactions"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "cash_transactions_refundId_key" ON "cash_transactions"("refundId");

-- CreateIndex
CREATE INDEX "cash_transactions_restaurantId_idx" ON "cash_transactions"("restaurantId");

-- CreateIndex
CREATE INDEX "cash_transactions_restaurantId_shiftId_idx" ON "cash_transactions"("restaurantId", "shiftId");

-- CreateIndex
CREATE INDEX "cash_transactions_restaurantId_type_idx" ON "cash_transactions"("restaurantId", "type");

-- CreateIndex
CREATE INDEX "cash_transactions_restaurantId_createdAt_idx" ON "cash_transactions"("restaurantId", "createdAt");

-- AddForeignKey
ALTER TABLE "cashier_shifts" ADD CONSTRAINT "cashier_shifts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_shifts" ADD CONSTRAINT "cashier_shifts_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashier_shifts" ADD CONSTRAINT "cashier_shifts_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "cashier_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "cashier_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "cashier_shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "payment_refunds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
