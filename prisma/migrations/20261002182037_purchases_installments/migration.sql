-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "creditCardId" TEXT NOT NULL,
    "categoryId" TEXT,
    "recurringExpenseId" TEXT,
    "recommendationId" TEXT,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "purchaseDate" TEXT NOT NULL,
    "occurrenceDate" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Purchase_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Purchase_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Purchase_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "RecurringExpense" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InstallmentPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "creditCardId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "principal" INTEGER NOT NULL,
    "months" INTEGER NOT NULL,
    "annualRateBps" INTEGER NOT NULL DEFAULT 0,
    "ivaRateBps" INTEGER NOT NULL DEFAULT 1600,
    "commissionAmount" INTEGER NOT NULL DEFAULT 0,
    "commissionMode" TEXT NOT NULL DEFAULT 'NONE',
    "amortizationMethod" TEXT NOT NULL DEFAULT 'FRENCH',
    "firstStatementDate" TEXT NOT NULL,
    "estimatedMonthlyPayment" INTEGER NOT NULL,
    "totalInterest" INTEGER NOT NULL DEFAULT 0,
    "totalIva" INTEGER NOT NULL DEFAULT 0,
    "outstandingPrincipal" INTEGER NOT NULL,
    "prepaymentMode" TEXT NOT NULL DEFAULT 'REDUCE_TERM',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InstallmentPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InstallmentPlan_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InstallmentPlan_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Installment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "statementId" TEXT,
    "number" INTEGER NOT NULL,
    "statementCutDate" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "principal" INTEGER NOT NULL,
    "interest" INTEGER NOT NULL DEFAULT 0,
    "iva" INTEGER NOT NULL DEFAULT 0,
    "fee" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Installment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Installment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InstallmentPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Installment_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "CardStatement" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PaymentAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "cardPaymentId" TEXT NOT NULL,
    "statementId" TEXT,
    "targetType" TEXT NOT NULL,
    "installmentId" TEXT,
    "amount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentAllocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaymentAllocation_cardPaymentId_fkey" FOREIGN KEY ("cardPaymentId") REFERENCES "CardPayment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaymentAllocation_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "CardStatement" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PaymentAllocation_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "Installment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PaymentAllocation" ("amount", "cardPaymentId", "createdAt", "id", "installmentId", "statementId", "targetType", "userId") SELECT "amount", "cardPaymentId", "createdAt", "id", "installmentId", "statementId", "targetType", "userId" FROM "PaymentAllocation";
DROP TABLE "PaymentAllocation";
ALTER TABLE "new_PaymentAllocation" RENAME TO "PaymentAllocation";
CREATE INDEX "PaymentAllocation_cardPaymentId_idx" ON "PaymentAllocation"("cardPaymentId");
CREATE INDEX "PaymentAllocation_statementId_idx" ON "PaymentAllocation"("statementId");
CREATE INDEX "PaymentAllocation_installmentId_idx" ON "PaymentAllocation"("installmentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Purchase_userId_creditCardId_purchaseDate_idx" ON "Purchase"("userId", "creditCardId", "purchaseDate");

-- CreateIndex
CREATE INDEX "Purchase_userId_status_idx" ON "Purchase"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentPlan_purchaseId_key" ON "InstallmentPlan"("purchaseId");

-- CreateIndex
CREATE INDEX "InstallmentPlan_userId_status_idx" ON "InstallmentPlan"("userId", "status");

-- CreateIndex
CREATE INDEX "Installment_userId_dueDate_idx" ON "Installment"("userId", "dueDate");

-- CreateIndex
CREATE INDEX "Installment_userId_status_idx" ON "Installment"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Installment_planId_number_key" ON "Installment"("planId", "number");
