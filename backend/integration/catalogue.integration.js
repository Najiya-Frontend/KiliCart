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
const prefix = `catalogue-${crypto.randomUUID()}`;
const email = suffix => `${prefix}-${suffix}@example.invalid`;
const createUser = async suffix => {
  await register({ fullName: `Catalogue ${suffix}`, email: email(suffix), password: 'Integration passphrase 123' });
  return prisma.user.findUniqueOrThrow({ where: { email: email(suffix) } });
};
const token = async user => (await login(user.email, 'Integration passphrase 123')).accessToken;
const headers = accessToken => ({ authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' });
let server; let base; let admin; let applicant; let category; let inactive; let child; let product; let draftProduct; let store;

before(async () => {
  assert.equal((await prisma.$queryRaw`SELECT DATABASE() AS name`)[0].name, 'kilicart_test');
  for (const code of ['CUSTOMER', 'SELLER', 'ADMIN', 'SUPER_ADMIN']) if (!await prisma.role.findUnique({ where: { code } })) await prisma.role.create({ data: { code, name: code } });
  admin = await createUser('admin'); await roleService.assignRole(admin.id, 'ADMIN');
  applicant = await createUser('seller');
  const adminToken = await token(admin); const applicantToken = await token(applicant);
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const submitted = await fetch(`${base}/seller-applications`, { method: 'POST', headers: headers(applicantToken), body: JSON.stringify({ businessName: 'Catalogue Fixture', businessType: 'Local goods', contactPhone: '+919876543210', businessAddress: '12 Test Road, Pune' }) });
  assert.equal(submitted.status, 201);
  const application = (await submitted.json()).data;
  const decision = await fetch(`${base}/admin/seller-applications/${application.id}/decision`, { method: 'POST', headers: headers(adminToken), body: JSON.stringify({ decision: 'APPROVE', applicantMessage: 'Approved for integration fixture.' }) });
  assert.equal(decision.status, 200);
  const createdStore = await fetch(`${base}/seller/stores`, { method: 'POST', headers: headers(applicantToken), body: JSON.stringify({ name: 'Catalogue Fixture', slug: `${prefix}-store`, description: 'Integration fixture store' }) });
  assert.equal(createdStore.status, 201, await createdStore.clone().text());
  store = (await createdStore.json()).data;
  category = await prisma.category.create({ data: { name: 'Fixture foods', slug: `${prefix}-foods`, status: 'ACTIVE' } });
  inactive = await prisma.category.create({ data: { name: 'Fixture inactive', slug: `${prefix}-inactive`, status: 'INACTIVE' } });
  child = await prisma.category.create({ data: { name: 'Fixture pickles', slug: `${prefix}-pickles`, status: 'ACTIVE', parentId: category.id } });
  product = await prisma.product.create({ data: { storeId: store.id, categoryId: category.id, name: 'Hidden draft store product', slug: `${prefix}-product`, price: '123.45', status: 'PUBLISHED', stockQuantity: 4, description: 'Must not become public through a draft store.' }, include: { images: true } });
  await prisma.productImage.create({ data: { productId: product.id, url: 'https://example.invalid/test.png', altText: 'fixture image', position: 0 } });
  draftProduct = await prisma.product.create({ data: { storeId: store.id, categoryId: category.id, name: 'Unpublished draft product', slug: `${prefix}-draft-product`, price: '50.00', status: 'DRAFT', stockQuantity: 8 } });
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  assert.equal((await prisma.$queryRaw`SELECT DATABASE() AS name`)[0].name, 'kilicart_test');
  const users = await prisma.user.findMany({ where: { email: { startsWith: prefix } }, select: { id: true } });
  const ids = users.map(row => row.id);
  const applications = await prisma.sellerApplication.findMany({ where: { userId: { in: ids } }, select: { id: true } });
  const sellerAccounts = await prisma.sellerAccount.findMany({ where: { userId: { in: ids } }, select: { id: true } });
  const applicationIds = applications.map(row => row.id); const sellerIds = sellerAccounts.map(row => row.id);
  await prisma.catalogueReviewAudit.deleteMany({ where: { OR: [{ actorUserId: { in: ids } }, { targetUserId: { in: ids } }, { sellerAccountId: { in: sellerIds } }, { storeId: store ? store.id : -1 }, { productId: { in: [product?.id, draftProduct?.id].filter(Boolean) } }] } });
  if (product) await prisma.product.deleteMany({ where: { id: product.id } });
  if (draftProduct) await prisma.product.deleteMany({ where: { id: draftProduct.id } });
  if (child) await prisma.category.deleteMany({ where: { id: child.id } });
  if (category) await prisma.category.deleteMany({ where: { id: category.id } });
  if (inactive) await prisma.category.deleteMany({ where: { id: inactive.id } });
  if (store) await prisma.store.deleteMany({ where: { id: store.id } });
  if (sellerIds.length) await prisma.sellerAdminAudit.deleteMany({ where: { sellerAccountId: { in: sellerIds } } });
  if (sellerIds.length) await prisma.sellerAccount.deleteMany({ where: { id: { in: sellerIds } } });
  if (applicationIds.length) await prisma.sellerAdminAudit.deleteMany({ where: { applicationId: { in: applicationIds } } });
  if (applicationIds.length) await prisma.sellerApplication.deleteMany({ where: { id: { in: applicationIds } } });
  if (ids.length) await prisma.sellerAdminAudit.deleteMany({ where: { OR: [{ actorUserId: { in: ids } }, { targetUserId: { in: ids } }] } });
  if (ids.length) await prisma.userRole.deleteMany({ where: { userId: { in: ids } } });
  if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

test('public category APIs return only active categories and active child hierarchy without authentication', async () => {
  const listing = await fetch(`${base}/categories`); assert.equal(listing.status, 200);
  const rows = (await listing.json()).data;
  const root = rows.find(row => row.id === category.id);
  assert.ok(root); assert.equal(root.children.some(row => row.id === child.id), true);
  assert.equal(rows.some(row => row.id === inactive.id), false);
  assert.equal(JSON.stringify(root).includes('internalRejectionReason'), false);
  const detail = await fetch(`${base}/categories/${category.slug}`); assert.equal(detail.status, 200);
  assert.equal((await fetch(`${base}/categories/${inactive.slug}`)).status, 404);
  assert.equal((await fetch(`${base}/categories/missing-category`)).status, 404);
});

test('catalogue listing validates filters and never exposes products through a DRAFT store', async () => {
  const response = await fetch(`${base}/products?category=${category.slug}&store=${store.slug}&minPrice=100&maxPrice=200&sort=price_asc&page=1&pageSize=5`);
  assert.equal(response.status, 200); const body = await response.json();
  assert.deepEqual(body.data, []); assert.equal(body.pagination.pageSize, 5);
  assert.equal((await fetch(`${base}/products?sort=sql`)).status, 400);
  assert.equal((await fetch(`${base}/products?minPrice=10.999`)).status, 400);
  assert.equal((await fetch(`${base}/products?minPrice=200&maxPrice=100`)).status, 400);
  assert.equal((await fetch(`${base}/products/${product.slug}`)).status, 404);
  assert.equal((await fetch(`${base}/categories/${category.slug}/products`)).status, 200);
  assert.deepEqual((await (await fetch(`${base}/categories/${category.slug}/products`)).json()).data, []);
});

test('draft and suspended seller stores remain absent from public store and search results', async () => {
  const list = await fetch(`${base}/stores?page=1&pageSize=10`); assert.equal(list.status, 200);
  assert.deepEqual((await list.json()).data, []);
  assert.equal((await fetch(`${base}/stores/${store.slug}`)).status, 404);
  assert.equal((await fetch(`${base}/stores/${store.slug}/products`)).status, 404);
  const search = await fetch(`${base}/search?q=fixture&page=1&pageSize=5`); assert.equal(search.status, 200);
  const results = (await search.json()).data;
  assert.deepEqual(results.products, []); assert.deepEqual(results.stores, []);
  assert.ok(results.categories.some(row => row.id === category.id));
  assert.equal((await fetch(`${base}/search?q=%20`)).status, 400);
  assert.equal((await fetch(`${base}/home`)).status, 200);
  const home = (await (await fetch(`${base}/home`)).json()).data;
  assert.ok(home.categories.some(row => row.id === category.id));
  assert.deepEqual(home.featuredSellers, []); assert.deepEqual(home.featuredProducts, []);

  const adminToken = await token(admin);
  const suspend = await fetch(`${base}/admin/sellers/${applicant.id}/status`, { method: 'POST', headers: headers(adminToken), body: JSON.stringify({ status: 'SUSPENDED', reason: 'Integration fixture cleanup check.' }) });
  assert.equal(suspend.status, 200);
  assert.deepEqual((await (await fetch(`${base}/stores`)).json()).data, []);
  assert.equal((await (await fetch(`${base}/products`)).json()).data.length, 0);
});
