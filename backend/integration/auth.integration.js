import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import argon2 from 'argon2';
import { testDatabaseUrl } from './guard.js';

// Guard before importing the singleton client or performing any writes.
const url = testDatabaseUrl();
if (process.env.DATABASE_URL !== url) throw new Error('Integration client is not configured for kilicart_test');
const { prisma } = await import('../src/config/prisma.js');
const { register, login, refresh, authenticate, logout, requestAction, completeAction, tokenHash } = await import('../src/services/auth.service.js');
const { createEmailService } = await import('../src/services/email.service.js');
const { createAuthEmailWorker } = await import('../src/services/auth-email-worker.js');
const { setAccountActive } = await import('../src/services/account.service.js');
const { roleService } = await import('../src/services/role.service.js');
const { default: app } = await import('../src/app.js');
const { createAuthRateLimiter } = await import('../src/middleware/auth-rate-limit.js');
const { ipKeyGenerator } = await import('express-rate-limit');
const prefix = `test-${crypto.randomUUID()}`;
const ids = []; const createdRoles = [];
const password = 'Integration passphrase 123';
const email = suffix => `${prefix}-${suffix}@example.invalid`;
const makeUser = async suffix => { const address = email(suffix); await register({ fullName: 'Test fixture', email: address, password }); const user = await prisma.user.findUniqueOrThrow({ where: { email: address }, include: { credential: true, roles: { include: { role: true } } } }); ids.push(user.id); return user; };
const messages = [];
const mailer = createEmailService({ from: 'test@example.invalid', publicUrl: 'https://example.invalid', transport: { sendMail: async message => messages.push(message) } });
const capture = () => new URL(messages.at(-1).text.match(/https:\/\/\S+/)[0]).hash.slice(1).split('=')[1];
async function queueAndDeliver(address, purpose, transport) {
  await requestAction(address, purpose);
  const worker = createAuthEmailWorker({ mailer: transport, filter: { token: { user: { email: address } } } });
  const claimed = await worker.claim(); assert.ok(claimed);
  return worker.processClaim(claimed);
}
before(async () => {
  assert.equal((await prisma.$queryRaw`SELECT DATABASE() AS name`)[0].name, 'kilicart_test');
  for (const code of ['CUSTOMER', 'SELLER', 'SUPER_ADMIN']) {
    let role = await prisma.role.findUnique({ where: { code } });
    if (!role) { role = await prisma.role.create({ data: { code, name: code } }); createdRoles.push(role.id); }
  }
});
after(async () => {
  testDatabaseUrl();
  assert.equal((await prisma.$queryRaw`SELECT DATABASE() AS name`)[0].name, 'kilicart_test');
  const created = await prisma.user.findMany({ where: { email: { startsWith: prefix } }, select: { id: true } });
  const fixtureIds = created.map(user => user.id);
  if (fixtureIds.length) { await prisma.authAuditEvent.deleteMany({ where: { userId: { in: fixtureIds } } }); await prisma.userRole.deleteMany({ where: { userId: { in: fixtureIds } } }); await prisma.user.deleteMany({ where: { id: { in: fixtureIds } } }); }
  if (createdRoles.length) await prisma.role.deleteMany({ where: { id: { in: createdRoles }, users: { none: {} } } });
  const limiter = createAuthRateLimiter();
  const keys = ['reset', 'login', 'register'].map(policy => limiter.keyFor(policy, 'ip', ipKeyGenerator('127.0.0.1')));
  keys.push(limiter.keyFor('reset', 'account', email('missing')), limiter.keyFor('login', 'account', email('rate-limit')), limiter.keyFor('login', 'account', email('api')), limiter.keyFor('register', 'account', email('api')));
  await prisma.authRateLimit.deleteMany({ where: { key: { in: keys } } });
  await prisma.$disconnect();
});

test('registration, duplicate registration, password and concurrent registration', async () => {
  const user = await makeUser('register');
  assert.deepEqual(user.roles.map(x => x.role.code), ['CUSTOMER']);
  assert.equal(await argon2.verify(user.credential.passwordHash, password), true);
  await register({ fullName: 'Other', email: user.email, password });
  assert.equal(await prisma.user.count({ where: { email: user.email } }), 1);
  const address = email('concurrent');
  await Promise.all([register({ fullName: 'Fixture', email: address, password }), register({ fullName: 'Fixture', email: address, password })]);
  const rows = await prisma.user.findMany({ where: { email: address } });
  ids.push(...rows.map(x => x.id)); assert.equal(rows.length, 1);
});
test('login, rotation, concurrent reuse, logout and current roles', async () => {
  const user = await makeUser('session');
  assert.equal(await login(user.email, 'wrong'), null);
  const first = await login(user.email, password); assert.ok(first);
  assert.equal(await prisma.authSession.count({ where: { userId: user.id } }), 1);
  await roleService.assignRole(user.id, 'SELLER');
  assert.ok((await authenticate(first.accessToken)).roles.includes('SELLER'));
  await roleService.revokeRole(user.id, 'SELLER');
  assert.ok(!(await authenticate(first.accessToken)).roles.includes('SELLER'));
  const responses = await Promise.all([refresh(first.refreshToken), refresh(first.refreshToken)]);
  assert.equal(responses.filter(Boolean).length, 1);
  assert.equal(await authenticate(responses.find(Boolean).accessToken), null);
  const next = await login(user.email, password); const rotated = await refresh(next.refreshToken); assert.ok(rotated);
  assert.equal(await refresh(next.refreshToken), null); assert.equal(await authenticate(rotated.accessToken), null);
  const last = await login(user.email, password); const identity = await authenticate(last.accessToken); await logout(identity.sessionId);
  assert.equal(await authenticate(last.accessToken), null);
});
test('suspension invalidates sessions', async () => {
  const user = await makeUser('suspended'); const session = await login(user.email, password);
  await setAccountActive(user.id, false); assert.equal(await authenticate(session.accessToken), null); assert.equal(await login(user.email, password), null);
});
test('verification and reset expire, are single use and reset revokes sessions', async () => {
  const user = await makeUser('recovery');
  await queueAndDeliver(user.email, 'VERIFY', mailer); let raw = capture();
  assert.equal((await prisma.authToken.findUnique({ where: { hash: tokenHash(raw) } })).purpose, 'VERIFY');
  assert.equal(await completeAction(raw, 'VERIFY'), true); assert.equal(await completeAction(raw, 'VERIFY'), false);
  assert.ok((await prisma.user.findUnique({ where: { id: user.id } })).emailVerifiedAt);
  await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: null } });
  await queueAndDeliver(user.email, 'VERIFY', mailer); raw = capture();
  await prisma.authToken.update({ where: { hash: tokenHash(raw) }, data: { expiresAt: new Date(0) } }); assert.equal(await completeAction(raw, 'VERIFY'), false);
  const session = await login(user.email, password);
  await queueAndDeliver(user.email, 'RESET', mailer); raw = capture();
  await prisma.authToken.update({ where: { hash: tokenHash(raw) }, data: { expiresAt: new Date(0) } }); assert.equal(await completeAction(raw, 'RESET', 'new secure passphrase'), false);
  await queueAndDeliver(user.email, 'RESET', mailer); raw = capture();
  const outcomes = await Promise.all([completeAction(raw, 'RESET', 'new secure passphrase'), completeAction(raw, 'RESET', 'new secure passphrase')]);
  assert.deepEqual(outcomes.sort(), [false, true]); assert.equal(await completeAction(raw, 'RESET', 'new secure passphrase'), false);
  assert.equal(await authenticate(session.accessToken), null);
  assert.equal(await refresh(session.refreshToken), null);
  assert.equal(await login(user.email, password), null);
  assert.ok(await login(user.email, 'new secure passphrase'));
});
test('failed mail delivery invalidates the issued token', async () => {
  const user = await makeUser('delivery-failure');
  let captured;
  const failing = { sendAction: async ({ token }) => { captured = token; throw Object.assign(new Error('private SMTP failure'), { responseCode: 550 }); } };
  const originalError = console.error; const logs = [];
  try { console.error = (...args) => logs.push(args.join(' ')); await queueAndDeliver(user.email, 'RESET', failing); }
  finally { console.error = originalError; }
  assert.doesNotMatch(logs.join(' '), /private SMTP failure/);
  assert.ok(!logs.join(' ').includes(captured));
  assert.ok(!logs.join(' ').includes(user.email));
  const stored = await prisma.authToken.findUniqueOrThrow({ where: { hash: tokenHash(captured) } });
  assert.ok(stored.usedAt); assert.equal(await completeAction(captured, 'RESET', 'new secure passphrase'), false);
});
test('recovery logging excludes the test token and password', async () => {
  const user = await makeUser('safe-logging');
  let token; const output = [];
  const originalInfo = console.info; const originalError = console.error;
  const fakeMailer = { sendAction: async args => { token = args.token; } };
  try {
    console.info = (...args) => output.push(args.join(' '));
    console.error = (...args) => output.push(args.join(' '));
    await queueAndDeliver(user.email, 'RESET', fakeMailer);
    assert.equal(await completeAction(token, 'RESET', password), true);
  } finally { console.info = originalInfo; console.error = originalError; }
  assert.ok(token); assert.ok(!output.join(' ').includes(token));
  assert.ok(!output.join(' ').includes(password)); assert.ok(!output.join(' ').includes(user.email));
});
test('recovery request limits do not exhaust login budget', async () => {
  const user = await makeUser('rate-limit');
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/auth`;
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    for (let i = 0; i < 5; i++) assert.equal((await post('/password-reset/request', { email: email('missing') })).status, 200);
    assert.equal((await post('/password-reset/request', { email: email('missing') })).status, 429);
    assert.equal((await post('/login', { email: user.email, password, transport: 'mobile' })).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('final active super administrator survives concurrent revocation and suspension', async () => {
  const count = await prisma.userRole.count({ where: { role: { code: 'SUPER_ADMIN' }, user: { isActive: true } } });
  assert.equal(count, 0, 'test database must have no pre-existing active SUPER_ADMIN');
  const first = await makeUser('admin1'); const second = await makeUser('admin2');
  await roleService.assignRole(first.id, 'SUPER_ADMIN'); await roleService.assignRole(second.id, 'SUPER_ADMIN');
  const results = await Promise.allSettled([roleService.revokeRole(first.id, 'SUPER_ADMIN'), setAccountActive(second.id, false)]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(await prisma.userRole.count({ where: { role: { code: 'SUPER_ADMIN' }, user: { isActive: true } } }), 1);
  const remaining = await prisma.userRole.findFirstOrThrow({ where: { role: { code: 'SUPER_ADMIN' }, user: { isActive: true } } });
  await assert.rejects(roleService.revokeRole(remaining.userId, 'SUPER_ADMIN'), { code: 'LAST_SUPER_ADMIN' });
  await assert.rejects(setAccountActive(remaining.userId, false), { code: 'LAST_SUPER_ADMIN' });
});
test('health and catalogue endpoints remain available', async () => {
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try { const base = `http://127.0.0.1:${server.address().port}/api/v1`; for (const path of ['/health', '/health/database', '/roles']) assert.equal((await fetch(base + path)).status, 200); }
  finally { await new Promise(resolve => server.close(resolve)); }
});
test('HTTP registration, login, authenticated account and logout', async () => {
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/auth`;
  const post = (path, body, access) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(access ? { authorization: `Bearer ${access}` } : {}) }, body: JSON.stringify(body) });
  try {
    const address = email('api');
    assert.equal((await post('/register', { fullName: 'Test fixture', email: address, password, role: 'ADMIN' })).status, 400);
    assert.equal((await post('/register', { fullName: 'Test fixture', email: address, password })).status, 202);
    const result = await post('/login', { email: address, password, transport: 'mobile' }); assert.equal(result.status, 200);
    const credentials = (await result.json()).data;
    const me = await fetch(base + '/me', { headers: { authorization: `Bearer ${credentials.accessToken}` } });
    assert.equal(me.status, 200); assert.deepEqual((await me.json()).data.roles, ['CUSTOMER']);
    assert.equal((await post('/logout', {}, credentials.accessToken)).status, 200);
    assert.equal((await fetch(base + '/me', { headers: { authorization: `Bearer ${credentials.accessToken}` } })).status, 401);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
