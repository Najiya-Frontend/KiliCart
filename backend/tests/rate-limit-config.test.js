import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimitSecret } from '../src/middleware/auth-rate-limit.js';

test('production requires a configured 32-byte hex rate-limit secret', () => {
  assert.throws(() => rateLimitSecret({ NODE_ENV: 'production' }));
  assert.throws(() => rateLimitSecret({ NODE_ENV: 'production', AUTH_RATE_LIMIT_SECRET: 'short' }));
  assert.equal(rateLimitSecret({ NODE_ENV: 'production', AUTH_RATE_LIMIT_SECRET: 'ab'.repeat(32) }).length, 32);
});
