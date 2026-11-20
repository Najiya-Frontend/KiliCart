-- Independent counters only; no existing table or data is changed.
CREATE TABLE `auth_rate_limits` (
  `key` CHAR(64) NOT NULL,
  `hits` INTEGER NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`key`),
  INDEX `auth_rate_limits_expiresAt_idx` (`expiresAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
