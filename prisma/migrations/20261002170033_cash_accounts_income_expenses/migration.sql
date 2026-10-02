-- CreateTable
CREATE TABLE "CashAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CASH',
    "isSpendable" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "currentBalance" INTEGER NOT NULL DEFAULT 0,
    "balanceVersion" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastReconciledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "CashAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "cashAccountId" TEXT NOT NULL,
    "reversesMovementId" TEXT,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "occurredOn" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reason" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CashMovement_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "CashAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CashMovement_reversesMovementId_fkey" FOREIGN KEY ("reversesMovementId") REFERENCES "CashMovement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IncomeSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "cashAccountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "payer" TEXT,
    "amountType" TEXT NOT NULL DEFAULT 'FIXED',
    "estimatedAmount" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "IncomeSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IncomeSource_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "CashAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "IncomeSource_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IncomeSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "incomeSourceId" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "nonBusinessDayRule" TEXT NOT NULL DEFAULT 'PREVIOUS',
    "useHolidays" BOOLEAN NOT NULL DEFAULT true,
    "amountOverride" INTEGER,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IncomeSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IncomeSchedule_incomeSourceId_fkey" FOREIGN KEY ("incomeSourceId") REFERENCES "IncomeSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IncomeTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "incomeSourceId" TEXT NOT NULL,
    "incomeScheduleId" TEXT,
    "cashMovementId" TEXT,
    "expectedDate" TEXT,
    "expectedAmount" INTEGER,
    "actualDate" TEXT,
    "actualAmount" INTEGER,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IncomeTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IncomeTransaction_incomeSourceId_fkey" FOREIGN KEY ("incomeSourceId") REFERENCES "IncomeSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IncomeTransaction_incomeScheduleId_fkey" FOREIGN KEY ("incomeScheduleId") REFERENCES "IncomeSchedule" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IncomeTransaction_cashMovementId_fkey" FOREIGN KEY ("cashMovementId") REFERENCES "CashMovement" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecurringExpense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT,
    "cashAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "amountType" TEXT NOT NULL DEFAULT 'FIXED',
    "paymentMethod" TEXT NOT NULL DEFAULT 'CASH_ACCOUNT',
    "frequency" TEXT NOT NULL,
    "config" TEXT NOT NULL,
    "nonBusinessDayRule" TEXT NOT NULL DEFAULT 'NONE',
    "useHolidays" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "RecurringExpense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecurringExpense_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "CashAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RecurringExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "cashAccountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "recurringExpenseId" TEXT,
    "cashMovementId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "expenseDate" TEXT NOT NULL,
    "occurrenceDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PAID',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "CashAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "RecurringExpense" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_cashMovementId_fkey" FOREIGN KEY ("cashMovementId") REFERENCES "CashMovement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CashAccount_userId_deletedAt_idx" ON "CashAccount"("userId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CashAccount_userId_name_key" ON "CashAccount"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_reversesMovementId_key" ON "CashMovement"("reversesMovementId");

-- CreateIndex
CREATE INDEX "CashMovement_userId_cashAccountId_occurredOn_idx" ON "CashMovement"("userId", "cashAccountId", "occurredOn");

-- CreateIndex
CREATE INDEX "CashMovement_userId_createdAt_idx" ON "CashMovement"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CashMovement_sourceType_sourceId_idx" ON "CashMovement"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "IncomeSource_userId_isActive_idx" ON "IncomeSource"("userId", "isActive");

-- CreateIndex
CREATE INDEX "IncomeSchedule_userId_isActive_idx" ON "IncomeSchedule"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "IncomeTransaction_cashMovementId_key" ON "IncomeTransaction"("cashMovementId");

-- CreateIndex
CREATE INDEX "IncomeTransaction_userId_status_idx" ON "IncomeTransaction"("userId", "status");

-- CreateIndex
CREATE INDEX "IncomeTransaction_userId_actualDate_idx" ON "IncomeTransaction"("userId", "actualDate");

-- CreateIndex
CREATE UNIQUE INDEX "IncomeTransaction_incomeScheduleId_expectedDate_key" ON "IncomeTransaction"("incomeScheduleId", "expectedDate");

-- CreateIndex
CREATE INDEX "RecurringExpense_userId_isActive_idx" ON "RecurringExpense"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_cashMovementId_key" ON "Expense"("cashMovementId");

-- CreateIndex
CREATE INDEX "Expense_userId_expenseDate_idx" ON "Expense"("userId", "expenseDate");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_recurringExpenseId_occurrenceDate_key" ON "Expense"("recurringExpenseId", "occurrenceDate");
