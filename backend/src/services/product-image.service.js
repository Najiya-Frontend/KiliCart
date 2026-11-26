import { randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { prisma } from '../config/prisma.js';
import { imageStorage } from './image-storage/cloudinary.provider.js';
import { ImageStorageConfigurationError } from './image-storage/provider.js';

export const MAX_PRODUCT_IMAGES = 8;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_POSITION = 4_294_967_295;
const imageSelect = { id: true, url: true, altText: true, position: true, status: true, createdAt: true };
const imageStorageSelect = { ...imageSelect, provider: true, providerAssetId: true };

export class ProductImageError extends Error {
  constructor(code, message, status = 400) { super(message); this.name = 'ProductImageError'; this.code = code; this.status = status; }
}

export async function normalizeProductImage(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new ProductImageError('IMAGE_REQUIRED', 'Choose an image to upload');
  if (buffer.length > MAX_IMAGE_BYTES) throw new ProductImageError('IMAGE_TOO_LARGE', 'Image must be 10 MB or smaller', 413);
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !['image/jpeg', 'image/png', 'image/webp'].includes(detected.mime)) throw new ProductImageError('IMAGE_TYPE_UNSUPPORTED', 'Use a JPEG, PNG, or WebP image');
  try {
    const image = sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width < 32 || metadata.height < 32 || metadata.width > 8000 || metadata.height > 8000 || metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
      throw new ProductImageError('IMAGE_DIMENSIONS_INVALID', 'Image dimensions must be between 32 and 8000 pixels per side and at most 40 megapixels');
    }
    const normalized = await sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'error' })
      .rotate().resize({ width: 2500, height: 2500, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
    return { buffer: normalized, width: metadata.width, height: metadata.height };
  } catch (error) {
    if (error instanceof ProductImageError) throw error;
    throw new ProductImageError('IMAGE_INVALID', 'The selected file is not a valid image');
  }
}

export function createProductImageService({ db = prisma, storage = imageStorage } = {}) {
  async function lockOwnedProduct(tx, userId, productId, allowPendingProduct = false) {
    await tx.$queryRaw`SELECT id FROM seller_accounts WHERE userId = ${userId} FOR UPDATE`;
    const assignment = await tx.userRole.findFirst({ where: { userId, role: { code: 'SELLER' } }, select: { userId: true } });
    const seller = await tx.sellerAccount.findUnique({ where: { userId } });
    if (!assignment || !seller || seller.status !== 'ACTIVE') throw new ProductImageError('SELLER_INACTIVE', 'Active seller account required', 403);
    const store = await tx.store.findUnique({ where: { sellerAccountId: seller.id }, select: { id: true } });
    if (!store) throw new ProductImageError('STORE_NOT_FOUND', 'Store not found', 404);
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
    const product = await tx.product.findFirst({ where: { id: productId, storeId: store.id }, include: { store: true } });
    if (!product) throw new ProductImageError('PRODUCT_NOT_FOUND', 'Product not found', 404);
    if (!allowPendingProduct && product.status === 'PENDING_REVIEW') throw new ProductImageError('PRODUCT_PENDING_REVIEW', 'Product images cannot be changed while the product is under review', 409);
    if (!allowPendingProduct && product.status === 'ARCHIVED') throw new ProductImageError('PRODUCT_ARCHIVED', 'Archived products cannot be changed', 409);
    return { seller, store, product };
  }

  async function markPublishedProductDraft(tx, userId, seller, product) {
    if (product.status !== 'PUBLISHED') return;
    await tx.product.update({ where: { id: product.id }, data: { status: 'DRAFT', rejectionReason: null } });
    await tx.catalogueReviewAudit.create({ data: {
      actorUserId: userId, targetUserId: userId, sellerAccountId: seller.id, storeId: product.storeId, productId: product.id,
      action: 'PRODUCT_IMAGE_EDITED', fromStatus: 'PUBLISHED', toStatus: 'DRAFT', reason: null,
    } });
  }

  async function ordered(tx, productId) {
    const images = await tx.productImage.findMany({ where: { productId, status: 'ACTIVE' }, orderBy: [{ position: 'asc' }, { id: 'asc' }], select: imageSelect });
    return images.map((image, position) => ({ ...image, position, isMain: position === 0 }));
  }

  async function removeProviderAsset(image) {
    if (!image.providerAssetId || image.provider === 'legacy') return;
    await storage.delete(image.providerAssetId);
  }

  async function finalizePendingDelete(image) {
    await removeProviderAsset(image);
    await db.productImage.deleteMany({ where: { id: image.id, status: 'DELETE_PENDING' } });
  }

  async function normalizePositions(tx, productId, ids) {
    if (!ids.length) return;
    await tx.productImage.updateMany({ where: { productId, status: 'ACTIVE' }, data: { position: { increment: 100_000 } } });
    for (let position = 0; position < ids.length; position++) await tx.productImage.update({ where: { id: ids[position] }, data: { position } });
  }

  return {
    async list(userId, productId) {
      const seller = await db.sellerAccount.findUnique({ where: { userId }, include: { store: { select: { id: true } } } });
      const role = await db.userRole.findFirst({ where: { userId, role: { code: 'SELLER' } }, select: { userId: true } });
      if (!role || !seller || seller.status !== 'ACTIVE') throw new ProductImageError('SELLER_INACTIVE', 'Active seller account required', 403);
      if (!seller.store) throw new ProductImageError('STORE_NOT_FOUND', 'Store not found', 404);
      if (!await db.product.findFirst({ where: { id: productId, storeId: seller.store.id }, select: { id: true } })) throw new ProductImageError('PRODUCT_NOT_FOUND', 'Product not found', 404);
      return db.productImage.findMany({ where: { productId, status: { in: ['UPLOAD_PENDING', 'ACTIVE', 'DELETE_PENDING'] } }, orderBy: [{ status: 'asc' }, { position: 'asc' }, { id: 'asc' }], select: imageSelect }).then(rows => {
        let activePosition = 0;
        return rows.map(image => image.status === 'ACTIVE' ? { ...image, position: activePosition, isMain: activePosition++ === 0 } : { ...image, isMain: false });
      });
    },
    async assertOwned(userId, productId) {
      const seller = await db.sellerAccount.findUnique({ where: { userId }, include: { store: { select: { id: true } } } });
      const role = await db.userRole.findFirst({ where: { userId, role: { code: 'SELLER' } }, select: { userId: true } });
      if (!role || !seller || seller.status !== 'ACTIVE') throw new ProductImageError('SELLER_INACTIVE', 'Active seller account required', 403);
      if (!seller.store) throw new ProductImageError('STORE_NOT_FOUND', 'Store not found', 404);
      const product = await db.product.findFirst({ where: { id: productId, storeId: seller.store.id }, select: { id: true, status: true } });
      if (!product) throw new ProductImageError('PRODUCT_NOT_FOUND', 'Product not found', 404);
      if (product.status === 'PENDING_REVIEW') throw new ProductImageError('PRODUCT_PENDING_REVIEW', 'Product images cannot be changed while the product is under review', 409);
      if (product.status === 'ARCHIVED') throw new ProductImageError('PRODUCT_ARCHIVED', 'Archived products cannot be changed', 409);
      return product;
    },
    async upload(userId, productId, buffer, altText = null) {
      const normalized = await normalizeProductImage(buffer);
      await this.assertOwned(userId, productId);
      const assetId = `kilicart/products/product-${productId}-${randomUUID()}`;
      const reservation = await db.$transaction(async tx => {
        const { product } = await lockOwnedProduct(tx, userId, productId);
        const rows = await tx.productImage.findMany({ where: { productId, status: { in: ['ACTIVE', 'UPLOAD_PENDING'] } }, orderBy: { position: 'asc' }, select: { position: true } });
        if (rows.length >= MAX_PRODUCT_IMAGES) throw new ProductImageError('IMAGE_LIMIT_REACHED', `A product can have up to ${MAX_PRODUCT_IMAGES} images`, 409);
        const position = rows.reduce((max, row) => Math.max(max, row.position), -1) + 1;
        return tx.productImage.create({ data: { productId, url: null, provider: 'cloudinary', providerAssetId: assetId, altText, position, status: 'UPLOAD_PENDING' }, select: imageSelect });
      }, { isolationLevel: 'ReadCommitted' });
      let asset;
      try {
        asset = await storage.upload(normalized.buffer, { productId, assetId });
        if (asset.assetId !== assetId || !asset.url?.startsWith('https://')) throw new Error('Image provider returned an invalid asset');
      } catch (error) {
        if (error instanceof ImageStorageConfigurationError) {
          await db.productImage.deleteMany({ where: { id: reservation.id, status: 'UPLOAD_PENDING' } });
          throw error;
        }
        try {
          await storage.delete(assetId);
          await db.productImage.deleteMany({ where: { id: reservation.id, status: 'UPLOAD_PENDING' } });
        } catch {
          await db.productImage.updateMany({ where: { id: reservation.id }, data: { status: 'DELETE_PENDING', position: MAX_POSITION - reservation.id } }).catch(() => {});
          throw new ProductImageError('IMAGE_CLEANUP_PENDING', 'Upload failed and provider cleanup is pending. Retry image cleanup from the product.', 502);
        }
        throw error;
      }
      try {
        await db.$transaction(async tx => {
          const { seller, product } = await lockOwnedProduct(tx, userId, productId);
          const current = await tx.productImage.findFirst({ where: { id: reservation.id, productId, status: 'UPLOAD_PENDING' } });
          if (!current) throw new ProductImageError('IMAGE_UPLOAD_CANCELLED', 'The image upload was cancelled', 409);
          await markPublishedProductDraft(tx, userId, seller, product);
          await tx.productImage.update({ where: { id: reservation.id }, data: { url: asset.url, status: 'ACTIVE' } });
        }, { isolationLevel: 'ReadCommitted' });
        return await this.list(userId, productId);
      } catch (error) {
        try {
          await storage.delete(assetId);
          await db.productImage.deleteMany({ where: { id: reservation.id, status: 'UPLOAD_PENDING' } });
        } catch {
          await db.productImage.updateMany({ where: { id: reservation.id }, data: { status: 'DELETE_PENDING', position: MAX_POSITION - reservation.id } }).catch(() => {});
          throw new ProductImageError('IMAGE_CLEANUP_PENDING', 'Upload could not be saved and provider cleanup is pending. Retry image cleanup from the product.', 502);
        }
        throw error;
      }
    },
    async replace(userId, productId, imageId, buffer, altText = null) {
      const normalized = await normalizeProductImage(buffer);
      await this.assertOwned(userId, productId);
      const previous = await db.productImage.findFirst({ where: { id: imageId, productId, status: 'ACTIVE' }, select: imageStorageSelect });
      if (!previous) throw new ProductImageError('IMAGE_NOT_FOUND', 'Product image not found', 404);
      const assetId = `kilicart/products/product-${productId}-${randomUUID()}`;
      const reservation = await db.$transaction(async tx => {
        await lockOwnedProduct(tx, userId, productId);
        const current = await tx.productImage.findFirst({ where: { id: imageId, productId, status: 'ACTIVE' } });
        if (!current) throw new ProductImageError('IMAGE_NOT_FOUND', 'Product image not found', 404);
        return tx.productImage.create({ data: { productId, url: null, provider: 'cloudinary', providerAssetId: assetId, altText, position: MAX_POSITION - imageId, status: 'UPLOAD_PENDING' }, select: imageSelect });
      }, { isolationLevel: 'ReadCommitted' });
      let asset;
      try {
        asset = await storage.upload(normalized.buffer, { productId, assetId });
        if (asset.assetId !== assetId || !asset.url?.startsWith('https://')) throw new Error('Image provider returned an invalid asset');
      } catch (error) {
        if (error instanceof ImageStorageConfigurationError) {
          await db.productImage.deleteMany({ where: { id: reservation.id, status: 'UPLOAD_PENDING' } });
          throw error;
        }
        try {
          await storage.delete(assetId);
          await db.productImage.deleteMany({ where: { id: reservation.id, status: 'UPLOAD_PENDING' } });
        } catch {
          await db.productImage.updateMany({ where: { id: reservation.id }, data: { status: 'DELETE_PENDING' } }).catch(() => {});
          throw new ProductImageError('IMAGE_CLEANUP_PENDING', 'Replacement failed and provider cleanup is pending. Retry image cleanup from the product.', 502);
        }
        throw error;
      }
      try {
        await db.$transaction(async tx => {
          const { seller, product } = await lockOwnedProduct(tx, userId, productId);
          const current = await tx.productImage.findFirst({ where: { id: imageId, productId, status: 'ACTIVE' } });
          if (!current) throw new ProductImageError('IMAGE_NOT_FOUND', 'Product image not found', 404);
          await markPublishedProductDraft(tx, userId, seller, product);
          await tx.productImage.update({ where: { id: imageId }, data: { status: 'DELETE_PENDING', position: MAX_POSITION - imageId } });
          await tx.productImage.update({ where: { id: reservation.id }, data: { url: asset.url, status: 'ACTIVE', position: current.position } });
          const rows = await tx.productImage.findMany({ where: { productId, status: 'ACTIVE' }, orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { id: true } });
          await normalizePositions(tx, productId, rows.map(row => row.id));
        }, { isolationLevel: 'ReadCommitted' });
        try { await finalizePendingDelete({ ...previous, status: 'DELETE_PENDING' }); } catch { /* Hidden pending row remains available for a safe retry. */ }
        return this.list(userId, productId);
      } catch (error) {
        try {
          await storage.delete(assetId);
          await db.productImage.deleteMany({ where: { id: reservation.id, status: 'UPLOAD_PENDING' } });
        } catch {
          await db.productImage.updateMany({ where: { id: reservation.id }, data: { status: 'DELETE_PENDING' } }).catch(() => {});
          throw new ProductImageError('IMAGE_CLEANUP_PENDING', 'Replacement could not be saved and provider cleanup is pending. Retry image cleanup from the product.', 502);
        }
        throw error;
      }
    },
    async delete(userId, productId, imageId) {
      const pending = await db.$transaction(async tx => {
        const { seller, product } = await lockOwnedProduct(tx, userId, productId, true);
        const image = await tx.productImage.findFirst({ where: { id: imageId, productId }, select: imageStorageSelect });
        if (!image) throw new ProductImageError('IMAGE_NOT_FOUND', 'Product image not found', 404);
        if (image.status === 'ACTIVE' || image.status === 'UPLOAD_PENDING') {
          if (image.status === 'ACTIVE') await markPublishedProductDraft(tx, userId, seller, product);
          await tx.productImage.update({ where: { id: image.id }, data: { status: 'DELETE_PENDING', position: MAX_POSITION - image.id } });
        }
        const active = await tx.productImage.findMany({ where: { productId, status: 'ACTIVE' }, orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { id: true } });
        await normalizePositions(tx, productId, active.map(row => row.id));
        return { ...image, status: 'DELETE_PENDING' };
      }, { isolationLevel: 'ReadCommitted' });
      try { await finalizePendingDelete(pending); }
      catch { throw new ProductImageError('IMAGE_DELETE_PENDING', 'Image is hidden and deletion will need to be retried', 502); }
      return this.list(userId, productId);
    },
    async reorder(userId, productId, imageIds) {
      if (!Array.isArray(imageIds) || imageIds.length > MAX_PRODUCT_IMAGES || imageIds.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(imageIds).size !== imageIds.length) throw new ProductImageError('IMAGE_ORDER_INVALID', 'Provide each product image id once in the requested order');
      return db.$transaction(async tx => {
        const { seller, product } = await lockOwnedProduct(tx, userId, productId);
        const rows = await tx.productImage.findMany({ where: { productId, status: 'ACTIVE' }, orderBy: [{ position: 'asc' }, { id: 'asc' }], select: { id: true } });
        if (rows.length !== imageIds.length || rows.some(row => !imageIds.includes(row.id))) throw new ProductImageError('IMAGE_ORDER_INVALID', 'The order must include all current product images');
        await markPublishedProductDraft(tx, userId, seller, product);
        await normalizePositions(tx, productId, imageIds);
        return ordered(tx, productId);
      }, { isolationLevel: 'ReadCommitted' });
    },
  };
}

export const productImageService = createProductImageService();
