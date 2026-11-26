-- Seller store and product review lifecycle. Existing DRAFT stores/products
-- remain private and can be submitted for review by their owners.
ALTER TABLE `stores`
    MODIFY `status` ENUM('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN `contactPhone` VARCHAR(32) NULL,
    ADD COLUMN `location` VARCHAR(500) NULL,
    ADD COLUMN `rejectionReason` VARCHAR(1000) NULL;

ALTER TABLE `products`
    MODIFY `status` ENUM('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN `rejectionReason` VARCHAR(1000) NULL;

CREATE TABLE `catalogue_review_audits` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `actorUserId` INTEGER NOT NULL,
    `targetUserId` INTEGER NOT NULL,
    `sellerAccountId` INTEGER NOT NULL,
    `storeId` INTEGER NULL,
    `productId` INTEGER NULL,
    `action` VARCHAR(40) NOT NULL,
    `fromStatus` VARCHAR(20) NULL,
    `toStatus` VARCHAR(20) NULL,
    `reason` VARCHAR(1000) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `catalogue_review_audits_actorUserId_createdAt_idx`(`actorUserId`, `createdAt`),
    INDEX `catalogue_review_audits_targetUserId_createdAt_idx`(`targetUserId`, `createdAt`),
    INDEX `catalogue_review_audits_sellerAccountId_createdAt_idx`(`sellerAccountId`, `createdAt`),
    INDEX `catalogue_review_audits_storeId_createdAt_idx`(`storeId`, `createdAt`),
    INDEX `catalogue_review_audits_productId_createdAt_idx`(`productId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `catalogue_review_audits`
    ADD CONSTRAINT `catalogue_review_audits_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `catalogue_review_audits_targetUserId_fkey` FOREIGN KEY (`targetUserId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `catalogue_review_audits_sellerAccountId_fkey` FOREIGN KEY (`sellerAccountId`) REFERENCES `seller_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `catalogue_review_audits_storeId_fkey` FOREIGN KEY (`storeId`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `catalogue_review_audits_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
