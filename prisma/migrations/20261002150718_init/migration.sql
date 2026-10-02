-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "status" TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "emailVerifiedAt" DATETIME,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastLoginAt" DATETIME,
    "deletionRequestedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "locale" TEXT NOT NULL DEFAULT 'es-MX',
    "holidayCalendarCode" TEXT NOT NULL DEFAULT 'MX_BANKING',
    "minCashBuffer" INTEGER NOT NULL DEFAULT 0,
    "maxUtilizationBps" INTEGER NOT NULL DEFAULT 3000,
    "variableIncomeFactorBps" INTEGER NOT NULL DEFAULT 9000,
    "pendingIncomeGraceDays" INTEGER NOT NULL DEFAULT 3,
    "backdateLimitDays" INTEGER NOT NULL DEFAULT 60,
    "projectionMinDays" INTEGER NOT NULL DEFAULT 60,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "icon" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "calendarCode" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "changes" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "IdempotencyRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE INDEX "Category_userId_parentId_name_idx" ON "Category"("userId", "parentId", "name");

-- CreateIndex
CREATE INDEX "Category_kind_idx" ON "Category"("kind");

-- CreateIndex
CREATE INDEX "Holiday_calendarCode_idx" ON "Holiday"("calendarCode");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_calendarCode_date_key" ON "Holiday"("calendarCode", "date");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_userId_key_key" ON "IdempotencyRecord"("userId", "key");
