-- CreateTable
CREATE TABLE "RecommendationRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "params" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserRecommendationRuleOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "isEnabled" BOOLEAN,
    "weight" INTEGER,
    "params" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserRecommendationRuleOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserRecommendationRuleOverride_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "RecommendationRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecommendationHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "recommendedCardId" TEXT,
    "purchaseId" TEXT,
    "engineVersion" TEXT NOT NULL,
    "requestInput" TEXT NOT NULL,
    "contextSnapshot" TEXT NOT NULL,
    "rulesSnapshot" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "score" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecommendationHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecommendationHistory_recommendedCardId_fkey" FOREIGN KEY ("recommendedCardId") REFERENCES "CreditCard" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Purchase" (
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
    CONSTRAINT "Purchase_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "RecurringExpense" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Purchase_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "RecommendationHistory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Purchase" ("amount", "categoryId", "createdAt", "creditCardId", "description", "id", "notes", "occurrenceDate", "purchaseDate", "recommendationId", "recurringExpenseId", "status", "type", "updatedAt", "userId") SELECT "amount", "categoryId", "createdAt", "creditCardId", "description", "id", "notes", "occurrenceDate", "purchaseDate", "recommendationId", "recurringExpenseId", "status", "type", "updatedAt", "userId" FROM "Purchase";
DROP TABLE "Purchase";
ALTER TABLE "new_Purchase" RENAME TO "Purchase";
CREATE INDEX "Purchase_userId_creditCardId_purchaseDate_idx" ON "Purchase"("userId", "creditCardId", "purchaseDate");
CREATE INDEX "Purchase_userId_status_idx" ON "Purchase"("userId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationRule_code_key" ON "RecommendationRule"("code");

-- CreateIndex
CREATE UNIQUE INDEX "UserRecommendationRuleOverride_userId_ruleId_key" ON "UserRecommendationRuleOverride"("userId", "ruleId");

-- CreateIndex
CREATE INDEX "RecommendationHistory_userId_createdAt_idx" ON "RecommendationHistory"("userId", "createdAt");
