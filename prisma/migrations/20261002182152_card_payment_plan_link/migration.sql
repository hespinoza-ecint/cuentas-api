-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CardPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "creditCardId" TEXT NOT NULL,
    "cashAccountId" TEXT NOT NULL,
    "statementId" TEXT,
    "installmentPlanId" TEXT,
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
    CONSTRAINT "CardPayment_installmentPlanId_fkey" FOREIGN KEY ("installmentPlanId") REFERENCES "InstallmentPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CardPayment_cashMovementId_fkey" FOREIGN KEY ("cashMovementId") REFERENCES "CashMovement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CardPayment_cardLedgerEntryId_fkey" FOREIGN KEY ("cardLedgerEntryId") REFERENCES "CardLedgerEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CardPayment" ("amount", "cardLedgerEntryId", "cashAccountId", "cashMovementId", "createdAt", "creditCardId", "id", "notes", "paymentDate", "statementId", "status", "type", "updatedAt", "userId") SELECT "amount", "cardLedgerEntryId", "cashAccountId", "cashMovementId", "createdAt", "creditCardId", "id", "notes", "paymentDate", "statementId", "status", "type", "updatedAt", "userId" FROM "CardPayment";
DROP TABLE "CardPayment";
ALTER TABLE "new_CardPayment" RENAME TO "CardPayment";
CREATE UNIQUE INDEX "CardPayment_cashMovementId_key" ON "CardPayment"("cashMovementId");
CREATE UNIQUE INDEX "CardPayment_cardLedgerEntryId_key" ON "CardPayment"("cardLedgerEntryId");
CREATE INDEX "CardPayment_userId_paymentDate_idx" ON "CardPayment"("userId", "paymentDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
