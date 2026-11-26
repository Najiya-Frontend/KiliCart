import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { testDatabaseUrl } from './guard.js';

const url = testDatabaseUrl();
if (process.env.DATABASE_URL !== url) throw new Error('Integration client is not configured for kilicart_test');
const { prisma } = await import('../src/config/prisma.js');
const { register, login } = await import('../src/services/auth.service.js');
const { roleService } = await import('../src/services/role.service.js');
const { default: app } = await import('../src/app.js');

const prefix = `seller-${crypto.randomUUID()}`;
const ids = [];
const address = suffix => `${prefix}-${suffix}@example.invalid`;
const makeUser = async suffix => {
  await register({ fullName: `Test ${suffix}`, email: address(suffix), password: 'Integration passphrase 123' });
  const user = await prisma.user.findUniqueOrThrow({ where: { email: address(suffix) } }); ids.push(user.id); return user;
};
const token = async user => (await login(user.email, 'Integration passphrase 123')).accessToken;
const headers = value => ({ authorization: `Bearer ${value}`, 'content-type': 'application/json' });
const application = (businessName = 'Test Foods') => ({ businessName, businessType: 'Packaged food', contactPhone: '+919876543210', businessAddress: '12 Test Road, Pune', description: 'Small batch products' });
let server; let base; let admin;

before(async () => {
  assert.equal((await prisma.$queryRaw`SELECT DATABASE() AS name`)[0].name, 'kilicart_test');
  for (const code of ['CUSTOMER', 'SELLER', 'ADMIN', 'SUPER_ADMIN']) {
    if (!await prisma.role.findUnique({ where: { code } })) await prisma.role.create({ data: { code, name: code } });
  }
  admin = await makeUser('admin'); await roleService.assignRole(admin.id, 'ADMIN');
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  testDatabaseUrl(); assert.equal((await prisma.$queryRaw`SELECT DATABASE() AS name`)[0].name, 'kilicart_test');
  const users = await prisma.user.findMany({ where: { email: { startsWith: prefix } }, select: { id: true } });
  const fixtureIds = users.map(user => user.id);
  const applications = await prisma.sellerApplication.findMany({ where: { userId: { in: fixtureIds } }, select: { id: true } });
  const sellerAccounts = await prisma.sellerAccount.findMany({ where: { userId: { in: fixtureIds } }, select: { id: true } });
  const appIds = applications.map(row => row.id); const sellerIds = sellerAccounts.map(row => row.id);
  await prisma.catalogueReviewAudit.deleteMany({ where: { OR: [{ actorUserId: { in: fixtureIds } }, { targetUserId: { in: fixtureIds } }, { sellerAccountId: { in: sellerIds } }] } });
  if (sellerIds.length) await prisma.store.deleteMany({ where: { sellerAccountId: { in: sellerIds } } });
  await prisma.sellerAdminAudit.deleteMany({ where: { OR: [{ actorUserId: { in: fixtureIds } }, { targetUserId: { in: fixtureIds } }] } });
  if (sellerIds.length) await prisma.sellerAccount.deleteMany({ where: { id: { in: sellerIds } } });
  if (appIds.length) await prisma.sellerApplication.deleteMany({ where: { id: { in: appIds } } });
  if (fixtureIds.length) {
    await prisma.userRole.deleteMany({ where: { userId: { in: fixtureIds } } });
    await prisma.user.deleteMany({ where: { id: { in: fixtureIds } } });
  }
  await prisma.$disconnect();
});

test('customer submits application; concurrent duplicates serialize; history omits internal notes', async () => {
  const customer = await makeUser('applicant'); const auth = headers(await token(customer));
  const bad = await fetch(base + '/seller-applications', { method: 'POST', headers: auth, body: JSON.stringify({ ...application(), role: 'SELLER' }) });
  assert.equal(bad.status, 400);
  const results = await Promise.all([1, 2].map(() => fetch(base + '/seller-applications', { method: 'POST', headers: auth, body: JSON.stringify(application()) })));
  assert.equal(results.filter(result => result.status === 201).length, 1);
  assert.equal(results.filter(result => result.status === 409).length, 1);
  const created = (await results.find(result => result.status === 201).json()).data;
  assert.equal(created.status, 'PENDING');
  assert.equal((await fetch(base + '/seller/stores/me', { headers: auth })).status, 403);
  const listing = await fetch(base + '/admin/seller-applications', { headers: auth }); assert.equal(listing.status, 403);
  const adminAuth = headers(await token(admin));
  assert.equal((await fetch(`${base}/admin/seller-applications/${created.id}`, { headers: auth })).status, 403);
  const forbiddenDecision = await fetch(`${base}/admin/seller-applications/${created.id}/decision`, { method: 'POST', headers: auth, body: JSON.stringify({ decision: 'REJECT', applicantMessage: 'No', internalRejectionReason: 'Not admin' }) });
  assert.equal(forbiddenDecision.status, 403);
  const reject = await fetch(`${base}/admin/seller-applications/${created.id}/decision`, { method: 'POST', headers: adminAuth, body: JSON.stringify({ decision: 'REJECT', applicantMessage: 'Please provide details.', internalRejectionReason: 'Address verification needed.' }) });
  assert.equal(reject.status, 200);
  const historyResponse = await fetch(base + '/seller-applications/me', { headers: auth });
  const history = await historyResponse.json(); assert.equal(history.data[0].applicantMessage, 'Please provide details.');
  assert.equal(JSON.stringify(history).includes('Address verification needed.'), false);
  const stored = await prisma.sellerApplication.findUnique({ where: { id: created.id } });
  assert.equal(stored.internalRejectionReason, 'Address verification needed.'); assert.equal(stored.decidedById, admin.id); assert.ok(stored.decidedAt);
  const audit = await prisma.sellerAdminAudit.findFirst({ where: { applicationId: created.id } }); assert.equal(audit.actorUserId, admin.id); assert.equal(audit.toStatus, 'REJECTED');
  const storeAttempt = await fetch(base + '/seller/stores/me', { headers: auth }); assert.equal(storeAttempt.status, 403);

  const reapplication = await fetch(base + '/seller-applications', { method: 'POST', headers: auth, body: JSON.stringify(application('Second application')) });
  assert.equal(reapplication.status, 201);
  const historyAfterReapply = await (await fetch(base + '/seller-applications/me', { headers: auth })).json();
  assert.equal(historyAfterReapply.data.length, 2);
  assert.deepEqual(historyAfterReapply.data.map(row => row.status).sort(), ['PENDING', 'REJECTED']);
  assert.equal(await prisma.sellerAccount.count({ where: { userId: customer.id } }), 0);
});

test('approval, concurrent decisions, seller access, suspension, and single owned draft store', async () => {
  const customer = await makeUser('approved'); const auth = headers(await token(customer));
  const submit = await fetch(base + '/seller-applications', { method: 'POST', headers: auth, body: JSON.stringify(application('Approved Foods')) });
  const applicationId = (await submit.json()).data.id;
  const adminAuth = headers(await token(admin));
  const decisions = await Promise.all([1, 2].map(() => fetch(`${base}/admin/seller-applications/${applicationId}/decision`, { method: 'POST', headers: adminAuth, body: JSON.stringify({ decision: 'APPROVE', applicantMessage: 'Welcome to KiliCart.' }) })));
  assert.equal(decisions.filter(result => result.status === 200).length, 1);
  assert.equal(decisions.filter(result => result.status === 409).length, 1);
  assert.equal(await prisma.sellerAccount.count({ where: { userId: customer.id } }), 1);
  assert.equal(await prisma.userRole.count({ where: { userId: customer.id, role: { code: 'SELLER' } } }), 1);
  const accountResponse = await fetch(base + '/auth/me', { headers: auth });
  assert.deepEqual((await accountResponse.json()).data.roles.sort(), ['CUSTOMER', 'SELLER']);

  const storeBody = { name: 'Approved Foods', slug: `${prefix}-approved`, description: 'A draft storefront' };
  const storeResults = await Promise.all([1, 2].map(() => fetch(base + '/seller/stores', { method: 'POST', headers: auth, body: JSON.stringify(storeBody) })));
  assert.equal(storeResults.filter(result => result.status === 201).length, 1);
  assert.equal(storeResults.filter(result => result.status === 409).length, 1);
  const store = (await storeResults.find(result => result.status === 201).json()).data;
  assert.equal(store.status, 'DRAFT');
  const mine = await fetch(base + '/seller/stores/me', { headers: auth }); assert.equal((await mine.json()).data.id, store.id);

  const other = await makeUser('other');
  const otherAuth = headers(await token(other));
  const stolen = await fetch(base + '/seller/stores/me', { headers: otherAuth }); assert.equal(stolen.status, 403);
  const statusUrl = `${base}/admin/sellers/${customer.id}/status`;
  const auditCountBefore = await prisma.sellerAdminAudit.count({ where: { sellerAccountId: store.sellerAccountId } });
  for (const invalidBody of [
    { status: 'SUSPENDED' },
    { status: 'SUSPENDED', reason: '   ' },
    { status: 'SUSPENDED', reason: 'x'.repeat(1001) },
    { status: 'INVALID', reason: 'A reason' },
  ]) {
    const invalid = await fetch(statusUrl, { method: 'POST', headers: adminAuth, body: JSON.stringify(invalidBody) });
    assert.equal(invalid.status, 400);
  }
  assert.equal(await prisma.sellerAdminAudit.count({ where: { sellerAccountId: store.sellerAccountId } }), auditCountBefore);
  const suspended = await fetch(statusUrl, { method: 'POST', headers: adminAuth, body: JSON.stringify({ status: 'SUSPENDED', reason: '  Verification review  ' }) });
  assert.equal(suspended.status, 200);
  assert.equal((await fetch(base + '/seller/stores/me', { headers: auth })).status, 403);
  let account = await prisma.sellerAccount.findUnique({ where: { userId: customer.id } });
  assert.equal(account.status, 'SUSPENDED'); assert.equal(account.suspensionReason, 'Verification review');
  let statusAudit = await prisma.sellerAdminAudit.findFirst({ where: { sellerAccountId: account.id, action: 'SELLER_SUSPENDED' }, orderBy: { createdAt: 'desc' } });
  assert.equal(statusAudit.actorUserId, admin.id); assert.equal(statusAudit.targetUserId, customer.id);
  assert.equal(statusAudit.fromStatus, 'ACTIVE'); assert.equal(statusAudit.toStatus, 'SUSPENDED');
  assert.equal(statusAudit.reason, 'Verification review'); assert.ok(statusAudit.createdAt instanceof Date);
  const afterSuspensionAuditCount = await prisma.sellerAdminAudit.count({ where: { sellerAccountId: account.id } });
  const repeatedSuspension = await fetch(statusUrl, { method: 'POST', headers: adminAuth, body: JSON.stringify({ status: 'SUSPENDED', reason: 'Duplicate request' }) });
  assert.equal(repeatedSuspension.status, 409);
  assert.equal(await prisma.sellerAdminAudit.count({ where: { sellerAccountId: account.id } }), afterSuspensionAuditCount);
  const stillCustomer = await fetch(base + '/auth/me', { headers: auth }); assert.equal(stillCustomer.status, 200);
  assert.deepEqual((await stillCustomer.json()).data.roles.sort(), ['CUSTOMER', 'SELLER']);
  for (const missingReason of [{ status: 'ACTIVE' }, { status: 'ACTIVE', reason: '   ' }]) {
    const invalid = await fetch(statusUrl, { method: 'POST', headers: adminAuth, body: JSON.stringify(missingReason) }); assert.equal(invalid.status, 400);
  }
  assert.equal(await prisma.sellerAdminAudit.count({ where: { sellerAccountId: account.id } }), afterSuspensionAuditCount);
  const activated = await fetch(statusUrl, { method: 'POST', headers: adminAuth, body: JSON.stringify({ status: 'ACTIVE', reason: '  Evidence accepted  ' }) }); assert.equal(activated.status, 200);
  account = await prisma.sellerAccount.findUnique({ where: { userId: customer.id } });
  assert.equal(account.status, 'ACTIVE'); assert.equal(account.suspensionReason, null); assert.equal(account.suspendedAt, null);
  statusAudit = await prisma.sellerAdminAudit.findFirst({ where: { sellerAccountId: account.id, action: 'SELLER_REACTIVATED' }, orderBy: { createdAt: 'desc' } });
  assert.equal(statusAudit.actorUserId, admin.id); assert.equal(statusAudit.targetUserId, customer.id);
  assert.equal(statusAudit.fromStatus, 'SUSPENDED'); assert.equal(statusAudit.toStatus, 'ACTIVE');
  assert.equal(statusAudit.reason, 'Evidence accepted'); assert.ok(statusAudit.createdAt instanceof Date);
  const afterReactivationAuditCount = await prisma.sellerAdminAudit.count({ where: { sellerAccountId: account.id } });
  const repeatedActivation = await fetch(statusUrl, { method: 'POST', headers: adminAuth, body: JSON.stringify({ status: 'ACTIVE', reason: 'Duplicate request' }) });
  assert.equal(repeatedActivation.status, 409);
  assert.equal(await prisma.sellerAdminAudit.count({ where: { sellerAccountId: account.id } }), afterReactivationAuditCount);
  assert.equal((await fetch(base + '/seller/stores/me', { headers: auth })).status, 200);
});
