import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureToken, postAuth, validPassword } from '../src/lib/auth.mjs';

test('captures and removes query and fragment tokens without storage', () => {
  for (const href of ['http://localhost:3000/verify-email?token=secret&x=1', 'http://localhost:3000/reset-password#token=secret']) {
    let replaced; const history = { state: null, replaceState: (_state, _title, url) => { replaced = url; } };
    assert.equal(captureToken({ href }, history), 'secret'); assert.doesNotMatch(replaced, /secret|token/);
  }
});
test('calls existing confirmation and reset request contracts', async () => {
  const original = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return { status: calls.length === 1 ? 200 : 400 }; };
  try {
    assert.equal(await postAuth('verify-email/confirm', { token: 'fake' }), 200);
    assert.equal(await postAuth('password-reset/request', { email: 'test@example.invalid' }), 400);
    assert.match(calls[0].url, /\/api\/v1\/auth\/verify-email\/confirm$/);
    assert.deepEqual(JSON.parse(calls[0].options.body), { token: 'fake' });
    assert.match(calls[1].url, /\/api\/v1\/auth\/password-reset\/request$/);
    assert.deepEqual(JSON.parse(calls[1].options.body), { email: 'test@example.invalid' });
    assert.equal(calls[0].options.referrerPolicy, 'no-referrer');
  } finally { globalThis.fetch = original; }
});
test('password validation matches backend length and byte limits', () => {
  assert.equal(validPassword('short'), false); assert.equal(validPassword('a long passphrase'), true); assert.equal(validPassword(' '.repeat(12)), false); assert.equal(validPassword('界'.repeat(100)), false);
});
