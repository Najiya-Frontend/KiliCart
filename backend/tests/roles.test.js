import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { prisma } from '../src/config/prisma.js';
import { PLATFORM_ROLES } from '../src/config/roles.js';
import { seedRoles } from '../prisma/seed.js';
import { createRoleService } from '../src/services/role.service.js';
import { requireRoles } from '../src/middleware/authorization.middleware.js';
import app from '../src/app.js';

after(() => prisma.$disconnect());
test('seed is idempotent and exposes five safe definitions', async () => {
  const records = new Map();
  const db = { role: { upsert: async ({ where, create, update }) => { const row = records.get(where.code); records.set(where.code, row ? { ...row, ...update } : { ...create }); } }, $transaction: async operations => Promise.all(operations) };
  await seedRoles(db); const before = Array.from(records.values());
  await seedRoles(db); const afterSeed = Array.from(records.values());
  assert.equal(before.length, 5); assert.deepEqual(afterSeed, before);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try { const res = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/roles`); assert.equal(res.status, 200); const body = await res.json(); assert.equal(body.data.length, 5); assert.deepEqual(Object.keys(body.data[0]).sort(), ['code', 'description', 'name']); }
  finally { await new Promise(resolve => server.close(resolve)); }
});
test('role service enforces assignment and revocation rules with isolated fixtures', async () => {
  const roles = PLATFORM_ROLES.map((r, i) => ({ ...r, id: i + 1 }));
  const users = [{ id: 1, isActive: true }, { id: 2, isActive: true }]; const assignments = [];
  const db = {
    user: { findUnique: async ({ where }) => users.find(u => u.id === where.id) },
    role: { findUnique: async ({ where }) => roles.find(r => r.code === where.code) },
    userRole: {
      upsert: async ({ create }) => { let a = assignments.find(x => x.userId === create.userId && x.roleId === create.roleId); if (!a) { a = { ...create }; assignments.push(a); } return a; },
      findUnique: async ({ where }) => assignments.find(x => x.userId === where.userId_roleId.userId && x.roleId === where.userId_roleId.roleId),
      findFirst: async ({ where }) => assignments.find(x => x.userId === where.userId && roles.find(r => r.id === x.roleId).code === where.role.code),
      findMany: async ({ where }) => assignments.filter(x => x.userId === where.userId).map(x => ({ role: roles.find(r => r.id === x.roleId) })),
      count: async ({ where }) => assignments.filter(x => x.roleId === where.roleId && users.find(u => u.id === x.userId).isActive).length,
      delete: async ({ where }) => { const i = assignments.findIndex(x => x.userId === where.userId_roleId.userId && x.roleId === where.userId_roleId.roleId); assignments.splice(i, 1); },
    },
    $queryRaw: async () => [], $transaction: async fn => fn(db),
  };
  const service = createRoleService(db);
  await service.assignRole(1, 'CUSTOMER'); await service.assignRole(1, 'SELLER'); await service.assignRole(1, 'SELLER');
  assert.equal((await service.getUserRoles(1)).length, 2); assert.equal(await service.hasRole(1, 'SELLER'), true);
  await assert.rejects(service.assignRole(1, 'BOGUS'), { code: 'UNKNOWN_ROLE' });
  await assert.rejects(service.assignRole(99, 'CUSTOMER'), { code: 'USER_NOT_FOUND' });
  assert.equal(await service.revokeRole(1, 'SELLER'), true); assert.equal(await service.revokeRole(1, 'SELLER'), false);
  await service.assignRole(1, 'SUPER_ADMIN'); await assert.rejects(service.revokeRole(1, 'SUPER_ADMIN'), { code: 'LAST_SUPER_ADMIN' });
  await service.assignRole(2, 'SUPER_ADMIN'); assert.equal(await service.revokeRole(1, 'SUPER_ADMIN'), true);
  await assert.rejects(service.revokeRole(2, 'SUPER_ADMIN'), { code: 'LAST_SUPER_ADMIN' });
});
test('authorization consumes only server-injected identities', async () => {
  const serverApp = express();
  serverApp.get('/anonymous', ...requireRoles('ADMIN'), (req, res) => res.sendStatus(200));
  serverApp.get('/limited', (req, res, next) => { req.auth = { userId: 1, roles: ['CUSTOMER'] }; next(); }, ...requireRoles('ADMIN'), (req, res) => res.sendStatus(200));
  serverApp.get('/allowed', (req, res, next) => { req.auth = { userId: 1, roles: ['CUSTOMER', 'ADMIN'] }; next(); }, ...requireRoles('SELLER', 'ADMIN'), (req, res) => res.sendStatus(200));
  const server = serverApp.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try { const base = `http://127.0.0.1:${server.address().port}`; assert.equal((await fetch(base + '/anonymous', { headers: { 'x-user-id': '1', 'x-role': 'ADMIN' } })).status, 401); assert.equal((await fetch(base + '/limited')).status, 403); assert.equal((await fetch(base + '/allowed')).status, 200); }
  finally { await new Promise(resolve => server.close(resolve)); }
});
