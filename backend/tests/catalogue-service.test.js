import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogueService, parseProductFilters, parseSearchQuery } from '../src/services/catalogue.service.js';

test('active category discovery selects only public fields and active hierarchy', async () => {
  let args;
  const service = createCatalogueService({ category: { findMany: async value => { args = value; return []; } } });
  await service.listCategories();
  assert.deepEqual(args.where, { status: 'ACTIVE', parentId: null });
  assert.equal(args.select.children.where.status, 'ACTIVE');
  assert.equal(args.select.internalRejectionReason, undefined);
});

test('catalogue search constrains products, stores and categories to public states and paginates at the database', async () => {
  const args = {};
  const db = {
    product: { findMany: async value => { args.product = value; return []; } },
    store: { findMany: async value => { args.store = value; return []; } },
    category: { findMany: async value => { args.category = value; return []; } },
  };
  await createCatalogueService(db).search('pickle', { page: 3, pageSize: 10 });
  assert.equal(args.category.where.status, 'ACTIVE');
  assert.deepEqual(args.category.where.OR, [{ name: { contains: 'pickle' } }, { description: { contains: 'pickle' } }]);
  for (const key of ['product', 'store', 'category']) { assert.equal(args[key].skip, 20); assert.equal(args[key].take, 11); }
  assert.deepEqual(args.product.where, { status: 'PUBLISHED', category: { status: 'ACTIVE' }, store: { status: 'ACTIVE', sellerAccount: { status: 'ACTIVE' } }, OR: [{ name: { contains: 'pickle' } }, { description: { contains: 'pickle' } }] });
  assert.deepEqual(args.store.where, { status: 'ACTIVE', sellerAccount: { status: 'ACTIVE' }, OR: [{ name: { contains: 'pickle' } }, { description: { contains: 'pickle' } }] });
});

test('public product and store detail and list queries enforce the reviewed lifecycle', async () => {
  const calls = [];
  const db = {
    product: { findMany: async args => { calls.push(args); return []; }, findFirst: async args => { calls.push(args); return null; } },
    store: { findMany: async args => { calls.push(args); return []; }, findFirst: async args => { calls.push(args); return null; } },
  };
  const service = createCatalogueService(db);
  const filters = { page: 1, pageSize: 20, sort: 'recommended' };
  await service.listProducts(filters); await service.listCategoryProducts('food', filters); await service.listStoreProducts('shop', filters);
  await service.listStores(filters); await service.getProduct('sample'); await service.getStore('sample');
  for (const call of calls) {
    const where = call.where;
    if (where.status === 'PUBLISHED') {
      assert.equal(where.category.status, 'ACTIVE'); assert.equal(where.store.status, 'ACTIVE'); assert.equal(where.store.sellerAccount.status, 'ACTIVE');
    } else { assert.equal(where.status, 'ACTIVE'); assert.equal(where.sellerAccount.status, 'ACTIVE'); }
  }
});

test('product filters validate bounded pages, decimal price ranges and allowlisted sorting', () => {
  assert.deepEqual(parseProductFilters({ minPrice: '10.25', maxPrice: '100', sort: 'price_asc', page: '2', pageSize: '30' }), {
    page: 2, pageSize: 30, category: undefined, store: undefined, minPrice: '10.25', maxPrice: '100', sort: 'price_asc',
  });
  for (const query of [
    { page: '0' }, { pageSize: '101' }, { sort: 'random' }, { minPrice: '1.001' },
    { minPrice: '2', maxPrice: '1.99' }, { category: 'bad slug' }, { rating: '5' }, { courier: 'true' },
  ]) assert.equal(parseProductFilters(query), null, JSON.stringify(query));
});

test('search validation rejects empty, oversized, unbounded and unknown input', () => {
  assert.deepEqual(parseSearchQuery({ q: ' pickle ', page: '2', pageSize: '5' }), { query: 'pickle', page: 2, pageSize: 5 });
  for (const query of [{}, { q: ' ' }, { q: 'x'.repeat(101) }, { q: 'pickle', pageSize: '101' }, { q: 'pickle', sort: 'newest' }]) assert.equal(parseSearchQuery(query), null);
});
