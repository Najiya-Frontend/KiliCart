import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSellerService, SellerError } from '../src/services/seller.service.js';
import { createCatalogueManagementService, validPrice, validStock } from '../src/services/catalogue-management.service.js';

test('seller history selects only applicant-safe fields', async () => {
  let query;
  const service = createSellerService({ sellerApplication: { findMany: async args => { query = args; return []; } } });
  await service.listMyApplications(4);
  assert.deepEqual(query.where, { userId: 4 });
  assert.equal(query.select.internalRejectionReason, undefined);
  assert.equal(query.select.applicantMessage, true);
});

test('seller store reads require the authenticated seller and scope by seller account', async () => {
  let query;
  const seller = { id: 8, userId: 4, status: 'ACTIVE' };
  const service = createCatalogueManagementService({
    userRole: { findFirst: async () => ({ userId: 4 }) },
    sellerAccount: { findUnique: async () => seller },
    store: { findUnique: async args => { query = args; return { id: 10, sellerAccountId: 8, status: 'DRAFT' }; } },
  });
  assert.equal((await service.getMyStore(4)).sellerAccountId, 8);
  assert.deepEqual(query.where, { sellerAccountId: 8 });
  seller.status = 'SUSPENDED';
  await assert.rejects(service.getMyStore(4), error => error instanceof SellerError && error.code === 'SELLER_INACTIVE');
});

test('seller price and stock validators enforce DECIMAL(10,2) and unsigned database limits', () => {
  for (const value of ['0.01', '125', '99999999.99']) assert.equal(validPrice(value), true);
  for (const value of ['0', '100000000', '-1', '1.001', '1e2', 10, ' 1.00']) assert.equal(validPrice(value), false);
  assert.equal(validStock(0), true); assert.equal(validStock(4_294_967_295), true);
  for (const value of [-1, 4_294_967_296, 1.2, '3', Number.MAX_SAFE_INTEGER + 1]) assert.equal(validStock(value), false);
});
