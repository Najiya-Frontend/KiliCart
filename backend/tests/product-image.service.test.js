import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { MAX_IMAGE_BYTES, ProductImageError, createProductImageService, normalizeProductImage } from '../src/services/product-image.service.js';
import { createCloudinaryImageStorage } from '../src/services/image-storage/cloudinary.provider.js';
import { ImageStorageConfigurationError } from '../src/services/image-storage/provider.js';

const validImage = () => sharp({ create: { width: 64, height: 64, channels: 3, background: '#4a7' } }).png().toBuffer();

test('image validation detects actual PNG content and normalizes it to WebP', async () => {
  const result = await normalizeProductImage(await validImage());
  const meta = await sharp(result.buffer).metadata();
  assert.equal(meta.format, 'webp');
  assert.equal(result.width, 64);
  assert.equal(result.height, 64);
});

test('image validation rejects unsupported bytes and oversize buffers', async () => {
  await assert.rejects(normalizeProductImage(Buffer.from('not an image')), error => error instanceof ProductImageError && error.code === 'IMAGE_TYPE_UNSUPPORTED');
  await assert.rejects(normalizeProductImage(Buffer.alloc(MAX_IMAGE_BYTES + 1)), error => error instanceof ProductImageError && error.status === 413);
});

test('Cloudinary provider fails closed when backend credentials are missing', async () => {
  const storage=createCloudinaryImageStorage({client:{config(){},uploader:{}},env:{}});
  assert.throws(() => storage.upload(Buffer.from('x'),{productId:1}),ImageStorageConfigurationError);
  await assert.rejects(storage.delete('private/asset'),ImageStorageConfigurationError);
});

test('provider upload failure creates no product image row', async () => {
  const db = {
    sellerAccount: { findUnique: async () => ({ status: 'ACTIVE', store: { id: 9 } }) },
    userRole: { findFirst: async () => ({ userId: 1 }) },
    product: { findFirst: async () => ({ id: 12, status: 'DRAFT' }) },
    productImage: { create: async () => ({ id: 1 }), deleteMany: async () => {} },
    $transaction: async callback => callback({
      $queryRaw: async () => {}, userRole: db.userRole,
      sellerAccount: { findUnique: async () => ({ id: 3, status: 'ACTIVE' }) },
      store: { findUnique: async () => ({ id: 9 }) },
      product: { findFirst: async () => ({ id: 12, storeId: 9, status: 'DRAFT' }) },
      productImage: { findMany: async () => [], create: async () => ({ id: 1 }) },
    }),
  };
  const service = createProductImageService({ db, storage: { upload: async () => { throw new Error('provider offline'); }, delete: async () => {} } });
  await assert.rejects(service.upload(1, 12, await validImage()), /provider offline/);
});

test('upload rechecks seller ownership in transaction and compensates provider asset on conflict', async () => {
  const db = {
    sellerAccount: { findUnique: async () => ({ status: 'ACTIVE', store: { id: 9 } }) },
    userRole: { findFirst: async () => ({ userId: 1 }) },
    product: { findFirst: async () => ({ id: 12, storeId: 9, status: 'DRAFT' }) },
    productImage: { count: async () => 0 },
    $transaction: async callback => callback({
      $queryRaw: async () => {}, userRole: db.userRole, sellerAccount: { findUnique: async () => ({ id: 3, status: 'ACTIVE' }) },
      store: { findUnique: async () => ({ id: 9 }) }, product: { findFirst: async () => ({ id: 12, storeId: 9, status: 'DRAFT' }) },
      productImage: { findMany: async () => [], create: async () => ({ id: 1 }), deleteMany: async () => {} }, catalogueReviewAudit: { create: async () => {} },
    }),
    productImage: { updateMany: async () => {}, deleteMany: async () => {} },
  };
  const deleted = []; let uploadedId; const storage = { upload: async (_buffer, { assetId }) => { uploadedId = assetId; return { url: 'https://images.example.invalid/a.webp', assetId, format: 'webp', bytes: 100, width: 64, height: 64 }; }, delete: async id => deleted.push(id) };
  const service = createProductImageService({ db, storage });
  let transactions = 0;
  const originalTransaction = db.$transaction;
  db.$transaction = async callback => { transactions++; if (transactions === 1) return originalTransaction(callback); return callback({
    $queryRaw: async () => {}, userRole: db.userRole, sellerAccount: { findUnique: async () => ({ id: 3, status: 'ACTIVE' }) },
    store: { findUnique: async () => ({ id: 9 }) }, product: { findFirst: async () => null },
    productImage: { findMany: async () => [], create: async () => ({ id: 1 }), deleteMany: async () => {} }, catalogueReviewAudit: { create: async () => {} },
  }); };
  await assert.rejects(service.upload(1, 12, await validImage()), error => error instanceof ProductImageError && error.code === 'PRODUCT_NOT_FOUND');
  assert.deepEqual(deleted, [uploadedId]);
});

test('delete hides image before provider deletion and leaves retryable cleanup state on provider failure', async () => {
  let storedStatus = 'ACTIVE'; let dbDeleted = false;
  const db = {
    $transaction: async callback => callback({
      $queryRaw: async () => {}, userRole: { findFirst: async () => ({ userId: 1 }) },
      sellerAccount: { findUnique: async () => ({ id: 3, status: 'ACTIVE' }) }, store: { findUnique: async () => ({ id: 9 }) },
      product: { findFirst: async () => ({ id: 12, storeId: 9, status: 'DRAFT' }) },
      productImage: { findFirst: async () => ({ id: 22, productId: 12, status: storedStatus, provider: 'cloudinary', providerAssetId: 'asset/a', position: 0 }), update: async ({ data }) => { storedStatus = data.status; }, findMany: async () => [] },
      catalogueReviewAudit: { create: async () => {} },
    }),
    productImage: { deleteMany: async () => { dbDeleted = true; }, findMany: async () => [] },
  };
  const service = createProductImageService({ db, storage: { upload: async () => {}, delete: async () => { throw new Error('provider offline'); } } });
  await assert.rejects(service.delete(1, 12, 22), error => error instanceof ProductImageError && error.code === 'IMAGE_DELETE_PENDING');
  assert.equal(storedStatus, 'DELETE_PENDING');
  assert.equal(dbDeleted, false);
});
