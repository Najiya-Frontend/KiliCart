import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { testDatabaseUrl } from './guard.js';

const url = testDatabaseUrl();
if (process.env.DATABASE_URL !== url) throw new Error('Integration client is not configured for kilicart_test');
const { prisma } = await import('../src/config/prisma.js');
const { register, requestAction, completeAction, tokenHash, createActionJob } = await import('../src/services/auth.service.js');
const { createAuthEmailWorker } = await import('../src/services/auth-email-worker.js');
const { decryptToken } = await import('../src/services/outbox-crypto.js');
const { default: app } = await import('../src/app.js');
const { createAuthRateLimiter } = await import('../src/middleware/auth-rate-limit.js');
const { ipKeyGenerator } = await import('express-rate-limit');
const prefix = `outbox-${crypto.randomUUID()}`;
const email = `${prefix}@example.invalid`;
const password = 'Outbox fixture password';
let user, roleCreated;
const delivered = [];
const mailer = { sendAction: async args => delivered.push(args) };
const filter = { token: { user: { email } } };
const first = createAuthEmailWorker({ mailer, filter });
const second = createAuthEmailWorker({ mailer, filter });
const latest = () => prisma.authEmailOutbox.findFirstOrThrow({ where: { token: { userId: user.id } }, orderBy: { createdAt: 'desc' } });
before(async () => {
  assert.equal((await prisma.$queryRaw`SELECT DATABASE() AS name`)[0].name, 'kilicart_test');
  if (!await prisma.role.findUnique({ where: { code: 'CUSTOMER' } })) { roleCreated = await prisma.role.create({ data: { code: 'CUSTOMER', name: 'Customer' } }); }
  await register({ fullName: 'Outbox fixture', email, password });
  user = await prisma.user.findUniqueOrThrow({ where: { email } });
});
after(async () => {
  testDatabaseUrl(); assert.equal((await prisma.$queryRaw`SELECT DATABASE() AS name`)[0].name, 'kilicart_test');
  if (user) { await prisma.authAuditEvent.deleteMany({ where: { userId: user.id } }); await prisma.userRole.deleteMany({ where: { userId: user.id } }); await prisma.user.delete({ where: { id: user.id } }); }
  const limiter = createAuthRateLimiter();
  await prisma.authRateLimit.deleteMany({ where: { key: { in: [limiter.keyFor('reset', 'ip', ipKeyGenerator('127.0.0.1')), limiter.keyFor('reset', 'account', email), limiter.keyFor('reset', 'account', `${prefix}-missing@example.invalid`)] } } });
  if (roleCreated) await prisma.role.delete({ where: { id: roleCreated.id } });
  await prisma.$disconnect();
});

test('queue and token are created together and missing accounts leave no job', async () => {
  const before = await prisma.authEmailOutbox.count();
  await requestAction(`${prefix}-missing@example.invalid`, 'RESET');
  assert.equal(await prisma.authEmailOutbox.count(), before);
  await requestAction(email, 'RESET');
  const job = await latest(); const raw = decryptToken(job.payload, job.id);
  assert.equal(tokenHash(raw), job.tokenHash);
  assert.ok(!job.payload.includes(raw)); assert.ok(!JSON.stringify(job).includes(email));
  assert.ok(await prisma.authToken.findUnique({ where: { hash: job.tokenHash } }));
  const claims = await Promise.all([first.claim(), second.claim()]);
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(await first.processClaim(claims.find(Boolean)), 'SENT');
  assert.equal((await latest()).payload, null);
  assert.equal(await second.processClaim(claims.find(Boolean)), 'LOST');
  assert.equal(delivered.length, 1);
});
test('outbox insertion failure rolls back the token transaction', async () => {
  const existing = await latest(); const hash = crypto.randomBytes(32).toString('hex');
  await assert.rejects(prisma.$transaction(tx => createActionJob(tx, { hash, userId: user.id, purpose: 'RESET', id: existing.id, payload: 'fixture', expiresAt: new Date(Date.now() + 60000) })));
  assert.equal(await prisma.authToken.findUnique({ where: { hash } }), null);
});
test('crashed claim is recovered only after lease expires', async () => {
  await requestAction(email, 'VERIFY');
  const claim = await first.claim(); assert.ok(claim);
  assert.equal(await second.claim(), null);
  await prisma.authEmailOutbox.update({ where: { id: claim.id }, data: { leaseUntil: new Date(0) } });
  const recovered = await second.claim(); assert.equal(recovered.id, claim.id); assert.notEqual(recovered.claimId, claim.claimId);
  assert.equal(await first.processClaim(claim), 'LOST');
  assert.equal(await second.processClaim(recovered), 'SENT');
});
test('temporary failure retries and permanent 550 does not retry', async () => {
  await requestAction(email, 'RESET');
  let calls = 0;
  const temporary = createAuthEmailWorker({ filter, mailer: { sendAction: async () => { calls++; throw Object.assign(new Error('private'), { responseCode: 450 }); } }, random: () => 0.5 });
  const claim = await temporary.claim(); assert.equal(await temporary.processClaim(claim), 'RETRY');
  let job = await prisma.authEmailOutbox.findUniqueOrThrow({ where: { id: claim.id } });
  assert.equal(job.state, 'PENDING'); assert.equal(job.errorCategory, 'TEMPORARY'); assert.ok(job.nextAttemptAt > new Date());
  assert.equal(await first.claim(), null);
  await prisma.authEmailOutbox.update({ where: { id: claim.id }, data: { nextAttemptAt: new Date(0) } });
  const permanent = createAuthEmailWorker({ filter, mailer: { sendAction: async () => { calls++; throw Object.assign(new Error('private'), { responseCode: 550 }); } } });
  assert.equal(await permanent.processClaim(await permanent.claim()), 'FAILED');
  job = await prisma.authEmailOutbox.findUniqueOrThrow({ where: { id: claim.id } });
  assert.equal(job.errorCategory, 'PERMANENT'); assert.equal(job.payload, null); assert.equal(await first.claim(), null); assert.equal(calls, 2);
  assert.ok((await prisma.authToken.findUniqueOrThrow({ where: { hash: job.tokenHash } })).usedAt);
});
test('network timeouts are bounded by retry count and do not log secrets', async () => {
  await requestAction(email, 'RESET');
  const job = await latest();
  await prisma.authEmailOutbox.update({ where: { id: job.id }, data: { attempts: 4 } });
  const output = []; const savedError = console.error; const savedInfo = console.info;
  const raw = decryptToken(job.payload, job.id);
  const timeout = createAuthEmailWorker({ filter, mailer: { sendAction: async () => { throw Object.assign(new Error(`private ${raw} ${email}`), { code: 'ETIMEDOUT' }); } } });
  try {
    console.error = (...args) => output.push(args.join(' ')); console.info = (...args) => output.push(args.join(' '));
    assert.equal(await timeout.processClaim(await timeout.claim()), 'FAILED');
  } finally { console.error = savedError; console.info = savedInfo; }
  const updated = await prisma.authEmailOutbox.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(updated.attempts, 5); assert.equal(updated.errorCategory, 'TEMPORARY'); assert.equal(updated.payload, null);
  assert.ok(!output.join(' ').includes(raw)); assert.ok(!output.join(' ').includes(email));
});
test('expired and already consumed tokens are not delivered', async () => {
  const previous = delivered.length;
  await requestAction(email, 'RESET'); let job = await latest();
  await prisma.authToken.update({ where: { hash: job.tokenHash }, data: { expiresAt: new Date(0) } });
  assert.equal(await first.processClaim(await first.claim()), 'CANCELLED');
  await requestAction(email, 'RESET'); job = await latest();
  const raw = decryptToken(job.payload, job.id);
  assert.equal(await completeAction(raw, 'RESET', password), true);
  assert.equal(await first.processClaim(await first.claim()), 'CANCELLED');
  assert.equal(delivered.length, previous);
});
test('recovery HTTP responses are generic for existing and missing accounts', async () => {
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    const post = address => fetch(`http://127.0.0.1:${server.address().port}/api/v1/auth/password-reset/request`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: address }) });
    const known = await post(email); const missing = await post(`${prefix}-missing@example.invalid`);
    assert.equal(known.status, 200); assert.equal(missing.status, 200); assert.deepEqual(await known.json(), await missing.json());
  } finally { await new Promise(resolve => server.close(resolve)); }
});
test('bounded retention cleanup deletes completed records', async () => {
  const old = new Date(Date.now() - 8 * 86400000);
  assert.equal(await prisma.authEmailOutbox.count({ where: { completedAt: { lt: new Date(Date.now() - 7 * 86400000) } } }), 0);
  const job = await prisma.authEmailOutbox.findFirstOrThrow({ where: { token: { userId: user.id }, state: 'SENT' } });
  await prisma.authEmailOutbox.update({ where: { id: job.id }, data: { completedAt: old } });
  assert.equal(Number(await first.cleanup()), 1);
  assert.equal(await prisma.authEmailOutbox.findUnique({ where: { id: job.id } }), null);
});
test('measure local queue acceptance timings without SMTP', async () => {
  const durations = { known: [], missing: [] };
  for (let i = 0; i < 10; i++) for (const [kind, address] of [['known', email], ['missing', `${prefix}-missing@example.invalid`]]) {
    const start = performance.now(); await requestAction(address, 'RESET'); durations[kind].push(performance.now() - start);
  }
  const mean = values => (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
  console.info(JSON.stringify({ event: 'AUTH_QUEUE_TIMING_TEST', samples: 10, knownMeanMs: mean(durations.known), missingMeanMs: mean(durations.missing) }));
});
