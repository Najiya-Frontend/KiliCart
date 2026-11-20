import crypto from 'node:crypto';
import argon2 from 'argon2';
import { prisma } from '../config/prisma.js';
import { encryptToken, outboxKey } from './outbox-crypto.js';

const token = () => crypto.randomBytes(32).toString('base64url');
export const tokenHash = value => crypto.createHash('sha256').update(value).digest('hex');
const duration = (name, fallback, max) => {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`Invalid ${name}`);
  return value * 1000;
};
const accessLife = () => duration('ACCESS_TOKEN_SECONDS', 900, 3600);
const sessionLife = () => duration('SESSION_SECONDS', 2592000, 7776000);
const expiry = ms => new Date(Date.now() + ms);
export const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
export const validEmail = value => value.length <= 191 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const validPassword = value => typeof value === 'string' && value.length >= 12 && Buffer.byteLength(value, 'utf8') <= 256 && !/^\s*$/.test(value);
export const hashPassword = value => argon2.hash(value, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
const dummyHash = '$argon2id$v=19$m=19456,t=2,p=1$AhC+4vBzCBtXIsCPZcEcbw$vijH7b3n0p7DF9NWpxF5OaVKJqB1Lin1Eq2kxjr1tLs';

export async function register({ fullName, email, password }) {
  const hash = await hashPassword(password);
  try {
    await prisma.$transaction(async tx => {
      const role = await tx.role.findUniqueOrThrow({ where: { code: 'CUSTOMER' } });
      const user = await tx.user.create({ data: { fullName, email, credential: { create: { passwordHash: hash } }, roles: { create: { roleId: role.id } } } });
      await tx.authAuditEvent.create({ data: { userId: user.id, event: 'REGISTER' } });
    });
  } catch (error) { if (error.code !== 'P2002') throw error; }
}
async function issue(tx, sessionId, sessionExpires) {
  const access = token(); const refresh = token();
  await tx.accessToken.create({ data: { hash: tokenHash(access), sessionId, expiresAt: expiry(accessLife()) } });
  await tx.refreshToken.create({ data: { hash: tokenHash(refresh), sessionId, expiresAt: sessionExpires } });
  return { accessToken: access, refreshToken: refresh, expiresIn: accessLife() / 1000 };
}
export async function login(email, password) {
  const user = await prisma.user.findUnique({ where: { email }, include: { credential: true } });
  const ok = await argon2.verify(user?.credential?.passwordHash || dummyHash, password).catch(() => false);
  if (!user || !ok || !user.isActive) return null;
  return prisma.$transaction(async tx => {
    // Coordinate with password changes and future account suspension.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
    const current = await tx.user.findUnique({ where: { id: user.id }, include: { credential: true } });
    if (!current?.isActive || current.credential?.passwordHash !== user.credential.passwordHash) return null;
    const expiresAt = expiry(sessionLife());
    const session = await tx.authSession.create({ data: { id: token(), userId: user.id, expiresAt } });
    await tx.authAuditEvent.create({ data: { userId: user.id, event: 'LOGIN' } });
    return issue(tx, session.id, expiresAt);
  });
}
export async function refresh(raw) {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  const hash = tokenHash(raw);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT hash FROM refresh_tokens WHERE hash = ${hash} FOR UPDATE`;
    const old = await tx.refreshToken.findUnique({ where: { hash }, include: { session: { include: { user: true } } } });
    if (!old) return null;
    const now = new Date();
    if (old.usedAt) {
      await tx.authSession.updateMany({ where: { id: old.sessionId, revokedAt: null }, data: { revokedAt: now } });
      await tx.authAuditEvent.create({ data: { userId: old.session.userId, event: 'REFRESH_REUSE' } });
      return null;
    }
    if (old.expiresAt <= now || old.session.expiresAt <= now || old.session.revokedAt || !old.session.user.isActive) return null;
    await tx.refreshToken.update({ where: { hash }, data: { usedAt: now } });
    return issue(tx, old.sessionId, old.session.expiresAt);
  }, { isolationLevel: 'ReadCommitted' });
}
export async function authenticate(raw) {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  const entry = await prisma.accessToken.findUnique({ where: { hash: tokenHash(raw) }, include: { session: { include: { user: { include: { roles: { include: { role: true } } } } } } } });
  const now = new Date(); const session = entry?.session; const user = session?.user;
  if (!entry || entry.expiresAt <= now || session.expiresAt <= now || session.revokedAt || !user.isActive) return null;
  return { userId: user.id, sessionId: session.id, roles: user.roles.map(x => x.role.code), user: { id: user.id, fullName: user.fullName, email: user.email, emailVerified: !!user.emailVerifiedAt } };
}
export async function logout(sessionId) {
  await prisma.authSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function createActionJob(tx, { hash, userId, purpose, id, payload, expiresAt }) {
  await tx.authToken.create({ data: { hash, userId, purpose, expiresAt } });
  await tx.authEmailOutbox.create({ data: { id, tokenHash: hash, purpose, payload, state: 'PENDING' } });
}
export async function requestAction(email, purpose) {
  if (!['VERIFY', 'RESET'].includes(purpose)) throw new Error('Invalid action purpose');
  // Reduces obvious local response differences; queue/database tail latency and
  // failures can still differ and need production measurement.
  const started = performance.now(); const floor = 100 + crypto.randomInt(21);
  try {
    const raw = token(); const hash = tokenHash(raw); const id = crypto.randomUUID();
    const payload = encryptToken(raw, id, outboxKey());
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.isActive || (purpose === 'VERIFY' && user.emailVerifiedAt)) return;
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
      const current = await tx.user.findUnique({ where: { id: user.id } });
      if (!current?.isActive || (purpose === 'VERIFY' && current.emailVerifiedAt)) return false;
      await createActionJob(tx, { hash, userId: user.id, purpose, expiresAt: expiry(purpose === 'VERIFY' ? 86400000 : 3600000), id, payload });
    }, { isolationLevel: 'ReadCommitted' });
  } finally {
    const remaining = floor - (performance.now() - started);
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
  }
}
export async function completeAction(raw, purpose, password) {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return false;
  const hash = tokenHash(raw);
  const passwordHash = purpose === 'RESET' ? await hashPassword(password) : null;
  return prisma.$transaction(async tx => {
    const initial = await tx.authToken.findUnique({ where: { hash } });
    if (!initial) return false;
    // Use the user row as the common serialization lock for all action tokens.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${initial.userId} FOR UPDATE`;
    await tx.$queryRaw`SELECT hash FROM auth_tokens WHERE hash = ${hash} FOR UPDATE`;
    const action = await tx.authToken.findUnique({ where: { hash }, include: { user: true } });
    const now = new Date();
    if (!action || action.purpose !== purpose || action.usedAt || action.expiresAt <= now || !action.user.isActive) return false;
    const current = await tx.user.findUnique({ where: { id: action.userId } });
    if (!current?.isActive) return false;
    await tx.authToken.updateMany({ where: { userId: action.userId, purpose, usedAt: null }, data: { usedAt: now } });
    if (purpose === 'VERIFY') await tx.user.update({ where: { id: action.userId }, data: { emailVerifiedAt: now } });
    else {
      await tx.passwordCredential.upsert({ where: { userId: action.userId }, create: { userId: action.userId, passwordHash }, update: { passwordHash } });
      await tx.authSession.updateMany({ where: { userId: action.userId, revokedAt: null }, data: { revokedAt: now } });
    }
    await tx.authAuditEvent.create({ data: { userId: action.userId, event: purpose === 'VERIFY' ? 'EMAIL_VERIFIED' : 'PASSWORD_RESET' } });
    return true;
  }, { isolationLevel: 'ReadCommitted' });
}
