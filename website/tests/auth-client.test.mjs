import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAccount, login, logout, register, safeReturnTo } from '../src/lib/auth.mjs';

test('website login uses the existing backend contract and keeps its access token in memory', async () => {
  const original = globalThis.fetch; const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/auth/login')) return new Response(JSON.stringify({ success: true, data: { accessToken: 'opaque-access-token', expiresIn: 900 } }), { status: 200 });
    if (String(url).endsWith('/auth/me')) return new Response(JSON.stringify({ success: true, data: { id: 4, email: 'customer@example.invalid', fullName: 'Test Customer', roles: ['CUSTOMER', 'SELLER'] } }), { status: 200 });
    if (String(url).endsWith('/auth/register')) return new Response('{}', { status: 202 });
    return new Response('{}', { status: 200 });
  };
  try {
    await login('customer@example.invalid', 'a secure password');
    assert.equal((await getAccount()).roles.includes('SELLER'), true);
    await register('Test Customer', 'customer@example.invalid', 'a secure password');
    await logout();
    assert.match(calls[0].url, /\/api\/v1\/auth\/login$/);
    assert.equal(calls[0].options.headers['X-KiliCart-Request'], '1');
    assert.equal(calls[0].options.credentials, 'include');
    assert.match(calls[1].options.headers.Authorization, /^Bearer opaque-access-token$/);
    assert.equal(calls.some(call => /localStorage|sessionStorage/.test(String(call.options.body))), false);
  } finally { globalThis.fetch = original; }
});

test('return path validation blocks external navigation', () => {
  assert.equal(safeReturnTo('/products/local-pickles?sort=newest'), '/products/local-pickles?sort=newest');
  for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', undefined]) assert.equal(safeReturnTo(value), '/');
});

test('seller API requests reuse the in-memory session and refresh once after expiry', async () => {
  const { apiRequest, login, clearSession } = await import('../src/lib/auth.mjs');
  const original = globalThis.fetch;
  const calls = [];
  let sellerCalls = 0;
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input); calls.push({ url, options });
    if (url.endsWith('/auth/login')) return new Response(JSON.stringify({ success:true, data:{ accessToken:'first-access-token' } }), { status:200 });
    if (url.endsWith('/auth/refresh')) return new Response(JSON.stringify({ success:true, data:{ accessToken:'rotated-access-token' } }), { status:200 });
    if (url.endsWith('/seller-applications/me')) {
      sellerCalls++;
      if (sellerCalls === 1) return new Response(JSON.stringify({ success:false, message:'Expired' }), { status:401 });
      return new Response(JSON.stringify({ success:true, data:[] }), { status:200 });
    }
    return new Response('{}', { status:404 });
  };
  try {
    await login('seller@example.invalid', 'a secure password');
    const result = await apiRequest('/seller-applications/me');
    assert.deepEqual(result.data, []);
    const sellerRequests = calls.filter(call => call.url.endsWith('/seller-applications/me'));
    assert.equal(sellerRequests.length, 2);
    assert.equal(sellerRequests[0].options.headers.Authorization, 'Bearer first-access-token');
    assert.equal(sellerRequests[1].options.headers.Authorization, 'Bearer rotated-access-token');
    assert.equal(sellerRequests[1].options.credentials, 'include');
    assert.equal(calls.some(call => /localStorage|sessionStorage/.test(String(call.options.body))), false);
  } finally { clearSession(); globalThis.fetch = original; }
});
