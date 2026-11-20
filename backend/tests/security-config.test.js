import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrustedProxies, parseCorsOrigins } from '../src/config/env.js';

test('proxy trust requires explicit IP addresses or non-global CIDRs', () => {
  assert.deepEqual(parseTrustedProxies(''), []);
  assert.deepEqual(parseTrustedProxies('192.0.2.1, 2001:db8::/32'), ['192.0.2.1', '2001:db8::/32']);
  for (const value of ['true', '1', 'loopback', '0.0.0.0/0', '::/0', '192.0.2.1/33', '192.0.2.1,']) assert.throws(() => parseTrustedProxies(value));
});

test('production CORS requires exact HTTPS origins', () => {
  assert.deepEqual(parseCorsOrigins('https://shop.example.com,https://admin.example.com', true), ['https://shop.example.com', 'https://admin.example.com']);
  for (const value of ['', '*', 'http://example.com', 'https://example.com/path', 'https://user@example.com']) assert.throws(() => parseCorsOrigins(value, true));
  assert.deepEqual(parseCorsOrigins('', false), ['http://localhost:3000']);
});
