import { Router } from 'express';
import { authenticateRequest } from '../middleware/authentication.middleware.js';
import { requireRoles } from '../middleware/authorization.middleware.js';
import { catalogueManagementService, validPrice, validStock } from '../services/catalogue-management.service.js';
import { SellerError } from '../services/seller.service.js';

const router = Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const sellerAuth = [authenticateRequest, ...requireRoles('SELLER')];
const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
const slug = value => typeof value === 'string' && value.length <= 191 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const bad = res => res.status(400).json({ success: false, message: 'Invalid request' });
const id = value => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const pagination = query => {
  if (Object.keys(query).some(key => !['page', 'pageSize'].includes(key))) return null;
  const page = query.page === undefined ? 1 : Number(query.page); const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  return Number.isSafeInteger(page) && page >= 1 && page <= 1_000_000 && Number.isSafeInteger(pageSize) && pageSize >= 1 && pageSize <= 100 ? { page, pageSize } : null;
};
const fail = (res, error) => {
  if (error instanceof SellerError) {
    const status = error.code.endsWith('_NOT_FOUND') ? 404 : ['STORE_PENDING_REVIEW', 'PRODUCT_PENDING_REVIEW', 'STORE_NOT_SUBMITTABLE', 'PRODUCT_NOT_SUBMITTABLE', 'STATUS_UNCHANGED'].includes(error.code) ? 409 : error.code === 'CATEGORY_UNAVAILABLE' ? 400 : 403;
    return res.status(status).json({ success: false, message: error.message });
  }
  if (error.code === 'P2002') return res.status(409).json({ success: false, message: 'A conflicting resource already exists' });
  return res.status(500).json({ success: false, message: 'Internal server error' });
};
const run = (res, action) => action().then(data => res.json({ success: true, message: 'Catalogue management result', data })).catch(error => fail(res, error));

const storeKeys = ['name', 'slug', 'description', 'contactPhone', 'location'];
function storeBody(body, partial = false) {
  if (!isRecord(body) || Object.keys(body).some(key => !storeKeys.includes(key)) || (partial && Object.keys(body).length === 0)) return null;
  if (!partial && (!text(body.name, 2, 191) || !slug(body.slug))) return null;
  if (body.name !== undefined && !text(body.name, 2, 191)) return null;
  if (body.slug !== undefined && !slug(body.slug)) return null;
  if (body.description !== undefined && body.description !== null && !text(body.description, 1, 1000)) return null;
  if (body.contactPhone !== undefined && body.contactPhone !== null && (typeof body.contactPhone !== 'string' || body.contactPhone.trim().length > 32 || !/^\+?[0-9 ()-]+$/.test(body.contactPhone.trim()) || (body.contactPhone.match(/\d/g) || []).length < 7)) return null;
  if (body.location !== undefined && body.location !== null && !text(body.location, 2, 500)) return null;
  return Object.fromEntries(Object.entries(body).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));
}
const productKeys = ['name', 'slug', 'description', 'categoryId', 'price', 'stockQuantity'];
function productBody(body, partial = false) {
  if (!isRecord(body) || Object.keys(body).some(key => !productKeys.includes(key)) || (partial && Object.keys(body).length === 0)) return null;
  if (!partial && (!text(body.name, 2, 191) || !slug(body.slug) || !Number.isSafeInteger(body.categoryId) || body.categoryId < 1 || !validPrice(body.price))) return null;
  if (body.name !== undefined && !text(body.name, 2, 191)) return null;
  if (body.slug !== undefined && !slug(body.slug)) return null;
  if (body.description !== undefined && body.description !== null && !text(body.description, 1, 10000)) return null;
  if (body.categoryId !== undefined && (!Number.isSafeInteger(body.categoryId) || body.categoryId < 1)) return null;
  if (body.price !== undefined && !validPrice(body.price)) return null;
  if (body.stockQuantity !== undefined && !validStock(body.stockQuantity)) return null;
  return Object.fromEntries(Object.entries(body).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));
}

router.post('/seller/stores', ...sellerAuth, (req, res) => {
  const data = storeBody(req.body);
  if (!data) return bad(res);
  return catalogueManagementService.createStore(req.auth.userId, data)
    .then(result => res.status(201).json({ success: true, message: 'Store created', data: result }))
    .catch(error => fail(res, error));
});
router.get('/seller/stores/me', ...sellerAuth, (req, res) => run(res, () => catalogueManagementService.getMyStore(req.auth.userId)));
router.patch('/seller/stores/me', ...sellerAuth, async (req, res) => {
  const data = storeBody(req.body, true);
  if (!data) return bad(res);
  return run(res, () => catalogueManagementService.updateStore(req.auth.userId, data));
});
router.post('/seller/stores/me/submit', ...sellerAuth, (req, res) => run(res, () => catalogueManagementService.submitStore(req.auth.userId)));

router.get('/seller/products', ...sellerAuth, (req, res) => {
  const args = pagination(req.query); if (!args) return bad(res);
  return catalogueManagementService.listMyProducts(req.auth.userId, args).then(result => res.json({ success: true, message: 'Seller products', data: result.items, pagination: { ...args, hasMore: result.hasMore } })).catch(error => fail(res, error));
});
router.post('/seller/products', ...sellerAuth, (req, res) => {
  const data = productBody(req.body);
  if (!data) return bad(res);
  return catalogueManagementService.createProduct(req.auth.userId, { ...data, description: data.description ?? null, stockQuantity: data.stockQuantity ?? 0 })
    .then(result => res.status(201).json({ success: true, message: 'Product created', data: result }))
    .catch(error => fail(res, error));
});
router.get('/seller/products/:id', ...sellerAuth, (req, res) => {
  const productId = id(req.params.id); if (!productId) return bad(res);
  return run(res, () => catalogueManagementService.getMyProduct(req.auth.userId, productId));
});
router.patch('/seller/products/:id', ...sellerAuth, async (req, res) => {
  const productId = id(req.params.id); const data = productBody(req.body, true);
  if (!productId || !data) return bad(res);
  return run(res, () => catalogueManagementService.updateProduct(req.auth.userId, productId, data));
});
router.post('/seller/products/:id/submit', ...sellerAuth, (req, res) => {
  const productId = id(req.params.id); if (!productId) return bad(res);
  return run(res, () => catalogueManagementService.submitProduct(req.auth.userId, productId));
});
router.post('/seller/products/:id/archive', ...sellerAuth, (req, res) => {
  const productId = id(req.params.id); if (!productId) return bad(res);
  return run(res, () => catalogueManagementService.archiveProduct(req.auth.userId, productId));
});

export default router;
