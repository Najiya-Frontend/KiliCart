import crypto from 'node:crypto';
import { ipKeyGenerator } from 'express-rate-limit';
import { prisma } from '../config/prisma.js';
import { normalizeEmail, validEmail } from '../services/auth.service.js';

const WINDOW_SECONDS = 900;
export const policies = Object.freeze({
  register: { ip: 10, account: 5 },
  login: { ip: 20, account: 10 },
  verify: { ip: 5, account: 5 },
  reset: { ip: 5, account: 5 },
  refresh: { ip: 30 },
  confirm: { ip: 10 },
});

export function rateLimitSecret(config = process.env) {
  const value = config.AUTH_RATE_LIMIT_SECRET;
  if (value && /^[0-9a-f]{64}$/i.test(value)) return Buffer.from(value, 'hex');
  if (config.NODE_ENV === 'production' || value) throw new Error('AUTH_RATE_LIMIT_SECRET must be 32 random bytes encoded as 64 hex characters');
  // Stable only for local development. Production must configure its own secret.
  return Buffer.from('kilicart-local-rate-limit-key-000', 'utf8');
}

export function createAuthRateLimiter({ db = prisma, secret = rateLimitSecret(), cleanupChance = 1 } = {}) {
  const keyFor = (policy, kind, value) => crypto.createHmac('sha256', secret).update(JSON.stringify([policy, kind, value])).digest('hex');
  async function cleanup() {
    return db.$executeRaw`DELETE FROM auth_rate_limits WHERE expiresAt <= UTC_TIMESTAMP(3) ORDER BY expiresAt LIMIT 10`;
  }
  async function consume(policy, ip, rawEmail) {
    const limits = policies[policy];
    if (!limits || !ip) throw new Error('Invalid rate-limit policy or IP');
    const entries = [{ key: keyFor(policy, 'ip', ipKeyGenerator(ip)), limit: limits.ip }];
    const email = normalizeEmail(rawEmail);
    if (limits.account && validEmail(email)) entries.push({ key: keyFor(policy, 'account', email), limit: limits.account });
    entries.sort((a, b) => a.key.localeCompare(b.key));
    const retryAfter = await db.$transaction(async tx => {
      let retry = 0;
      for (const entry of entries) {
        // The upsert takes an InnoDB row lock held until transaction commit.
        await tx.$executeRaw`INSERT INTO auth_rate_limits (\`key\`, hits, expiresAt)
          VALUES (${entry.key}, 1, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${WINDOW_SECONDS} SECOND))
          ON DUPLICATE KEY UPDATE hits = IF(expiresAt <= UTC_TIMESTAMP(3), 1, LEAST(hits + 1, ${entry.limit + 1})),
          expiresAt = IF(expiresAt <= UTC_TIMESTAMP(3), DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${WINDOW_SECONDS} SECOND), expiresAt)`;
        const rows = await tx.$queryRaw`SELECT hits, GREATEST(1, CEIL(TIMESTAMPDIFF(MICROSECOND, UTC_TIMESTAMP(3), expiresAt) / 1000000)) AS retryAfter FROM auth_rate_limits WHERE \`key\` = ${entry.key}`;
        if (Number(rows[0].hits) > entry.limit) retry = Math.max(retry, Number(rows[0].retryAfter));
      }
      return retry;
    }, { isolationLevel: 'ReadCommitted' });
    if (Math.random() < cleanupChance) {
      try { await cleanup(); } catch { console.error(JSON.stringify({ event: 'AUTH_RATE_LIMIT_CLEANUP_FAILED' })); }
    }
    return retryAfter;
  }
  function middleware(policy) {
    return async (req, res, next) => {
      try {
        const retry = await consume(policy, req.ip, req.body?.email);
        if (retry) return res.set('Retry-After', String(retry)).status(429).json({ success: false, message: 'Too many requests' });
        return next();
      } catch {
        console.error(JSON.stringify({ event: 'AUTH_RATE_LIMIT_STORAGE_FAILED' }));
        return res.status(503).json({ success: false, message: 'Service temporarily unavailable' });
      }
    };
  }
  return { consume, middleware, cleanup, keyFor };
}
