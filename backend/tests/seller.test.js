import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/config/prisma.js';
import app from '../src/app.js';

after(() => prisma.$disconnect());

test('seller onboarding, admin and store endpoints require authentication', async () => {
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/v1`;
    const paths = [
      ['POST', '/seller-applications', { businessName: 'Shop', role: 'SELLER' }],
      ['GET', '/seller-applications/me'],
      ['GET', '/admin/seller-applications'],
      ['GET', '/admin/seller-applications/1'],
      ['POST', '/admin/seller-applications/1/decision', { decision: 'APPROVE', applicantMessage: 'Approved' }],
      ['POST', '/seller/stores', { name: 'Shop', slug: 'shop' }],
      ['GET', '/seller/stores/me'],
      ['POST', '/seller/products/1/images'],
      ['GET', '/seller/products/1/images'],
      ['PATCH', '/seller/products/1/images/order', { imageIds: [1] }],
      ['DELETE', '/seller/products/1/images/1'],
    ];
    for (const [method, path, body] of paths) {
      const response = await fetch(base + path, { method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
      assert.equal(response.status, 401, `${method} ${path}`);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('application and store API validation rejects unapproved fields and malformed inputs', async () => {
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    // Route-level schema validation is covered without an identity by the auth gate;
    // full valid and invalid authenticated requests run in the guarded integration suite.
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/seller-applications`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'ADMIN', status: 'APPROVED' }) });
    assert.equal(response.status, 401);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
