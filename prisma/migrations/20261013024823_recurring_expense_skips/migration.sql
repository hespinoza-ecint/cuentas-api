-- CreateTable
CREATE TABLE "RecurringExpenseSkip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "recurringExpenseId" TEXT NOT NULL,
    "occurrenceDate" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecurringExpenseSkip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecurringExpenseSkip_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "RecurringExpense" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RecurringExpenseSkip_userId_idx" ON "RecurringExpenseSkip"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringExpenseSkip_recurringExpenseId_occurrenceDate_key" ON "RecurringExpenseSkip"("recurringExpenseId", "occurrenceDate");
