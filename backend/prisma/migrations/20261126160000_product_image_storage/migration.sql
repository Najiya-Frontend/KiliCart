ALTER TABLE `product_images`
    ADD COLUMN `provider` VARCHAR(32) NOT NULL DEFAULT 'legacy',
    ADD COLUMN `providerAssetId` VARCHAR(255) NULL,
    ADD COLUMN `status` ENUM('UPLOAD_PENDING', 'ACTIVE', 'DELETE_PENDING') NOT NULL DEFAULT 'ACTIVE',
    ADD UNIQUE INDEX `product_images_provider_providerAssetId_key` (`provider`, `providerAssetId`),
    ADD INDEX `product_images_productId_status_position_idx` (`productId`, `status`, `position`);
