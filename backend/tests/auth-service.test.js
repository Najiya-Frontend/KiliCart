import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/config/prisma.js';
import { register, login, tokenHash, refresh, authenticate, logout } from '../src/services/auth.service.js';

test('registration creates only CUSTOMER, handles duplicates and validates login using controlled fixtures', async () => {
  const originals = { transaction: prisma.$transaction, findUser: prisma.user.findUnique };
  const state = { user: null, credential: null, assignedRole: null, sessions: [], access: [], refresh: [] };
  const tx = {
    role: { findUniqueOrThrow: async () => ({ id: 5, code: 'CUSTOMER' }) },
    user: {
      create: async ({ data }) => {
        if (state.user) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
        state.credential = data.credential.create; state.assignedRole = data.roles.create.roleId;
        state.user = { id: 1, email: data.email, fullName: data.fullName, isActive: true, credential: state.credential };
        return state.user;
      },
      findUnique: async () => state.user,
    },
    authAuditEvent: { create: async () => ({}) },
    authSession: { create: async ({ data }) => { state.sessions.push(data); return data; } },
    accessToken: { create: async ({ data }) => { state.access.push(data); } },
    refreshToken: { create: async ({ data }) => { state.refresh.push(data); } },
    $queryRaw: async () => [],
  };
  prisma.$transaction = async fn => fn(tx);
  prisma.user.findUnique = async () => state.user;
  try {
    const data = { fullName: 'Fixture', email: 'fixture@example.invalid', password: 'a secure passphrase' };
    await register(data); await register(data);
    assert.equal(state.assignedRole, 5); assert.notEqual(state.credential.passwordHash, data.password);
    assert.equal(await login(data.email, 'incorrect'), null);
    const result = await login(data.email, data.password);
    assert.equal(state.access[0].hash, tokenHash(result.accessToken));
    assert.equal(state.refresh[0].hash, tokenHash(result.refreshToken));
    assert.notEqual(state.refresh[0].hash, result.refreshToken);
    state.user.isActive = false;
    assert.equal(await login(data.email, data.password), null);
  } finally { prisma.$transaction = originals.transaction; prisma.user.findUnique = originals.findUser; await prisma.$disconnect(); }
});

test('rotation, reuse, logout, role changes and expiry using controlled session fixtures', async () => {
  const originals = { transaction: prisma.$transaction, accessFind: prisma.accessToken.findUnique, sessionUpdate: prisma.authSession.updateMany };
  const user = { id: 7, fullName: 'Fixture', email: 'fixture@example.invalid', emailVerifiedAt: null, isActive: true, roles: [{ role: { code: 'CUSTOMER' } }, { role: { code: 'SELLER' } }] };
  const session = { id: 'fixture-session', userId: 7, user, expiresAt: new Date(Date.now() + 60000), revokedAt: null };
  const oldToken = 'A'.repeat(43); const tokens = [{ hash: tokenHash(oldToken), sessionId: session.id, expiresAt: session.expiresAt, usedAt: null }];
  const access = [];
  const tx = {
    $queryRaw: async () => [],
    refreshToken: {
      findUnique: async ({ where }) => { const row = tokens.find(x => x.hash === where.hash); return row && { ...row, session }; },
      update: async ({ where, data }) => Object.assign(tokens.find(x => x.hash === where.hash), data),
      create: async ({ data }) => tokens.push({ ...data, usedAt: null }),
    },
    accessToken: { create: async ({ data }) => access.push(data) },
    authSession: { updateMany: async ({ data }) => { session.revokedAt = data.revokedAt; } },
    authAuditEvent: { create: async () => ({}) },
  };
  prisma.$transaction = async fn => fn(tx);
  prisma.authSession.updateMany = tx.authSession.updateMany;
  prisma.accessToken.findUnique = async ({ where }) => { const row = access.find(x => x.hash === where.hash); return row && { ...row, session }; };
  try {
    const rotated = await refresh(oldToken); assert.ok(rotated);
    assert.deepEqual((await authenticate(rotated.accessToken)).roles, ['CUSTOMER', 'SELLER']);
    user.roles.pop(); assert.deepEqual((await authenticate(rotated.accessToken)).roles, ['CUSTOMER']);
    access[0].expiresAt = new Date(0); assert.equal(await authenticate(rotated.accessToken), null);
    access[0].expiresAt = new Date(Date.now() + 60000);
    assert.equal(await refresh(oldToken), null); assert.ok(session.revokedAt);
    assert.equal(await authenticate(rotated.accessToken), null);
    session.revokedAt = null; await logout(session.id); assert.ok(session.revokedAt);
  } finally { prisma.$transaction = originals.transaction; prisma.accessToken.findUnique = originals.accessFind; prisma.authSession.updateMany = originals.sessionUpdate; }
});
