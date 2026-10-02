-- CreateTable
CREATE TABLE "CreditCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "creditLimit" INTEGER NOT NULL,
    "currentBalance" INTEGER NOT NULL DEFAULT 0,
    "availableCredit" INTEGER NOT NULL DEFAULT 0,
    "balanceVersion" INTEGER NOT NULL DEFAULT 0,
    "annualRateBps" INTEGER NOT NULL DEFAULT 0,
    "annualFee" INTEGER,
    "annualFeeMonth" INTEGER,
    "cutDay" INTEGER NOT NULL,
    "dueDateMode" TEXT NOT NULL DEFAULT 'DAYS_AFTER_CUT',
    "dueDay" INTEGER,
    "dueDaysAfterCut" INTEGER,
    "dueNonBusinessDayRule" TEXT NOT NULL DEFAULT 'PREVIOUS',
    "sameDayCutIncluded" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "CreditCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CardLedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "creditCardId" TEXT NOT NULL,
    "statementId" TEXT,
    "reversesEntryId" TEXT,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "occurredOn" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CardLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CardLedgerEntry_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CardLedgerEntry_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "CardStatement" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CardLedgerEntry_reversesEntryId_fkey" FOREIGN KEY ("reversesEntryId") REFERENCES "CardLedgerEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CardStatement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "creditCardId" TEXT NOT NULL,
    "periodStart" TEXT NOT NULL,
    "cutDate" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "statementBalance" INTEGER NOT NULL,
    "cycleCharges" INTEGER NOT NULL DEFAULT 0,
    "noInterestPaymentCalc" INTEGER NOT NULL,
    "noInterestPaymentReported" INTEGER,
    "minimumPaymentReported" INTEGER,
    "minimumPaymentEstimated" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'CLOSED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CardStatement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CardStatement_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CardPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "creditCardId" TEXT NOT NULL,
    "cashAccountId" TEXT NOT NULL,
    "statementId" TEXT,
    "cashMovementId" TEXT NOT NULL,
    "cardLedgerEntryId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentDate" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'STATEMENT',
    "status" TEXT NOT NULL DEFAULT 'APPLIED',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CardPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CardPayment_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CardPayment_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "CashAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CardPayment_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "CardStatement" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CardPayment_cashMovementId_fkey" FOREIGN KEY ("cashMovementId") REFERENCES "CashMovement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CardPayment_cardLedgerEntryId_fkey" FOREIGN KEY ("cardLedgerEntryId") REFERENCES "CardLedgerEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
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
    CONSTRAINT "PaymentAllocation_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "CardStatement" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CreditCard_userId_status_idx" ON "CreditCard"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CreditCard_userId_alias_key" ON "CreditCard"("userId", "alias");

-- CreateIndex
CREATE UNIQUE INDEX "CardLedgerEntry_reversesEntryId_key" ON "CardLedgerEntry"("reversesEntryId");

-- CreateIndex
CREATE INDEX "CardLedgerEntry_userId_creditCardId_occurredOn_idx" ON "CardLedgerEntry"("userId", "creditCardId", "occurredOn");

-- CreateIndex
CREATE INDEX "CardLedgerEntry_sourceType_sourceId_idx" ON "CardLedgerEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "CardStatement_userId_dueDate_idx" ON "CardStatement"("userId", "dueDate");

-- CreateIndex
CREATE INDEX "CardStatement_userId_status_idx" ON "CardStatement"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CardStatement_creditCardId_cutDate_key" ON "CardStatement"("creditCardId", "cutDate");

-- CreateIndex
CREATE UNIQUE INDEX "CardPayment_cashMovementId_key" ON "CardPayment"("cashMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "CardPayment_cardLedgerEntryId_key" ON "CardPayment"("cardLedgerEntryId");

-- CreateIndex
CREATE INDEX "CardPayment_userId_paymentDate_idx" ON "CardPayment"("userId", "paymentDate");

-- CreateIndex
CREATE INDEX "PaymentAllocation_cardPaymentId_idx" ON "PaymentAllocation"("cardPaymentId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_statementId_idx" ON "PaymentAllocation"("statementId");
