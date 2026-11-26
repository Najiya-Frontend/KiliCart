import { Router } from 'express';
import { authenticateRequest } from '../middleware/authentication.middleware.js';
import { requireRoles } from '../middleware/authorization.middleware.js';
import { catalogueManagementService } from '../services/catalogue-management.service.js';
import { SellerError } from '../services/seller.service.js';

const router = Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(authenticateRequest, ...requireRoles('ADMIN', 'SUPER_ADMIN'));
const bad = res => res.status(400).json({ success: false, message: 'Invalid request' });
const text = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
const id = value => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const pagination = query => {
  if (Object.keys(query).some(key => !['page', 'pageSize'].includes(key))) return null;
  const page = query.page === undefined ? 1 : Number(query.page); const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  return Number.isSafeInteger(page) && page >= 1 && page <= 1_000_000 && Number.isSafeInteger(pageSize) && pageSize >= 1 && pageSize <= 100 ? { page, pageSize } : null;
};
const fail = (res, error) => {
  if (error instanceof SellerError) {
    const status = error.code.endsWith('_NOT_FOUND') ? 404 : ['REVIEW_ALREADY_DECIDED', 'STATUS_UNCHANGED'].includes(error.code) ? 409 : 400;
    return res.status(status).json({ success: false, message: error.message });
  }
  return res.status(500).json({ success: false, message: 'Internal server error' });
};
const pageList = (res, args, rows) => res.json({ success: true, message: 'Pending review items', data: rows.slice(0, args.pageSize), pagination: { ...args, hasMore: rows.length > args.pageSize } });
const listPending = (res, args, action) => action(args).then(rows => pageList(res, args, rows)).catch(error => fail(res, error));
const decision = body => {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['decision', 'reason'].includes(key)) || !['APPROVE', 'REJECT'].includes(body.decision)) return null;
  if (!text(body.reason, 1, 1000)) return null;
  return { decision: body.decision, reason: body.reason?.trim() };
};

router.get('/stores/pending', (req, res) => { const args = pagination(req.query); if (!args) return bad(res); return listPending(res, args, catalogueManagementService.listPendingStores); });
router.get('/stores/:id', (req, res) => {
  const storeId = id(req.params.id); if (!storeId) return bad(res);
  return catalogueManagementService.getAdminStore(storeId).then(data => data ? res.json({ success: true, message: 'Store review', data }) : res.status(404).json({ success: false, message: 'Store not found' })).catch(error => fail(res, error));
});
router.post('/stores/:id/decision', (req, res) => {
  const storeId = id(req.params.id); const input = decision(req.body); if (!storeId || !input) return bad(res);
  return catalogueManagementService.decideStore({ storeId, adminId: req.auth.userId, ...input }).then(data => res.json({ success: true, message: 'Store review decided', data })).catch(error => fail(res, error));
});
router.get('/products/pending', (req, res) => { const args = pagination(req.query); if (!args) return bad(res); return listPending(res, args, catalogueManagementService.listPendingProducts); });
router.get('/products/:id', (req, res) => {
  const productId = id(req.params.id); if (!productId) return bad(res);
  return catalogueManagementService.getAdminProduct(productId).then(data => data ? res.json({ success: true, message: 'Product review', data }) : res.status(404).json({ success: false, message: 'Product not found' })).catch(error => fail(res, error));
});
router.post('/products/:id/decision', (req, res) => {
  const productId = id(req.params.id); const input = decision(req.body); if (!productId || !input) return bad(res);
  return catalogueManagementService.decideProduct({ productId, adminId: req.auth.userId, ...input }).then(data => res.json({ success: true, message: 'Product review decided', data })).catch(error => fail(res, error));
});
router.get('/catalogue-audits', (req, res) => {
  if (Object.keys(req.query).some(key => !['page', 'pageSize', 'sellerAccountId', 'storeId', 'productId'].includes(key))) return bad(res);
  const args = pagination({ page: req.query.page, pageSize: req.query.pageSize }); if (!args) return bad(res);
  const filters = {};
  for (const key of ['sellerAccountId', 'storeId', 'productId']) {
    if (req.query[key] !== undefined) { const value = id(req.query[key]); if (!value) return bad(res); filters[key] = value; }
  }
  if (Object.keys(filters).length > 1) return bad(res);
  return catalogueManagementService.listAudit({ ...filters, ...args }).then(result => res.json({ success: true, message: 'Catalogue review audit history', data: result.items, pagination: { ...args, hasMore: result.hasMore } })).catch(error => fail(res, error));
});

export default router;
