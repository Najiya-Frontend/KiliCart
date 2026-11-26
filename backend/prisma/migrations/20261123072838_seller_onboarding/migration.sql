-- CreateTable
CREATE TABLE `seller_applications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `businessName` VARCHAR(191) NOT NULL,
    `businessType` VARCHAR(100) NOT NULL,
    `contactPhone` VARCHAR(32) NOT NULL,
    `businessAddress` VARCHAR(500) NOT NULL,
    `description` VARCHAR(1000) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `decidedAt` DATETIME(3) NULL,
    `decidedById` INTEGER NULL,
    `internalRejectionReason` VARCHAR(1000) NULL,
    `applicantMessage` VARCHAR(1000) NULL,

    INDEX `seller_applications_userId_status_submittedAt_idx`(`userId`, `status`, `submittedAt`),
    INDEX `seller_applications_status_submittedAt_idx`(`status`, `submittedAt`),
    INDEX `seller_applications_decidedById_decidedAt_idx`(`decidedById`, `decidedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `seller_accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `applicationId` INTEGER NOT NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `approvedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `suspendedAt` DATETIME(3) NULL,
    `suspensionReason` VARCHAR(1000) NULL,

    UNIQUE INDEX `seller_accounts_userId_key`(`userId`),
    UNIQUE INDEX `seller_accounts_applicationId_key`(`applicationId`),
    INDEX `seller_accounts_status_approvedAt_idx`(`status`, `approvedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stores` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sellerAccountId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` VARCHAR(1000) NULL,
    `status` ENUM('DRAFT') NOT NULL DEFAULT 'DRAFT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `stores_sellerAccountId_key`(`sellerAccountId`),
    UNIQUE INDEX `stores_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `seller_admin_audits` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `actorUserId` INTEGER NOT NULL,
    `targetUserId` INTEGER NOT NULL,
    `applicationId` INTEGER NULL,
    `sellerAccountId` INTEGER NULL,
    `action` VARCHAR(40) NOT NULL,
    `fromStatus` VARCHAR(20) NULL,
    `toStatus` VARCHAR(20) NOT NULL,
    `reason` VARCHAR(1000) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `seller_admin_audits_actorUserId_createdAt_idx`(`actorUserId`, `createdAt`),
    INDEX `seller_admin_audits_targetUserId_createdAt_idx`(`targetUserId`, `createdAt`),
    INDEX `seller_admin_audits_applicationId_createdAt_idx`(`applicationId`, `createdAt`),
    INDEX `seller_admin_audits_sellerAccountId_createdAt_idx`(`sellerAccountId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `seller_applications` ADD CONSTRAINT `seller_applications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `seller_applications` ADD CONSTRAINT `seller_applications_decidedById_fkey` FOREIGN KEY (`decidedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `seller_accounts` ADD CONSTRAINT `seller_accounts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `seller_accounts` ADD CONSTRAINT `seller_accounts_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `seller_applications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stores` ADD CONSTRAINT `stores_sellerAccountId_fkey` FOREIGN KEY (`sellerAccountId`) REFERENCES `seller_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `seller_admin_audits` ADD CONSTRAINT `seller_admin_audits_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `seller_admin_audits` ADD CONSTRAINT `seller_admin_audits_targetUserId_fkey` FOREIGN KEY (`targetUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `seller_admin_audits` ADD CONSTRAINT `seller_admin_audits_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `seller_applications`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `seller_admin_audits` ADD CONSTRAINT `seller_admin_audits_sellerAccountId_fkey` FOREIGN KEY (`sellerAccountId`) REFERENCES `seller_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
