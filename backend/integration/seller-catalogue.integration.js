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

const prefix = `seller-catalogue-${crypto.randomUUID()}`;
const email = suffix => `${prefix}-${suffix}@example.invalid`;
const password = 'Integration passphrase 123';
const headers = token => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });
const post = (path, auth, body = {}) => fetch(`${base}${path}`, { method: 'POST', headers: auth, body: JSON.stringify(body) });
const get = (path, auth) => fetch(`${base}${path}`, auth ? { headers: auth } : undefined);
let server; let base; let admin; let adminAuth; let owner; let ownerAuth; let other; let otherAuth; let store; let otherStore; let category; let inactiveCategory;

async function makeUser(suffix) {
  await register({ fullName: `Review ${suffix}`, email: email(suffix), password });
  return prisma.user.findUniqueOrThrow({ where: { email: email(suffix) } });
}
async function token(user) { return (await login(user.email, password)).accessToken; }
async function onboardSeller(user, suffix) {
  const auth = headers(await token(user));
  const submission = await post('/seller-applications', auth, { businessName: `Review ${suffix}`, businessType: 'Local goods', contactPhone: '+919876543210', businessAddress: '12 Integration Road, Pune' });
  assert.equal(submission.status, 201);
  const applicationId = (await submission.json()).data.id;
  const approved = await post(`/admin/seller-applications/${applicationId}/decision`, adminAuth, { decision: 'APPROVE', applicantMessage: 'Approved for testing.' });
  assert.equal(approved.status, 200);
  return auth;
}
async function json(response) { return response.json(); }

before(async () => {
  assert.equal((await prisma.$queryRaw`SELECT DATABASE() AS name`)[0].name, 'kilicart_test');
  for (const code of ['CUSTOMER', 'SELLER', 'ADMIN', 'SUPER_ADMIN']) if (!await prisma.role.findUnique({ where: { code } })) await prisma.role.create({ data: { code, name: code } });
  admin = await makeUser('admin'); await roleService.assignRole(admin.id, 'ADMIN'); adminAuth = headers(await token(admin));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
  owner = await makeUser('owner'); ownerAuth = await onboardSeller(owner, 'owner');
  other = await makeUser('other'); otherAuth = await onboardSeller(other, 'other');
  category = await prisma.category.create({ data: { name: 'Review active category', slug: `${prefix}-active`, status: 'ACTIVE' } });
  inactiveCategory = await prisma.category.create({ data: { name: 'Review inactive category', slug: `${prefix}-inactive`, status: 'INACTIVE' } });
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  assert.equal((await prisma.$queryRaw`SELECT DATABASE() AS name`)[0].name, 'kilicart_test');
  const users = await prisma.user.findMany({ where: { email: { startsWith: prefix } }, select: { id: true } });
  const userIds = users.map(row => row.id);
  const sellerAccounts = await prisma.sellerAccount.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const sellerIds = sellerAccounts.map(row => row.id);
  const stores = await prisma.store.findMany({ where: { sellerAccountId: { in: sellerIds } }, select: { id: true } });
  const storeIds = stores.map(row => row.id);
  const products = await prisma.product.findMany({ where: { storeId: { in: storeIds } }, select: { id: true } });
  const productIds = products.map(row => row.id);
  await prisma.catalogueReviewAudit.deleteMany({ where: { OR: [
    { actorUserId: { in: userIds } }, { targetUserId: { in: userIds } }, { sellerAccountId: { in: sellerIds } },
    { storeId: { in: storeIds } }, { productId: { in: productIds } },
  ] } });
  if (productIds.length) await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  if (storeIds.length) await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
  if (category) await prisma.category.deleteMany({ where: { id: category.id } });
  if (inactiveCategory) await prisma.category.deleteMany({ where: { id: inactiveCategory.id } });
  await prisma.sellerAdminAudit.deleteMany({ where: { OR: [{ actorUserId: { in: userIds } }, { targetUserId: { in: userIds } }] } });
  if (sellerIds.length) await prisma.sellerAccount.deleteMany({ where: { id: { in: sellerIds } } });
  const applications = await prisma.sellerApplication.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  const applicationIds = applications.map(row => row.id);
  if (applicationIds.length) await prisma.sellerApplication.deleteMany({ where: { id: { in: applicationIds } } });
  if (userIds.length) { await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } }); await prisma.user.deleteMany({ where: { id: { in: userIds } } }); }
  await prisma.$disconnect();
});

test('seller store and product lifecycle, admin review, ownership, audits, and public visibility', async () => {
  assert.equal((await get('/seller/stores/me', ownerAuth)).status, 200);
  assert.equal((await json(await get('/seller/stores/me', ownerAuth))).data, null);
  const createStore = await post('/seller/stores', ownerAuth, { name: 'Owner Store', slug: `${prefix}-store`, description: 'Initial draft', contactPhone: '+919876543210', location: 'Pune, Maharashtra', sellerAccountId: other.id, status: 'ACTIVE' });
  assert.equal(createStore.status, 400, 'seller cannot set ownership or status');
  assert.equal((await post('/seller/stores', ownerAuth, { name: 'Invalid phone', slug: `${prefix}-bad-phone`, contactPhone: '-------' })).status, 400);
  const created = await post('/seller/stores', ownerAuth, { name: 'Owner Store', slug: `${prefix}-store`, description: 'Initial draft', contactPhone: '+919876543210', location: 'Pune, Maharashtra' });
  assert.equal(created.status, 201); store = (await json(created)).data; assert.equal(store.status, 'DRAFT'); assert.equal(store.sellerAccountId, undefined);
  const otherCreate = await post('/seller/stores', otherAuth, { name: 'Other Store', slug: `${prefix}-other-store` });
  assert.equal(otherCreate.status, 201); otherStore = (await json(otherCreate)).data;
  const ownStoreEdit = await fetch(`${base}/seller/stores/me`, { method: 'PATCH', headers: otherAuth, body: JSON.stringify({ name: 'Only other seller store' }) });
  assert.equal(ownStoreEdit.status, 200);
  assert.equal((await json(ownStoreEdit)).data.id, otherStore.id);
  assert.equal((await post(`/admin/stores/${store.id}/decision`, otherAuth, { decision: 'APPROVE', reason: 'Unauthorized review attempt.' })).status, 403);

  assert.equal((await post(`/seller/stores/me/submit`, ownerAuth)).status, 200);
  let mine = (await json(await get('/seller/stores/me', ownerAuth))).data;
  assert.equal(mine.status, 'PENDING_REVIEW');
  assert.equal((await fetch(`${base}/seller/stores/me`, { method: 'PATCH', headers: ownerAuth, body: JSON.stringify({ name: 'Locked edit' }) })).status, 409);
  let pending = await get('/admin/stores/pending?page=1&pageSize=10', adminAuth); assert.equal(pending.status, 200); assert.ok((await json(pending)).data.some(row => row.id === store.id));
  assert.equal((await get(`/admin/stores/${store.id}`, adminAuth)).status, 200);
  assert.equal((await post(`/admin/stores/${store.id}/decision`, adminAuth, { decision: 'APPROVE' })).status, 400);
  let rejected = await post(`/admin/stores/${store.id}/decision`, adminAuth, { decision: 'REJECT', reason: 'Provide a clearer storefront description.' });
  assert.equal(rejected.status, 200);
  mine = (await json(await get('/seller/stores/me', ownerAuth))).data; assert.equal(mine.status, 'REJECTED'); assert.equal(mine.rejectionReason, 'Provide a clearer storefront description.');
  assert.equal((await fetch(`${base}/seller/stores/me`, { method: 'PATCH', headers: ownerAuth, body: JSON.stringify({ description: 'Updated details' }) })).status, 200);
  assert.equal((await post('/seller/stores/me/submit', ownerAuth)).status, 200);
  const storeDecisions = await Promise.all([1, 2].map(() => post(`/admin/stores/${store.id}/decision`, adminAuth, { decision: 'APPROVE', reason: 'Store details verified.' })));
  assert.deepEqual(storeDecisions.map(response => response.status).sort(), [200, 409]);
  mine = (await json(await get('/seller/stores/me', ownerAuth))).data; assert.equal(mine.status, 'ACTIVE');

  for (const bad of [
    { name: 'Invalid Price', slug: `${prefix}-bad-price`, categoryId: category.id, price: '1.001' },
    { name: 'Invalid Price', slug: `${prefix}-bad-price2`, categoryId: category.id, price: '1e2' },
    { name: 'Invalid Stock', slug: `${prefix}-bad-stock`, categoryId: category.id, price: '1.00', stockQuantity: -1 },
    { name: 'Inactive Category', slug: `${prefix}-bad-category`, categoryId: inactiveCategory.id, price: '1.00' },
    { name: 'Unknown image field', slug: `${prefix}-bad-image`, categoryId: category.id, price: '1.00', images: [{ url: 'https://example.invalid/image.png' }] },
  ]) assert.equal((await post('/seller/products', ownerAuth, bad)).status, 400);
  const createdProduct = await post('/seller/products', ownerAuth, { name: 'Test Pickle', slug: `${prefix}-pickle`, categoryId: category.id, price: '125.25', stockQuantity: 4, description: 'Small batch product' });
  assert.equal(createdProduct.status, 201); const product = (await json(createdProduct)).data;
  assert.equal(product.status, 'DRAFT'); assert.equal(product.price, '125.25');
  assert.equal((await get(`/seller/products/${product.id}`, otherAuth)).status, 404);
  assert.equal((await fetch(`${base}/seller/products/${product.id}`, { method: 'PATCH', headers: otherAuth, body: JSON.stringify({ price: '1.00' }) })).status, 404);
  const ownProducts = await get('/seller/products?page=1&pageSize=1', ownerAuth); assert.equal((await json(ownProducts)).data[0].id, product.id);
  assert.equal((await fetch(`${base}/seller/products/${product.id}`, { method: 'PATCH', headers: ownerAuth, body: JSON.stringify({ price: '0.00' }) })).status, 400);
  assert.equal((await fetch(`${base}/seller/products/${product.id}`, { method: 'PATCH', headers: ownerAuth, body: JSON.stringify({ price: '150.00', stockQuantity: 7 }) })).status, 200);
  assert.equal((await post(`/seller/products/${product.id}/submit`, ownerAuth)).status, 200);
  let productReviewList = await get('/admin/products/pending?page=1&pageSize=10', adminAuth); assert.ok((await json(productReviewList)).data.some(row => row.id === product.id));
  assert.equal((await get(`/admin/products/${product.id}`, adminAuth)).status, 200);
  assert.equal((await post(`/admin/products/${product.id}/decision`, adminAuth, { decision: 'APPROVE' })).status, 400);
  assert.equal((await post(`/admin/products/${product.id}/decision`, adminAuth, { decision: 'REJECT', reason: 'Correct the product label.' })).status, 200);
  let sellerProduct = (await json(await get(`/seller/products/${product.id}`, ownerAuth))).data;
  assert.equal(sellerProduct.status, 'REJECTED'); assert.equal(sellerProduct.rejectionReason, 'Correct the product label.');
  assert.equal((await fetch(`${base}/seller/products/${product.id}`, { method: 'PATCH', headers: ownerAuth, body: JSON.stringify({ description: 'Label corrected' }) })).status, 200);
  assert.equal((await post(`/seller/products/${product.id}/submit`, ownerAuth)).status, 200);
  const approvals = await Promise.all([1, 2].map(() => post(`/admin/products/${product.id}/decision`, adminAuth, { decision: 'APPROVE', reason: 'Product content verified.' })));
  assert.deepEqual(approvals.map(response => response.status).sort(), [200, 409]);
  sellerProduct = (await json(await get(`/seller/products/${product.id}`, ownerAuth))).data; assert.equal(sellerProduct.status, 'PUBLISHED');

  const publicProduct = await get(`/products/${product.slug}`); assert.equal(publicProduct.status, 200);
  const publicData = (await json(publicProduct)).data; assert.equal(publicData.store.slug, store.slug); assert.equal(publicData.contactPhone, undefined); assert.equal(publicData.store.contactPhone, undefined); assert.equal(publicData.sellerAccount, undefined);
  const list = (await json(await get(`/products?category=${category.slug}&store=${store.slug}&minPrice=100&maxPrice=200&sort=price_asc&page=1&pageSize=2`))).data;
  assert.ok(list.some(row => row.id === product.id));
  assert.ok((await json(await get(`/categories/${category.slug}/products`))).data.some(row => row.id === product.id));
  assert.ok((await json(await get(`/stores/${store.slug}/products`))).data.some(row => row.id === product.id));
  assert.equal((await get(`/stores/${store.slug}`)).status, 200);
  assert.ok((await json(await get(`/search?q=Test%20Pickle`))).data.products.some(row => row.id === product.id));
  assert.ok((await json(await get('/home'))).data.featuredProducts.some(row => row.id === product.id));
  assert.ok((await json(await get('/stores?page=1&pageSize=10'))).data.some(row => row.id === store.id));

  const stockOnly = await fetch(`${base}/seller/products/${product.id}`, { method: 'PATCH', headers: ownerAuth, body: JSON.stringify({ stockQuantity: 9 }) });
  assert.equal(stockOnly.status, 200); assert.equal((await json(stockOnly)).data.status, 'PUBLISHED');
  const mutableResponse = await post('/seller/products', ownerAuth, { name: 'Mutable product', slug: `${prefix}-mutable`, categoryId: category.id, price: '20.00' });
  const mutable = (await json(mutableResponse)).data; assert.equal(mutableResponse.status, 201);
  assert.equal((await post(`/seller/products/${mutable.id}/submit`, ownerAuth)).status, 200);
  assert.equal((await post(`/admin/products/${mutable.id}/decision`, adminAuth, { decision: 'APPROVE', reason: 'Mutable product first review.' })).status, 200);
  const priceEdit = await fetch(`${base}/seller/products/${mutable.id}`, { method: 'PATCH', headers: ownerAuth, body: JSON.stringify({ price: '21.00' }) });
  assert.equal(priceEdit.status, 200); assert.equal((await json(priceEdit)).data.status, 'DRAFT');
  assert.equal((await get(`/products/${mutable.slug}`)).status, 404);
  assert.equal((await post(`/seller/products/${mutable.id}/submit`, ownerAuth)).status, 200);
  assert.equal((await post(`/admin/products/${mutable.id}/decision`, adminAuth, { decision: 'APPROVE', reason: 'Updated product content verified.' })).status, 200);
  const archived = await post(`/seller/products/${mutable.id}/archive`, ownerAuth);
  assert.equal(archived.status, 200); assert.equal((await json(archived)).data.status, 'ARCHIVED');
  assert.equal((await get(`/products/${mutable.slug}`)).status, 404);

  const storeEdit = await fetch(`${base}/seller/stores/me`, { method: 'PATCH', headers: ownerAuth, body: JSON.stringify({ location: 'Nagpur, Maharashtra' }) });
  assert.equal(storeEdit.status, 200); assert.equal((await json(storeEdit)).data.status, 'DRAFT');
  assert.equal((await get(`/stores/${store.slug}`)).status, 404);
  assert.equal((await post('/seller/stores/me/submit', ownerAuth)).status, 200);
  const storeReadmit = await post(`/admin/stores/${store.id}/decision`, adminAuth, { decision: 'APPROVE', reason: 'Updated store details verified.' });
  assert.equal(storeReadmit.status, 200);

  const hiddenCategoryProduct = await prisma.product.create({ data: { storeId: store.id, categoryId: inactiveCategory.id, name: 'Hidden category product', slug: `${prefix}-hidden-category`, price: '9.99', status: 'PUBLISHED', stockQuantity: 2 } });
  const hiddenStatusProduct = await prisma.product.create({ data: { storeId: store.id, categoryId: category.id, name: 'Hidden archived product', slug: `${prefix}-hidden-archived`, price: '9.99', status: 'ARCHIVED', stockQuantity: 2 } });
  assert.equal((await get(`/products/${hiddenCategoryProduct.slug}`)).status, 404);
  assert.equal((await get(`/products/${hiddenStatusProduct.slug}`)).status, 404);

  assert.equal((await post('/seller/stores/me/submit', otherAuth)).status, 200);
  assert.equal((await post(`/admin/sellers/${other.id}/status`, adminAuth, { status: 'SUSPENDED', reason: 'Store approval suspension check.' })).status, 200);
  assert.equal((await post(`/admin/stores/${otherStore.id}/decision`, adminAuth, { decision: 'APPROVE', reason: 'Approval while seller suspended.' })).status, 400);
  assert.equal((await post(`/admin/sellers/${other.id}/status`, adminAuth, { status: 'ACTIVE', reason: 'Store approval check complete.' })).status, 200);
  assert.equal((await post(`/admin/stores/${otherStore.id}/decision`, adminAuth, { decision: 'APPROVE', reason: 'Seller reactivated and store reviewed.' })).status, 200);

  const pendingProduct = await post('/seller/products', ownerAuth, { name: 'Pending suspension item', slug: `${prefix}-suspended-pending`, categoryId: category.id, price: '12.00' });
  const pendingId = (await json(pendingProduct)).data.id; assert.equal((await post(`/seller/products/${pendingId}/submit`, ownerAuth)).status, 200);
  assert.equal((await post(`/admin/sellers/${owner.id}/status`, adminAuth, { status: 'SUSPENDED', reason: 'Integration suspension check.' })).status, 200);
  assert.equal((await post(`/admin/products/${pendingId}/decision`, adminAuth, { decision: 'APPROVE', reason: 'Approval while seller suspended.' })).status, 400);
  assert.equal((await get('/seller/products', ownerAuth)).status, 403);
  assert.equal((await fetch(`${base}/seller/products/${product.id}`, { method: 'PATCH', headers: ownerAuth, body: JSON.stringify({ stockQuantity: 1 }) })).status, 403);
  assert.equal((await fetch(`${base}/seller/stores/me`, { method: 'PATCH', headers: ownerAuth, body: JSON.stringify({ name: 'Blocked edit' }) })).status, 403);
  assert.equal((await post(`/admin/sellers/${owner.id}/status`, adminAuth, { status: 'ACTIVE', reason: 'Suspension review complete.' })).status, 200);
  assert.equal((await post(`/admin/products/${pendingId}/decision`, adminAuth, { decision: 'APPROVE', reason: 'Seller reactivated and product reviewed.' })).status, 200);
  assert.equal((await post(`/admin/sellers/${owner.id}/status`, adminAuth, { status: 'SUSPENDED', reason: 'Hide public inventory check.' })).status, 200);
  assert.equal((await get(`/products/${product.slug}`)).status, 404);
  assert.equal((await get(`/stores/${store.slug}`)).status, 404);
  assert.equal((await get(`/stores/${store.slug}/products`)).status, 404);
  assert.equal((await json(await get(`/search?q=Test%20Pickle`))).data.products.some(row => row.id === product.id), false);
  assert.equal((await json(await get('/home'))).data.featuredProducts.some(row => row.id === product.id), false);

  const storeAudit = await get(`/admin/catalogue-audits?storeId=${store.id}`, adminAuth); assert.equal(storeAudit.status, 200);
  const audits = (await json(storeAudit)).data; const storeApproval = audits.find(row => row.action === 'STORE_APPROVED');
  assert.ok(storeApproval); assert.equal(storeApproval.actorUserId, admin.id); assert.equal(storeApproval.targetUserId, owner.id); assert.equal(storeApproval.fromStatus, 'PENDING_REVIEW'); assert.equal(storeApproval.toStatus, 'ACTIVE'); assert.equal(storeApproval.reason, 'Updated store details verified.'); assert.ok(storeApproval.createdAt);
  const productAudit = await get(`/admin/catalogue-audits?productId=${product.id}`, adminAuth); assert.equal(productAudit.status, 200);
  const productAudits = (await json(productAudit)).data;
  assert.ok(productAudits.some(row => row.action === 'PRODUCT_REJECTED' && row.reason === 'Correct the product label.' && row.fromStatus === 'PENDING_REVIEW' && row.toStatus === 'REJECTED'));
  assert.equal((await get('/admin/catalogue-audits', ownerAuth)).status, 403);
});
