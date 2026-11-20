import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import app from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { hashPassword, validPassword, validEmail, normalizeEmail, authenticate, refresh, completeAction } from '../src/services/auth.service.js';

after(() => prisma.$disconnect());
test('password validation and Argon2id hashing', async () => {
  assert.equal(validPassword('short'), false);
  assert.equal(validPassword('a long passphrase'), true);
  assert.equal(validEmail(normalizeEmail('  USER@example.com ')), true);
  assert.equal(validEmail('bad'), false);
  const a = await hashPassword('a long passphrase'); const b = await hashPassword('a long passphrase');
  assert.match(a, /^\$argon2id\$/); assert.notEqual(a, b);
  assert.equal(await argon2.verify(a, 'a long passphrase'), true);
  assert.equal(await argon2.verify(a, 'wrong password'), false);
});
test('malformed access, refresh and recovery tokens are rejected', async () => {
  assert.equal(await authenticate('invalid'), null);
  assert.equal(await refresh('invalid'), null);
  assert.equal(await completeAction('invalid', 'VERIFY'), false);
  assert.equal(await completeAction('invalid', 'RESET', 'a long passphrase'), false);
});
test('HTTP rejects invalid registration, client roles and missing identity', async () => {
  // These validation-only checks must not write limiter rows into the development DB.
  const originalTransaction = prisma.$transaction;
  const originalExecute = prisma.$executeRaw;
  prisma.$transaction = async fn => fn({ $executeRaw: async () => 1, $queryRaw: async () => [{ hits: 1, retryAfter: 900 }] });
  prisma.$executeRaw = async () => 0;
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1/auth`;
  const post = body => fetch(base + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.equal((await post({ fullName: 'Test User', email: 'invalid', password: 'short' })).status, 400);
    assert.equal((await post({ fullName: 'Test User', email: 'test@example.invalid', password: 'a long passphrase', role: 'ADMIN' })).status, 400);
    assert.equal((await fetch(base + '/me', { headers: { 'x-user-id': '1', 'x-role': 'ADMIN' } })).status, 401);
    assert.equal((await fetch(base + '/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ transport: 'mobile', refreshToken: 'bad' }) })).status, 401);
  } finally { await new Promise(resolve => server.close(resolve)); prisma.$transaction = originalTransaction; prisma.$executeRaw = originalExecute; }
});
