-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RecurringExpense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT,
    "cashAccountId" TEXT,
    "creditCardId" TEXT,
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
    CONSTRAINT "RecurringExpense_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "CreditCard" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RecurringExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RecurringExpense" ("amount", "amountType", "cashAccountId", "categoryId", "config", "createdAt", "deletedAt", "endDate", "frequency", "id", "isActive", "name", "nonBusinessDayRule", "paymentMethod", "startDate", "updatedAt", "useHolidays", "userId") SELECT "amount", "amountType", "cashAccountId", "categoryId", "config", "createdAt", "deletedAt", "endDate", "frequency", "id", "isActive", "name", "nonBusinessDayRule", "paymentMethod", "startDate", "updatedAt", "useHolidays", "userId" FROM "RecurringExpense";
DROP TABLE "RecurringExpense";
ALTER TABLE "new_RecurringExpense" RENAME TO "RecurringExpense";
CREATE INDEX "RecurringExpense_userId_isActive_idx" ON "RecurringExpense"("userId", "isActive");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_recurringExpenseId_occurrenceDate_key" ON "Purchase"("recurringExpenseId", "occurrenceDate");
