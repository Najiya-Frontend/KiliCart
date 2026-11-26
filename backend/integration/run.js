import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { testDatabaseUrl } from './guard.js';
import { randomBytes } from 'node:crypto';

const url = testDatabaseUrl();
// Prisma validates that shadow and main URLs differ, even for migrate deploy.
// Deploy does not use a shadow database; this placeholder is never accessed.
const unusedShadow = new URL(url); unusedShadow.pathname = '/kilicart_test_unused_shadow';
const env = { ...process.env, DATABASE_URL: url, SHADOW_DATABASE_URL: unusedShadow.href, NODE_ENV: 'test', AUTH_RATE_LIMIT_SECRET: randomBytes(32).toString('hex'), AUTH_EMAIL_OUTBOX_KEY: randomBytes(32).toString('hex') };
const cli = new URL('../node_modules/prisma/build/index.js', import.meta.url);
const migration = spawnSync(process.execPath, [fileURLToPath(cli), 'migrate', 'deploy'], { env, stdio: 'inherit' });
if (migration.status !== 0) process.exit(migration.status || 1);
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', 'integration/auth.integration.js', 'integration/rate-limit.integration.js', 'integration/outbox.integration.js', 'integration/seller.integration.js', 'integration/seller-catalogue.integration.js', 'integration/seller-images.integration.js', 'integration/catalogue.integration.js'], { env, stdio: 'inherit' });
process.exit(result.status ?? 1);
