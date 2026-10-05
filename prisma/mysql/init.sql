-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'USER',
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING_VERIFICATION',
    `emailVerifiedAt` DATETIME(3) NULL,
    `failedLoginCount` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `deletionRequestedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_status_idx`(`status`),
    INDEX `User_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserSettings` (
    `userId` VARCHAR(191) NOT NULL,
    `timezone` VARCHAR(191) NOT NULL DEFAULT 'America/Mexico_City',
    `locale` VARCHAR(191) NOT NULL DEFAULT 'es-MX',
    `holidayCalendarCode` VARCHAR(191) NOT NULL DEFAULT 'MX_BANKING',
    `minCashBuffer` INTEGER NOT NULL DEFAULT 0,
    `maxUtilizationBps` INTEGER NOT NULL DEFAULT 3000,
    `variableIncomeFactorBps` INTEGER NOT NULL DEFAULT 9000,
    `pendingIncomeGraceDays` INTEGER NOT NULL DEFAULT 3,
    `backdateLimitDays` INTEGER NOT NULL DEFAULT 60,
    `projectionMinDays` INTEGER NOT NULL DEFAULT 60,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Category` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `parentId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `icon` VARCHAR(191) NULL,
    `isSystem` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Category_userId_parentId_name_idx`(`userId`, `parentId`, `name`),
    INDEX `Category_kind_idx`(`kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Holiday` (
    `id` VARCHAR(191) NOT NULL,
    `calendarCode` VARCHAR(191) NOT NULL,
    `date` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Holiday_calendarCode_idx`(`calendarCode`),
    UNIQUE INDEX `Holiday_calendarCode_date_key`(`calendarCode`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `actorUserId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `changes` TEXT NULL,
    `ip` VARCHAR(191) NULL,
    `userAgent` TEXT NULL,
    `requestId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `AuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IdempotencyRecord` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `method` VARCHAR(191) NOT NULL,
    `path` VARCHAR(191) NOT NULL,
    `requestHash` VARCHAR(191) NOT NULL,
    `responseStatus` INTEGER NOT NULL,
    `responseBody` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `IdempotencyRecord_expiresAt_idx`(`expiresAt`),
    UNIQUE INDEX `IdempotencyRecord_userId_key_key`(`userId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `familyId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `clientType` VARCHAR(191) NOT NULL DEFAULT 'WEB',
    `deviceName` TEXT NULL,
    `ip` VARCHAR(191) NULL,
    `userAgent` TEXT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `lastUsedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,
    `revokedReason` VARCHAR(191) NULL,
    `replacedBySessionId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Session_tokenHash_key`(`tokenHash`),
    INDEX `Session_userId_revokedAt_idx`(`userId`, `revokedAt`),
    INDEX `Session_familyId_idx`(`familyId`),
    INDEX `Session_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VerificationToken` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VerificationToken_tokenHash_key`(`tokenHash`),
    INDEX `VerificationToken_userId_type_idx`(`userId`, `type`),
    INDEX `VerificationToken_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CashAccount` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'CASH',
    `isSpendable` BOOLEAN NOT NULL DEFAULT true,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'MXN',
    `currentBalance` INTEGER NOT NULL DEFAULT 0,
    `balanceVersion` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `lastReconciledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `CashAccount_userId_deletedAt_idx`(`userId`, `deletedAt`),
    UNIQUE INDEX `CashAccount_userId_name_key`(`userId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CashMovement` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `cashAccountId` VARCHAR(191) NOT NULL,
    `reversesMovementId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `occurredOn` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `reason` TEXT NULL,
    `sourceType` VARCHAR(191) NULL,
    `sourceId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CashMovement_reversesMovementId_key`(`reversesMovementId`),
    INDEX `CashMovement_userId_cashAccountId_occurredOn_idx`(`userId`, `cashAccountId`, `occurredOn`),
    INDEX `CashMovement_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `CashMovement_sourceType_sourceId_idx`(`sourceType`, `sourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IncomeSource` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `cashAccountId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `payer` VARCHAR(191) NULL,
    `amountType` VARCHAR(191) NOT NULL DEFAULT 'FIXED',
    `estimatedAmount` INTEGER NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `IncomeSource_userId_isActive_idx`(`userId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IncomeSchedule` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `incomeSourceId` VARCHAR(191) NOT NULL,
    `frequency` VARCHAR(191) NOT NULL,
    `config` TEXT NOT NULL,
    `nonBusinessDayRule` VARCHAR(191) NOT NULL DEFAULT 'PREVIOUS',
    `useHolidays` BOOLEAN NOT NULL DEFAULT true,
    `amountOverride` INTEGER NULL,
    `startDate` VARCHAR(191) NOT NULL,
    `endDate` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `IncomeSchedule_userId_isActive_idx`(`userId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IncomeTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `incomeSourceId` VARCHAR(191) NOT NULL,
    `incomeScheduleId` VARCHAR(191) NULL,
    `cashMovementId` VARCHAR(191) NULL,
    `expectedDate` VARCHAR(191) NULL,
    `expectedAmount` INTEGER NULL,
    `actualDate` VARCHAR(191) NULL,
    `actualAmount` INTEGER NULL,
    `status` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `IncomeTransaction_cashMovementId_key`(`cashMovementId`),
    INDEX `IncomeTransaction_userId_status_idx`(`userId`, `status`),
    INDEX `IncomeTransaction_userId_actualDate_idx`(`userId`, `actualDate`),
    UNIQUE INDEX `IncomeTransaction_incomeScheduleId_expectedDate_key`(`incomeScheduleId`, `expectedDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RecurringExpense` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NULL,
    `cashAccountId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `amountType` VARCHAR(191) NOT NULL DEFAULT 'FIXED',
    `paymentMethod` VARCHAR(191) NOT NULL DEFAULT 'CASH_ACCOUNT',
    `frequency` VARCHAR(191) NOT NULL,
    `config` TEXT NOT NULL,
    `nonBusinessDayRule` VARCHAR(191) NOT NULL DEFAULT 'NONE',
    `useHolidays` BOOLEAN NOT NULL DEFAULT true,
    `startDate` VARCHAR(191) NOT NULL,
    `endDate` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `RecurringExpense_userId_isActive_idx`(`userId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Expense` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `cashAccountId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NULL,
    `recurringExpenseId` VARCHAR(191) NULL,
    `cashMovementId` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `amount` INTEGER NOT NULL,
    `expenseDate` VARCHAR(191) NOT NULL,
    `occurrenceDate` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PAID',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Expense_cashMovementId_key`(`cashMovementId`),
    INDEX `Expense_userId_expenseDate_idx`(`userId`, `expenseDate`),
    UNIQUE INDEX `Expense_recurringExpenseId_occurrenceDate_key`(`recurringExpenseId`, `occurrenceDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CreditCard` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `alias` VARCHAR(191) NOT NULL,
    `institution` VARCHAR(191) NOT NULL,
    `last4` VARCHAR(191) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'MXN',
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `creditLimit` INTEGER NOT NULL,
    `currentBalance` INTEGER NOT NULL DEFAULT 0,
    `availableCredit` INTEGER NOT NULL DEFAULT 0,
    `balanceVersion` INTEGER NOT NULL DEFAULT 0,
    `annualRateBps` INTEGER NOT NULL DEFAULT 0,
    `annualFee` INTEGER NULL,
    `annualFeeMonth` INTEGER NULL,
    `cutDay` INTEGER NOT NULL,
    `dueDateMode` VARCHAR(191) NOT NULL DEFAULT 'DAYS_AFTER_CUT',
    `dueDay` INTEGER NULL,
    `dueDaysAfterCut` INTEGER NULL,
    `dueNonBusinessDayRule` VARCHAR(191) NOT NULL DEFAULT 'PREVIOUS',
    `sameDayCutIncluded` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `CreditCard_userId_status_idx`(`userId`, `status`),
    UNIQUE INDEX `CreditCard_userId_alias_key`(`userId`, `alias`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CardLedgerEntry` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `creditCardId` VARCHAR(191) NOT NULL,
    `statementId` VARCHAR(191) NULL,
    `reversesEntryId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `occurredOn` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `sourceType` VARCHAR(191) NULL,
    `sourceId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CardLedgerEntry_reversesEntryId_key`(`reversesEntryId`),
    INDEX `CardLedgerEntry_userId_creditCardId_occurredOn_idx`(`userId`, `creditCardId`, `occurredOn`),
    INDEX `CardLedgerEntry_sourceType_sourceId_idx`(`sourceType`, `sourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CardStatement` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `creditCardId` VARCHAR(191) NOT NULL,
    `periodStart` VARCHAR(191) NOT NULL,
    `cutDate` VARCHAR(191) NOT NULL,
    `dueDate` VARCHAR(191) NOT NULL,
    `statementBalance` INTEGER NOT NULL,
    `cycleCharges` INTEGER NOT NULL DEFAULT 0,
    `noInterestPaymentCalc` INTEGER NOT NULL,
    `noInterestPaymentReported` INTEGER NULL,
    `minimumPaymentReported` INTEGER NULL,
    `minimumPaymentEstimated` INTEGER NOT NULL,
    `paidAmount` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'CLOSED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `CardStatement_userId_dueDate_idx`(`userId`, `dueDate`),
    INDEX `CardStatement_userId_status_idx`(`userId`, `status`),
    UNIQUE INDEX `CardStatement_creditCardId_cutDate_key`(`creditCardId`, `cutDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CardPayment` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `creditCardId` VARCHAR(191) NOT NULL,
    `cashAccountId` VARCHAR(191) NOT NULL,
    `statementId` VARCHAR(191) NULL,
    `installmentPlanId` VARCHAR(191) NULL,
    `cashMovementId` VARCHAR(191) NOT NULL,
    `cardLedgerEntryId` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `paymentDate` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'STATEMENT',
    `status` VARCHAR(191) NOT NULL DEFAULT 'APPLIED',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CardPayment_cashMovementId_key`(`cashMovementId`),
    UNIQUE INDEX `CardPayment_cardLedgerEntryId_key`(`cardLedgerEntryId`),
    INDEX `CardPayment_userId_paymentDate_idx`(`userId`, `paymentDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentAllocation` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `cardPaymentId` VARCHAR(191) NOT NULL,
    `statementId` VARCHAR(191) NULL,
    `targetType` VARCHAR(191) NOT NULL,
    `installmentId` VARCHAR(191) NULL,
    `amount` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PaymentAllocation_cardPaymentId_idx`(`cardPaymentId`),
    INDEX `PaymentAllocation_statementId_idx`(`statementId`),
    INDEX `PaymentAllocation_installmentId_idx`(`installmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Purchase` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `creditCardId` VARCHAR(191) NOT NULL,
    `categoryId` VARCHAR(191) NULL,
    `recurringExpenseId` VARCHAR(191) NULL,
    `recommendationId` VARCHAR(191) NULL,
    `description` TEXT NOT NULL,
    `amount` INTEGER NOT NULL,
    `purchaseDate` VARCHAR(191) NOT NULL,
    `occurrenceDate` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Purchase_userId_creditCardId_purchaseDate_idx`(`userId`, `creditCardId`, `purchaseDate`),
    INDEX `Purchase_userId_status_idx`(`userId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InstallmentPlan` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `creditCardId` VARCHAR(191) NOT NULL,
    `purchaseId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `principal` INTEGER NOT NULL,
    `months` INTEGER NOT NULL,
    `annualRateBps` INTEGER NOT NULL DEFAULT 0,
    `ivaRateBps` INTEGER NOT NULL DEFAULT 1600,
    `commissionAmount` INTEGER NOT NULL DEFAULT 0,
    `commissionMode` VARCHAR(191) NOT NULL DEFAULT 'NONE',
    `amortizationMethod` VARCHAR(191) NOT NULL DEFAULT 'FRENCH',
    `firstStatementDate` VARCHAR(191) NOT NULL,
    `estimatedMonthlyPayment` INTEGER NOT NULL,
    `totalInterest` INTEGER NOT NULL DEFAULT 0,
    `totalIva` INTEGER NOT NULL DEFAULT 0,
    `outstandingPrincipal` INTEGER NOT NULL,
    `prepaymentMode` VARCHAR(191) NOT NULL DEFAULT 'REDUCE_TERM',
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `version` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `InstallmentPlan_purchaseId_key`(`purchaseId`),
    INDEX `InstallmentPlan_userId_status_idx`(`userId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Installment` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NOT NULL,
    `statementId` VARCHAR(191) NULL,
    `number` INTEGER NOT NULL,
    `statementCutDate` VARCHAR(191) NOT NULL,
    `dueDate` VARCHAR(191) NOT NULL,
    `principal` INTEGER NOT NULL,
    `interest` INTEGER NOT NULL DEFAULT 0,
    `iva` INTEGER NOT NULL DEFAULT 0,
    `fee` INTEGER NOT NULL DEFAULT 0,
    `totalAmount` INTEGER NOT NULL,
    `paidAmount` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'SCHEDULED',
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Installment_userId_dueDate_idx`(`userId`, `dueDate`),
    INDEX `Installment_userId_status_idx`(`userId`, `status`),
    UNIQUE INDEX `Installment_planId_number_key`(`planId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RecommendationRule` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `weight` INTEGER NOT NULL DEFAULT 0,
    `params` TEXT NULL,
    `isEnabled` BOOLEAN NOT NULL DEFAULT true,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RecommendationRule_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserRecommendationRuleOverride` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `ruleId` VARCHAR(191) NOT NULL,
    `isEnabled` BOOLEAN NULL,
    `weight` INTEGER NULL,
    `params` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserRecommendationRuleOverride_userId_ruleId_key`(`userId`, `ruleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RecommendationHistory` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `recommendedCardId` VARCHAR(191) NULL,
    `purchaseId` VARCHAR(191) NULL,
    `engineVersion` VARCHAR(191) NOT NULL,
    `requestInput` TEXT NOT NULL,
    `contextSnapshot` TEXT NOT NULL,
    `rulesSnapshot` TEXT NOT NULL,
    `result` TEXT NOT NULL,
    `outcome` VARCHAR(191) NOT NULL,
    `score` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RecommendationHistory_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserSettings` ADD CONSTRAINT `UserSettings_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Category` ADD CONSTRAINT `Category_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Category` ADD CONSTRAINT `Category_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Category`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IdempotencyRecord` ADD CONSTRAINT `IdempotencyRecord_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VerificationToken` ADD CONSTRAINT `VerificationToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CashAccount` ADD CONSTRAINT `CashAccount_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CashMovement` ADD CONSTRAINT `CashMovement_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CashMovement` ADD CONSTRAINT `CashMovement_cashAccountId_fkey` FOREIGN KEY (`cashAccountId`) REFERENCES `CashAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CashMovement` ADD CONSTRAINT `CashMovement_reversesMovementId_fkey` FOREIGN KEY (`reversesMovementId`) REFERENCES `CashMovement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncomeSource` ADD CONSTRAINT `IncomeSource_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncomeSource` ADD CONSTRAINT `IncomeSource_cashAccountId_fkey` FOREIGN KEY (`cashAccountId`) REFERENCES `CashAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncomeSource` ADD CONSTRAINT `IncomeSource_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncomeSchedule` ADD CONSTRAINT `IncomeSchedule_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncomeSchedule` ADD CONSTRAINT `IncomeSchedule_incomeSourceId_fkey` FOREIGN KEY (`incomeSourceId`) REFERENCES `IncomeSource`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncomeTransaction` ADD CONSTRAINT `IncomeTransaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncomeTransaction` ADD CONSTRAINT `IncomeTransaction_incomeSourceId_fkey` FOREIGN KEY (`incomeSourceId`) REFERENCES `IncomeSource`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncomeTransaction` ADD CONSTRAINT `IncomeTransaction_incomeScheduleId_fkey` FOREIGN KEY (`incomeScheduleId`) REFERENCES `IncomeSchedule`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncomeTransaction` ADD CONSTRAINT `IncomeTransaction_cashMovementId_fkey` FOREIGN KEY (`cashMovementId`) REFERENCES `CashMovement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecurringExpense` ADD CONSTRAINT `RecurringExpense_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecurringExpense` ADD CONSTRAINT `RecurringExpense_cashAccountId_fkey` FOREIGN KEY (`cashAccountId`) REFERENCES `CashAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecurringExpense` ADD CONSTRAINT `RecurringExpense_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_cashAccountId_fkey` FOREIGN KEY (`cashAccountId`) REFERENCES `CashAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_recurringExpenseId_fkey` FOREIGN KEY (`recurringExpenseId`) REFERENCES `RecurringExpense`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_cashMovementId_fkey` FOREIGN KEY (`cashMovementId`) REFERENCES `CashMovement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreditCard` ADD CONSTRAINT `CreditCard_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CardLedgerEntry` ADD CONSTRAINT `CardLedgerEntry_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CardLedgerEntry` ADD CONSTRAINT `CardLedgerEntry_creditCardId_fkey` FOREIGN KEY (`creditCardId`) REFERENCES `CreditCard`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CardLedgerEntry` ADD CONSTRAINT `CardLedgerEntry_statementId_fkey` FOREIGN KEY (`statementId`) REFERENCES `CardStatement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CardLedgerEntry` ADD CONSTRAINT `CardLedgerEntry_reversesEntryId_fkey` FOREIGN KEY (`reversesEntryId`) REFERENCES `CardLedgerEntry`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CardStatement` ADD CONSTRAINT `CardStatement_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CardStatement` ADD CONSTRAINT `CardStatement_creditCardId_fkey` FOREIGN KEY (`creditCardId`) REFERENCES `CreditCard`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CardPayment` ADD CONSTRAINT `CardPayment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CardPayment` ADD CONSTRAINT `CardPayment_creditCardId_fkey` FOREIGN KEY (`creditCardId`) REFERENCES `CreditCard`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CardPayment` ADD CONSTRAINT `CardPayment_cashAccountId_fkey` FOREIGN KEY (`cashAccountId`) REFERENCES `CashAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CardPayment` ADD CONSTRAINT `CardPayment_statementId_fkey` FOREIGN KEY (`statementId`) REFERENCES `CardStatement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CardPayment` ADD CONSTRAINT `CardPayment_installmentPlanId_fkey` FOREIGN KEY (`installmentPlanId`) REFERENCES `InstallmentPlan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CardPayment` ADD CONSTRAINT `CardPayment_cashMovementId_fkey` FOREIGN KEY (`cashMovementId`) REFERENCES `CashMovement`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CardPayment` ADD CONSTRAINT `CardPayment_cardLedgerEntryId_fkey` FOREIGN KEY (`cardLedgerEntryId`) REFERENCES `CardLedgerEntry`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentAllocation` ADD CONSTRAINT `PaymentAllocation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentAllocation` ADD CONSTRAINT `PaymentAllocation_cardPaymentId_fkey` FOREIGN KEY (`cardPaymentId`) REFERENCES `CardPayment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentAllocation` ADD CONSTRAINT `PaymentAllocation_statementId_fkey` FOREIGN KEY (`statementId`) REFERENCES `CardStatement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentAllocation` ADD CONSTRAINT `PaymentAllocation_installmentId_fkey` FOREIGN KEY (`installmentId`) REFERENCES `Installment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Purchase` ADD CONSTRAINT `Purchase_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Purchase` ADD CONSTRAINT `Purchase_creditCardId_fkey` FOREIGN KEY (`creditCardId`) REFERENCES `CreditCard`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Purchase` ADD CONSTRAINT `Purchase_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Purchase` ADD CONSTRAINT `Purchase_recurringExpenseId_fkey` FOREIGN KEY (`recurringExpenseId`) REFERENCES `RecurringExpense`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Purchase` ADD CONSTRAINT `Purchase_recommendationId_fkey` FOREIGN KEY (`recommendationId`) REFERENCES `RecommendationHistory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InstallmentPlan` ADD CONSTRAINT `InstallmentPlan_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InstallmentPlan` ADD CONSTRAINT `InstallmentPlan_creditCardId_fkey` FOREIGN KEY (`creditCardId`) REFERENCES `CreditCard`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InstallmentPlan` ADD CONSTRAINT `InstallmentPlan_purchaseId_fkey` FOREIGN KEY (`purchaseId`) REFERENCES `Purchase`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Installment` ADD CONSTRAINT `Installment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Installment` ADD CONSTRAINT `Installment_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `InstallmentPlan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Installment` ADD CONSTRAINT `Installment_statementId_fkey` FOREIGN KEY (`statementId`) REFERENCES `CardStatement`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRecommendationRuleOverride` ADD CONSTRAINT `UserRecommendationRuleOverride_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserRecommendationRuleOverride` ADD CONSTRAINT `UserRecommendationRuleOverride_ruleId_fkey` FOREIGN KEY (`ruleId`) REFERENCES `RecommendationRule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecommendationHistory` ADD CONSTRAINT `RecommendationHistory_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecommendationHistory` ADD CONSTRAINT `RecommendationHistory_recommendedCardId_fkey` FOREIGN KEY (`recommendedCardId`) REFERENCES `CreditCard`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

