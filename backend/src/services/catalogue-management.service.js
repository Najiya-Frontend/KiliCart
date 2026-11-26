import { prisma } from '../config/prisma.js';
import { SellerError } from './seller.service.js';

const storeSellerSelect = { id: true, name: true, slug: true, description: true, contactPhone: true, location: true, status: true, rejectionReason: true, createdAt: true, updatedAt: true };
const sellerProductSelect = { id: true, storeId: true, categoryId: true, name: true, slug: true, description: true, price: true, status: true, rejectionReason: true, stockQuantity: true, createdAt: true, updatedAt: true, images: { where: { status: 'ACTIVE' }, select: { id: true, url: true, altText: true, position: true }, orderBy: { position: 'asc' } }, category: { select: { id: true, name: true, slug: true, status: true } } };
const adminStoreSelect = { ...storeSellerSelect, sellerAccount: { select: { id: true, status: true, user: { select: { id: true, fullName: true, email: true } } } } };
const adminProductSelect = { ...sellerProductSelect, store: { select: { id: true, name: true, slug: true, status: true, sellerAccount: { select: { id: true, status: true, user: { select: { id: true, fullName: true, email: true } } } } } } };

export const MAX_STOCK = 4_294_967_295;
export const validPrice = value => typeof value === 'string' && /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value) && /[1-9]/.test(value);
export const validStock = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_STOCK;

function auditData({ actorUserId, targetUserId, sellerAccountId, storeId, productId, action, fromStatus, toStatus, reason }) {
  return { actorUserId, targetUserId, sellerAccountId, storeId: storeId ?? null, productId: productId ?? null, action, fromStatus: fromStatus ?? null, toStatus: toStatus ?? null, reason: reason ?? null };
}

export function createCatalogueManagementService(db = prisma) {
  async function activeSellerTx(tx, userId) {
    await tx.$queryRaw`SELECT id FROM seller_accounts WHERE userId = ${userId} FOR UPDATE`;
    const assignment = await tx.userRole.findFirst({ where: { userId, role: { code: 'SELLER' } }, select: { userId: true } });
    const seller = await tx.sellerAccount.findUnique({ where: { userId } });
    if (!assignment || !seller || seller.status !== 'ACTIVE') throw new SellerError('SELLER_INACTIVE', 'Active seller account required');
    return seller;
  }
  async function lockStore(tx, storeId) {
    await tx.$queryRaw`SELECT id FROM stores WHERE id = ${storeId} FOR UPDATE`;
    return tx.store.findUnique({ where: { id: storeId }, include: { sellerAccount: true } });
  }
  async function lockProduct(tx, productId) {
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
    return tx.product.findUnique({ where: { id: productId }, include: { store: { include: { sellerAccount: true } } } });
  }

  return {
    async createStore(userId, input) {
      return db.$transaction(async tx => {
        const seller = await activeSellerTx(tx, userId);
        const store = await tx.store.create({ data: { sellerAccountId: seller.id, ...input }, select: storeSellerSelect });
        await tx.catalogueReviewAudit.create({ data: auditData({ actorUserId: userId, targetUserId: userId, sellerAccountId: seller.id, storeId: store.id, action: 'STORE_CREATED', toStatus: 'DRAFT' }) });
        return store;
      }, { isolationLevel: 'ReadCommitted' });
    },
    async getMyStore(userId) {
      const seller = await this.requireSeller(userId);
      return db.store.findUnique({ where: { sellerAccountId: seller.id }, select: storeSellerSelect });
    },
    async requireSeller(userId) {
      const assignment = await db.userRole.findFirst({ where: { userId, role: { code: 'SELLER' } }, select: { userId: true } });
      if (!assignment) throw new SellerError('SELLER_ROLE_REQUIRED', 'Seller role required');
      const seller = await db.sellerAccount.findUnique({ where: { userId } });
      if (!seller || seller.status !== 'ACTIVE') throw new SellerError('SELLER_INACTIVE', 'Active seller account required');
      return seller;
    },
    async updateStore(userId, input) {
      return db.$transaction(async tx => {
        const seller = await activeSellerTx(tx, userId);
        const current = await tx.store.findUnique({ where: { sellerAccountId: seller.id } });
        if (!current) throw new SellerError('STORE_NOT_FOUND', 'Store not found');
        await tx.$queryRaw`SELECT id FROM stores WHERE id = ${current.id} FOR UPDATE`;
        const fresh = await tx.store.findUnique({ where: { id: current.id } });
        if (fresh.status === 'PENDING_REVIEW') throw new SellerError('STORE_PENDING_REVIEW', 'Store cannot be edited while under review');
        const nextStatus = fresh.status === 'ACTIVE' ? 'DRAFT' : fresh.status;
        const updated = await tx.store.update({ where: { id: fresh.id }, data: { ...input, status: nextStatus, rejectionReason: fresh.status === 'ACTIVE' ? null : fresh.rejectionReason }, select: storeSellerSelect });
        if (nextStatus !== fresh.status) await tx.catalogueReviewAudit.create({ data: auditData({ actorUserId: userId, targetUserId: userId, sellerAccountId: seller.id, storeId: fresh.id, action: 'STORE_EDITED', fromStatus: fresh.status, toStatus: nextStatus }) });
        return updated;
      }, { isolationLevel: 'ReadCommitted' });
    },
    async submitStore(userId) {
      return db.$transaction(async tx => {
        const seller = await activeSellerTx(tx, userId);
        const current = await tx.store.findUnique({ where: { sellerAccountId: seller.id } });
        if (!current) throw new SellerError('STORE_NOT_FOUND', 'Store not found');
        await tx.$queryRaw`SELECT id FROM stores WHERE id = ${current.id} FOR UPDATE`;
        const fresh = await tx.store.findUnique({ where: { id: current.id } });
        if (!['DRAFT', 'REJECTED'].includes(fresh.status)) throw new SellerError('STORE_NOT_SUBMITTABLE', 'Only draft or rejected stores can be submitted');
        const updated = await tx.store.update({ where: { id: fresh.id }, data: { status: 'PENDING_REVIEW', rejectionReason: null }, select: storeSellerSelect });
        await tx.catalogueReviewAudit.create({ data: auditData({ actorUserId: userId, targetUserId: userId, sellerAccountId: seller.id, storeId: fresh.id, action: 'STORE_SUBMITTED', fromStatus: fresh.status, toStatus: 'PENDING_REVIEW' }) });
        return updated;
      }, { isolationLevel: 'ReadCommitted' });
    },
    async createProduct(userId, input) {
      return db.$transaction(async tx => {
        const seller = await activeSellerTx(tx, userId);
        const store = await tx.store.findUnique({ where: { sellerAccountId: seller.id } });
        if (!store) throw new SellerError('STORE_NOT_FOUND', 'Store not found');
        const category = await tx.category.findFirst({ where: { id: input.categoryId, status: 'ACTIVE' }, select: { id: true } });
        if (!category) throw new SellerError('CATEGORY_UNAVAILABLE', 'An active category is required');
        const product = await tx.product.create({ data: { ...input, storeId: store.id }, select: sellerProductSelect });
        await tx.catalogueReviewAudit.create({ data: auditData({ actorUserId: userId, targetUserId: userId, sellerAccountId: seller.id, storeId: store.id, productId: product.id, action: 'PRODUCT_CREATED', toStatus: 'DRAFT' }) });
        return product;
      }, { isolationLevel: 'ReadCommitted' });
    },
    async listMyProducts(userId, { page, pageSize }) {
      const seller = await this.requireSeller(userId);
      const store = await db.store.findUnique({ where: { sellerAccountId: seller.id }, select: { id: true } });
      if (!store) throw new SellerError('STORE_NOT_FOUND', 'Store not found');
      const rows = await db.product.findMany({ where: { storeId: store.id }, skip: (page - 1) * pageSize, take: pageSize + 1, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: sellerProductSelect });
      return { items: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
    },
    async getMyProduct(userId, productId) {
      const seller = await this.requireSeller(userId);
      const store = await db.store.findUnique({ where: { sellerAccountId: seller.id }, select: { id: true } });
      if (!store) throw new SellerError('STORE_NOT_FOUND', 'Store not found');
      const product = await db.product.findFirst({ where: { id: productId, storeId: store.id }, select: sellerProductSelect });
      if (!product) throw new SellerError('PRODUCT_NOT_FOUND', 'Product not found');
      return product;
    },
    async updateProduct(userId, productId, input) {
      return db.$transaction(async tx => {
        const seller = await activeSellerTx(tx, userId);
        const store = await tx.store.findUnique({ where: { sellerAccountId: seller.id } });
        if (!store) throw new SellerError('STORE_NOT_FOUND', 'Store not found');
        await tx.$queryRaw`SELECT id FROM stores WHERE id = ${store.id} FOR UPDATE`;
        const freshStore = await tx.store.findUnique({ where: { id: store.id } });
        if (freshStore.status === 'PENDING_REVIEW') throw new SellerError('STORE_PENDING_REVIEW', 'Store cannot be modified while under review');
        const product = await tx.product.findFirst({ where: { id: productId, storeId: store.id }, select: { id: true } });
        if (!product) throw new SellerError('PRODUCT_NOT_FOUND', 'Product not found');
        await tx.$queryRaw`SELECT id FROM products WHERE id = ${product.id} FOR UPDATE`;
        const current = await tx.product.findUnique({ where: { id: product.id } });
        if (current.status === 'PENDING_REVIEW') throw new SellerError('PRODUCT_PENDING_REVIEW', 'Product cannot be edited while under review');
        if (input.categoryId !== undefined && !await tx.category.findFirst({ where: { id: input.categoryId, status: 'ACTIVE' }, select: { id: true } })) throw new SellerError('CATEGORY_UNAVAILABLE', 'An active category is required');
        const affectsPublicContent = Object.keys(input).some(key => key !== 'stockQuantity');
        const nextStatus = affectsPublicContent && current.status === 'PUBLISHED' ? 'DRAFT' : current.status;
        const updated = await tx.product.update({ where: { id: current.id }, data: { ...input, ...(nextStatus !== current.status ? { status: nextStatus, rejectionReason: null } : {}) }, select: sellerProductSelect });
        if (nextStatus !== current.status) await tx.catalogueReviewAudit.create({ data: auditData({ actorUserId: userId, targetUserId: userId, sellerAccountId: seller.id, storeId: store.id, productId: current.id, action: 'PRODUCT_EDITED', fromStatus: current.status, toStatus: nextStatus }) });
        return updated;
      }, { isolationLevel: 'ReadCommitted' });
    },
    async submitProduct(userId, productId) {
      return db.$transaction(async tx => {
        const seller = await activeSellerTx(tx, userId);
        const store = await tx.store.findUnique({ where: { sellerAccountId: seller.id } });
        if (!store) throw new SellerError('STORE_NOT_FOUND', 'Store not found');
        await tx.$queryRaw`SELECT id FROM stores WHERE id = ${store.id} FOR UPDATE`;
        const freshStore = await tx.store.findUnique({ where: { id: store.id } });
        if (freshStore.status !== 'ACTIVE') throw new SellerError('STORE_NOT_ACTIVE', 'An approved active store is required');
        const product = await tx.product.findFirst({ where: { id: productId, storeId: store.id }, select: { id: true, status: true, category: { select: { status: true } } } });
        if (!product) throw new SellerError('PRODUCT_NOT_FOUND', 'Product not found');
        await tx.$queryRaw`SELECT id FROM products WHERE id = ${product.id} FOR UPDATE`;
        if (!['DRAFT', 'REJECTED'].includes(product.status)) throw new SellerError('PRODUCT_NOT_SUBMITTABLE', 'Only draft or rejected products can be submitted');
        if (product.category.status !== 'ACTIVE') throw new SellerError('CATEGORY_UNAVAILABLE', 'An active category is required');
        const updated = await tx.product.update({ where: { id: product.id }, data: { status: 'PENDING_REVIEW', rejectionReason: null }, select: sellerProductSelect });
        await tx.catalogueReviewAudit.create({ data: auditData({ actorUserId: userId, targetUserId: userId, sellerAccountId: seller.id, storeId: store.id, productId: product.id, action: 'PRODUCT_SUBMITTED', fromStatus: product.status, toStatus: 'PENDING_REVIEW' }) });
        return updated;
      }, { isolationLevel: 'ReadCommitted' });
    },
    async archiveProduct(userId, productId) {
      return db.$transaction(async tx => {
        const seller = await activeSellerTx(tx, userId);
        const store = await tx.store.findUnique({ where: { sellerAccountId: seller.id } });
        if (!store) throw new SellerError('STORE_NOT_FOUND', 'Store not found');
        await tx.$queryRaw`SELECT id FROM stores WHERE id = ${store.id} FOR UPDATE`;
        const product = await tx.product.findFirst({ where: { id: productId, storeId: store.id }, select: { id: true } });
        if (!product) throw new SellerError('PRODUCT_NOT_FOUND', 'Product not found');
        await tx.$queryRaw`SELECT id FROM products WHERE id = ${product.id} FOR UPDATE`;
        const current = await tx.product.findUnique({ where: { id: product.id } });
        if (current.status === 'PENDING_REVIEW') throw new SellerError('PRODUCT_PENDING_REVIEW', 'Product cannot be archived while under review');
        if (current.status === 'ARCHIVED') throw new SellerError('STATUS_UNCHANGED', 'Product is already archived');
        const updated = await tx.product.update({ where: { id: current.id }, data: { status: 'ARCHIVED', rejectionReason: null }, select: sellerProductSelect });
        await tx.catalogueReviewAudit.create({ data: auditData({ actorUserId: userId, targetUserId: userId, sellerAccountId: seller.id, storeId: store.id, productId: product.id, action: 'PRODUCT_ARCHIVED', fromStatus: current.status, toStatus: 'ARCHIVED' }) });
        return updated;
      }, { isolationLevel: 'ReadCommitted' });
    },
    async listPendingStores({ page, pageSize }) {
      return db.store.findMany({ where: { status: 'PENDING_REVIEW' }, skip: (page - 1) * pageSize, take: pageSize + 1, orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }], select: adminStoreSelect });
    },
    async getAdminStore(storeId) { return db.store.findUnique({ where: { id: storeId }, select: adminStoreSelect }); },
    async decideStore({ storeId, adminId, decision, reason }) {
      return db.$transaction(async tx => {
        const initial = await tx.store.findUnique({ where: { id: storeId }, select: { id: true, sellerAccountId: true } });
        if (!initial) throw new SellerError('STORE_NOT_FOUND', 'Store not found');
        await tx.$queryRaw`SELECT id FROM seller_accounts WHERE id = ${initial.sellerAccountId} FOR UPDATE`;
        const seller = await tx.sellerAccount.findUnique({ where: { id: initial.sellerAccountId }, include: { user: { select: { id: true } } } });
        await tx.$queryRaw`SELECT id FROM stores WHERE id = ${storeId} FOR UPDATE`;
        const store = await tx.store.findUnique({ where: { id: storeId } });
        if (store.status !== 'PENDING_REVIEW') throw new SellerError('REVIEW_ALREADY_DECIDED', 'Only pending stores can be decided');
        if (decision === 'APPROVE' && seller.status !== 'ACTIVE') throw new SellerError('SELLER_INACTIVE', 'Reactivate the seller before approval');
        const status = decision === 'APPROVE' ? 'ACTIVE' : 'REJECTED';
        const updated = await tx.store.update({ where: { id: storeId }, data: { status, rejectionReason: decision === 'REJECT' ? reason : null }, select: storeSellerSelect });
        await tx.catalogueReviewAudit.create({ data: auditData({ actorUserId: adminId, targetUserId: seller.user.id, sellerAccountId: seller.id, storeId, action: decision === 'APPROVE' ? 'STORE_APPROVED' : 'STORE_REJECTED', fromStatus: store.status, toStatus: status, reason }) });
        return updated;
      }, { isolationLevel: 'ReadCommitted' });
    },
    async listPendingProducts({ page, pageSize }) {
      return db.product.findMany({ where: { status: 'PENDING_REVIEW' }, skip: (page - 1) * pageSize, take: pageSize + 1, orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }], select: adminProductSelect });
    },
    async getAdminProduct(productId) { return db.product.findUnique({ where: { id: productId }, select: adminProductSelect }); },
    async decideProduct({ productId, adminId, decision, reason }) {
      return db.$transaction(async tx => {
        const initial = await tx.product.findUnique({ where: { id: productId }, select: { id: true, store: { select: { id: true, sellerAccountId: true } } } });
        if (!initial) throw new SellerError('PRODUCT_NOT_FOUND', 'Product not found');
        await tx.$queryRaw`SELECT id FROM seller_accounts WHERE id = ${initial.store.sellerAccountId} FOR UPDATE`;
        const seller = await tx.sellerAccount.findUnique({ where: { id: initial.store.sellerAccountId }, include: { user: { select: { id: true } } } });
        await tx.$queryRaw`SELECT id FROM stores WHERE id = ${initial.store.id} FOR UPDATE`;
        const store = await tx.store.findUnique({ where: { id: initial.store.id } });
        await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
        const product = await tx.product.findUnique({ where: { id: productId }, include: { category: { select: { status: true } } } });
        if (product.status !== 'PENDING_REVIEW') throw new SellerError('REVIEW_ALREADY_DECIDED', 'Only pending products can be decided');
        if (decision === 'APPROVE' && seller.status !== 'ACTIVE') throw new SellerError('SELLER_INACTIVE', 'Reactivate the seller before approval');
        if (decision === 'APPROVE' && store.status !== 'ACTIVE') throw new SellerError('STORE_NOT_ACTIVE', 'Approve the store before the product');
        if (decision === 'APPROVE' && product.category.status !== 'ACTIVE') throw new SellerError('CATEGORY_UNAVAILABLE', 'Product category is inactive');
        const status = decision === 'APPROVE' ? 'PUBLISHED' : 'REJECTED';
        const updated = await tx.product.update({ where: { id: productId }, data: { status, rejectionReason: decision === 'REJECT' ? reason : null }, select: sellerProductSelect });
        await tx.catalogueReviewAudit.create({ data: auditData({ actorUserId: adminId, targetUserId: seller.user.id, sellerAccountId: seller.id, storeId: store.id, productId, action: decision === 'APPROVE' ? 'PRODUCT_APPROVED' : 'PRODUCT_REJECTED', fromStatus: product.status, toStatus: status, reason }) });
        return updated;
      }, { isolationLevel: 'ReadCommitted' });
    },
    async listAudit({ sellerAccountId, storeId, productId, page, pageSize }) {
      const rows = await db.catalogueReviewAudit.findMany({ where: { ...(sellerAccountId ? { sellerAccountId } : {}), ...(storeId ? { storeId } : {}), ...(productId ? { productId } : {}) }, skip: (page - 1) * pageSize, take: pageSize + 1, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { actor: { select: { id: true, fullName: true, email: true } }, target: { select: { id: true, fullName: true, email: true } } } });
      return { items: rows.slice(0, pageSize), hasMore: rows.length > pageSize };
    },
  };
}

export const catalogueManagementService = createCatalogueManagementService();
