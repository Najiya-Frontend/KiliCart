import crypto from 'node:crypto';
import { prisma } from '../config/prisma.js';
import { decryptToken } from './outbox-crypto.js';

function positive(value, fallback, min, max, name) {
  const number = Number(value || fallback);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`Invalid ${name}`);
  return number;
}
export function workerConfig(env = process.env) {
  const seconds = positive(env.AUTH_EMAIL_WORKER_SECONDS, 60, 1, 600, 'AUTH_EMAIL_WORKER_SECONDS');
  const lease = positive(env.AUTH_EMAIL_LEASE_SECONDS, 180, 30, 1800, 'AUTH_EMAIL_LEASE_SECONDS');
  if (lease <= seconds) throw new Error('Email lease must exceed worker execution time');
  return { seconds, lease, batch: positive(env.AUTH_EMAIL_BATCH_SIZE, 10, 1, 100, 'AUTH_EMAIL_BATCH_SIZE'), maxAttempts: positive(env.AUTH_EMAIL_MAX_ATTEMPTS, 5, 1, 10, 'AUTH_EMAIL_MAX_ATTEMPTS'), retentionDays: positive(env.AUTH_EMAIL_RETENTION_DAYS, 7, 1, 30, 'AUTH_EMAIL_RETENTION_DAYS') };
}
export function classifySmtp(error) {
  const code = Number(error?.responseCode);
  if (code >= 500 && code <= 599) return 'PERMANENT';
  if (code >= 400 && code <= 499) return 'TEMPORARY';
  if (['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'EDNS'].includes(error?.code)) return 'TEMPORARY';
  return 'PERMANENT';
}

export function createAuthEmailWorker({ db = prisma, mailer, config = workerConfig(), key, now = () => new Date(), random = Math.random, filter = {} } = {}) {
  if (!mailer?.sendAction) throw new Error('Email transport is required');
  async function claim() {
    const current = now();
    const candidates = await db.authEmailOutbox.findMany({ where: { AND: [filter, { OR: [{ state: 'PENDING', nextAttemptAt: { lte: current } }, { state: 'PROCESSING', leaseUntil: { lte: current } }] }] }, orderBy: { createdAt: 'asc' }, take: 20 });
    for (const candidate of candidates) {
      const claimId = crypto.randomUUID();
      const updated = await db.authEmailOutbox.updateMany({ where: { id: candidate.id, OR: [{ state: 'PENDING', nextAttemptAt: { lte: current } }, { state: 'PROCESSING', leaseUntil: { lte: current } }] }, data: { state: 'PROCESSING', claimId, leaseUntil: new Date(current.getTime() + config.lease * 1000), attempts: { increment: 1 } } });
      if (updated.count) return { id: candidate.id, claimId };
    }
    return null;
  }
  async function finish(claimed, data) {
    return db.authEmailOutbox.updateMany({ where: { id: claimed.id, state: 'PROCESSING', claimId: claimed.claimId, leaseUntil: { gt: now() } }, data });
  }
  async function processClaim(claimed) {
    const job = await db.authEmailOutbox.findFirst({ where: { id: claimed.id, state: 'PROCESSING', claimId: claimed.claimId, leaseUntil: { gt: now() } }, include: { token: { include: { user: true } } } });
    if (!job) return 'LOST';
    const end = async (state, errorCategory) => {
      const changed = await db.$transaction(async tx => {
        const updated = await tx.authEmailOutbox.updateMany({ where: { id: claimed.id, state: 'PROCESSING', claimId: claimed.claimId, leaseUntil: { gt: now() } }, data: { state, errorCategory, payload: null, completedAt: now(), claimId: null, leaseUntil: null } });
        if (updated.count && state === 'FAILED') await tx.authToken.updateMany({ where: { hash: job.tokenHash, usedAt: null }, data: { usedAt: now() } });
        return updated.count;
      });
      return changed ? state : 'LOST';
    };
    if (job.attempts > config.maxAttempts) return end('FAILED', 'ATTEMPTS_EXHAUSTED');
    if (job.token.usedAt || job.token.expiresAt <= now() || !job.token.user.isActive || (job.purpose === 'VERIFY' && job.token.user.emailVerifiedAt)) return end('CANCELLED', 'TOKEN_INVALID');
    let raw;
    try { raw = decryptToken(job.payload, job.id, key); }
    catch { return end('FAILED', 'PAYLOAD_INVALID'); }
    const valid = await db.authEmailOutbox.findFirst({ where: { id: claimed.id, state: 'PROCESSING', claimId: claimed.claimId, leaseUntil: { gt: now() }, token: { usedAt: null, expiresAt: { gt: now() }, user: { isActive: true, ...(job.purpose === 'VERIFY' ? { emailVerifiedAt: null } : {}) } } }, select: { id: true } });
    if (!valid) return end('CANCELLED', 'TOKEN_INVALID');
    try {
      await mailer.sendAction({ to: job.token.user.email, purpose: job.purpose, token: raw, messageId: job.id });
      return end('SENT', null);
    } catch (error) {
      const category = classifySmtp(error);
      if (category === 'PERMANENT' || job.attempts >= config.maxAttempts) return end('FAILED', category);
      const delaySeconds = Math.min(900, 30 * 2 ** (job.attempts - 1)) * (0.5 + random());
      await finish(claimed, { state: 'PENDING', errorCategory: category, nextAttemptAt: new Date(now().getTime() + delaySeconds * 1000), claimId: null, leaseUntil: null });
      return 'RETRY';
    }
  }
  async function cleanup() {
    const cutoff = new Date(now().getTime() - config.retentionDays * 86400000);
    return db.$executeRaw`DELETE FROM auth_email_outbox WHERE completedAt < ${cutoff} ORDER BY completedAt LIMIT 100`;
  }
  async function run() {
    const start = Date.now(); let count = 0;
    while (count < config.batch && Date.now() - start < config.seconds * 1000) {
      const item = await claim(); if (!item) break;
      const result = await processClaim(item); count++;
      console.info(JSON.stringify({ event: 'AUTH_EMAIL_JOB', result }));
    }
    await cleanup();
    return count;
  }
  return { claim, processClaim, cleanup, run };
}
