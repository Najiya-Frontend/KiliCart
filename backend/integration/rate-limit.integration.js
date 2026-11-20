import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { testDatabaseUrl } from './guard.js';

const url = testDatabaseUrl();
if (process.env.DATABASE_URL !== url) throw new Error('Integration client is not configured for kilicart_test');
const { prisma } = await import('../src/config/prisma.js');
const { PrismaClient } = await import('../generated/prisma/index.js');
const { PrismaMariaDb } = await import('@prisma/adapter-mariadb');
const { createAuthRateLimiter } = await import('../src/middleware/auth-rate-limit.js');
const independentClient = new PrismaClient({ adapter: new PrismaMariaDb(url) });
const secret = crypto.randomBytes(32);
const first = createAuthRateLimiter({ secret, cleanupChance: 0 });
const second = createAuthRateLimiter({ db: independentClient, secret, cleanupChance: 0 });
const keys = new Set();
function track(policy, ip, email) {
  keys.add(first.keyFor(policy, 'ip', ip));
  if (email) keys.add(first.keyFor(policy, 'account', email.trim().toLowerCase()));
}
after(async () => {
  testDatabaseUrl();
  assert.equal((await prisma.$queryRaw`SELECT DATABASE() AS name`)[0].name, 'kilicart_test');
  await prisma.authRateLimit.deleteMany({ where: { key: { in: [...keys] } } });
  await independentClient.$disconnect();
  await prisma.$disconnect();
});

test('concurrent independent limiters enforce shared account quotas and normalization', async () => {
  const email = `${crypto.randomUUID()}@example.invalid`;
  const requests = Array.from({ length: 20 }, (_, i) => {
    const ip = `192.0.2.${i + 1}`; track('login', ip, email);
    return (i % 2 ? first : second).consume('login', ip, i % 2 ? `  ${email.toUpperCase()}  ` : email);
  });
  const results = await Promise.all(requests);
  assert.equal(results.filter(value => value === 0).length, 10);
  assert.equal(results.filter(value => value > 0 && value <= 900).length, 10);
  const row = await prisma.authRateLimit.findUniqueOrThrow({ where: { key: first.keyFor('login', 'account', email) } });
  assert.equal(row.hits, 11);
  assert.ok(!JSON.stringify(row).includes(email));
  track('reset', '198.51.100.1', email);
  assert.equal(await second.consume('reset', '198.51.100.1', email), 0);
});

test('IP quota applies across accounts; expiry resets without extending denied windows', async () => {
  const ip = '198.51.100.2';
  for (let i = 0; i < 21; i++) {
    const email = `${crypto.randomUUID()}@example.invalid`; track('login', ip, email);
    const retry = await first.consume('login', ip, email);
    assert.equal(retry > 0, i === 20);
  }
  const key = first.keyFor('login', 'ip', ip);
  const before = await prisma.authRateLimit.findUniqueOrThrow({ where: { key } });
  await second.consume('login', ip, null);
  assert.equal((await prisma.authRateLimit.findUniqueOrThrow({ where: { key } })).expiresAt.getTime(), before.expiresAt.getTime());
  await prisma.authRateLimit.update({ where: { key }, data: { expiresAt: new Date(0) } });
  assert.equal(await second.consume('login', ip, null), 0);
  assert.equal((await prisma.authRateLimit.findUniqueOrThrow({ where: { key } })).hits, 1);
});

test('HTTP returns Retry-After and fails closed when storage is unavailable', async () => {
  const app = express(); app.use(express.json()); app.post('/', first.middleware('verify'), (_req, res) => res.sendStatus(204));
  const broken = createAuthRateLimiter({ db: { $transaction: async () => { throw new Error('private detail'); } }, secret, cleanupChance: 0 });
  app.post('/failure', broken.middleware('login'), (_req, res) => res.sendStatus(204));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const email = `${crypto.randomUUID()}@example.invalid`; track('verify', '127.0.0.1', email);
  try {
    for (let i = 0; i < 5; i++) assert.equal((await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })).status, 204);
    const denied = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
    assert.equal(denied.status, 429); assert.ok(Number(denied.headers.get('retry-after')) > 0 && Number(denied.headers.get('retry-after')) <= 900);
    const failure = await fetch(base + '/failure', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
    assert.equal(failure.status, 503); assert.doesNotMatch(await failure.text(), /private detail|example/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('untrusted forwarded addresses cannot bypass the IP budget', async () => {
  const app = express(); app.use(express.json()); app.post('/', first.middleware('register'), (_req, res) => res.sendStatus(204));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (let i = 0; i < 11; i++) {
      const email = `${crypto.randomUUID()}@example.invalid`; track('register', '127.0.0.1', email);
      const response = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `192.0.2.${i + 1}` }, body: JSON.stringify({ email }) });
      assert.equal(response.status, i < 10 ? 204 : 429);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('cleanup deletes expired rows in bounded batches', async () => {
  // Do not delete pre-existing test database records owned by another test run.
  assert.equal(await prisma.authRateLimit.count({ where: { expiresAt: { lte: new Date() } } }), 0);
  const rows = Array.from({ length: 11 }, (_, i) => ({ key: first.keyFor('cleanup', 'fixture', String(i)), hits: 1, expiresAt: new Date(0) }));
  for (const row of rows) keys.add(row.key);
  await prisma.authRateLimit.createMany({ data: rows });
  assert.equal(Number(await first.cleanup()), 10);
  assert.equal(await prisma.authRateLimit.count({ where: { key: { in: rows.map(row => row.key) } } }), 1);
  assert.equal(Number(await first.cleanup()), 1);
});
