import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { encryptToken, decryptToken, outboxKey } from '../src/services/outbox-crypto.js';
import { classifySmtp, workerConfig } from '../src/services/auth-email-worker.js';

test('outbox encryption authenticates message identity and requires an explicit key', () => {
  const key = crypto.randomBytes(32); const raw = crypto.randomBytes(32).toString('base64url');
  const payload = encryptToken(raw, 'job-1', key);
  assert.equal(decryptToken(payload, 'job-1', key), raw);
  assert.throws(() => decryptToken(payload, 'job-2', key));
  assert.throws(() => decryptToken(payload, 'job-1', crypto.randomBytes(32)));
  assert.throws(() => outboxKey({})); assert.throws(() => outboxKey({ AUTH_EMAIL_OUTBOX_KEY: 'short' }));
});
test('worker treats 550 as permanent, timeouts as temporary and validates limits', () => {
  assert.equal(classifySmtp({ responseCode: 550 }), 'PERMANENT');
  assert.equal(classifySmtp({ responseCode: 450 }), 'TEMPORARY');
  assert.equal(classifySmtp({ code: 'ETIMEDOUT' }), 'TEMPORARY');
  assert.equal(classifySmtp({ message: 'private' }), 'PERMANENT');
  assert.throws(() => workerConfig({ AUTH_EMAIL_WORKER_SECONDS: '180', AUTH_EMAIL_LEASE_SECONDS: '180' }));
  assert.throws(() => workerConfig({ AUTH_EMAIL_BATCH_SIZE: '101' }));
});
