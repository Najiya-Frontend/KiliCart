-- Additive outbox; existing authentication records and migration history remain intact.
CREATE TABLE `auth_email_outbox` (
  `id` VARCHAR(36) NOT NULL,
  `tokenHash` CHAR(64) NOT NULL,
  `purpose` VARCHAR(20) NOT NULL,
  `payload` TEXT NULL,
  `state` VARCHAR(20) NOT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `claimId` VARCHAR(36) NULL,
  `leaseUntil` DATETIME(3) NULL,
  `completedAt` DATETIME(3) NULL,
  `errorCategory` VARCHAR(32) NULL,
  UNIQUE INDEX `auth_email_outbox_tokenHash_key` (`tokenHash`),
  INDEX `auth_email_outbox_state_nextAttemptAt_idx` (`state`, `nextAttemptAt`),
  INDEX `auth_email_outbox_state_leaseUntil_idx` (`state`, `leaseUntil`),
  INDEX `auth_email_outbox_completedAt_idx` (`completedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `auth_email_outbox_tokenHash_fkey` FOREIGN KEY (`tokenHash`) REFERENCES `auth_tokens`(`hash`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
