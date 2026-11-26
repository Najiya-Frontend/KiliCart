import { Router } from 'express';
import multer from 'multer';
import { authenticateRequest } from '../middleware/authentication.middleware.js';
import { requireRoles } from '../middleware/authorization.middleware.js';
import { ImageStorageConfigurationError } from '../services/image-storage/provider.js';
import { MAX_IMAGE_BYTES, ProductImageError, productImageService } from '../services/product-image.service.js';

export function createSellerProductImageRouter(service = productImageService) {
const router = Router();
const receive = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 1, fieldSize: 300 } }).single('image');
const auth = [authenticateRequest, ...requireRoles('SELLER')];
const positiveId = value => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const bad = res => res.status(400).json({ success: false, message: 'Invalid request' });
const failure = (res, error) => {
  if (error instanceof ProductImageError) return res.status(error.status).json({ success: false, message: error.message });
  if (error instanceof ImageStorageConfigurationError) return res.status(503).json({ success: false, message: 'Product image storage is not configured' });
  return res.status(502).json({ success: false, message: 'Product image operation failed' });
};
const run = (res, task) => task().then(data => res.json({ success: true, message: 'Product images', data })).catch(error => failure(res, error));
function parseImage(req, res, next) {
  receive(req, res, error => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, message: 'Image must be 10 MB or smaller' });
    if (error) return res.status(400).json({ success: false, message: 'Invalid image upload' });
    if (Object.keys(req.body || {}).some(key => key !== 'altText')) return res.status(400).json({ success: false, message: 'Invalid image upload' });
    return next();
  });
}
function fileBuffer(req) { return req.file?.buffer || null; }
function altText(req) {
  const value = req.body?.altText;
  if (value !== undefined && value !== '' && (typeof value !== 'string' || value.trim().length > 255)) return undefined;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.get('/seller/products/:id/images', ...auth, (req, res) => {
  const productId = positiveId(req.params.id); if (!productId) return bad(res);
  return run(res, () => service.list(req.auth.userId, productId));
});
router.post('/seller/products/:id/images', ...auth, parseImage, (req, res) => {
  const productId = positiveId(req.params.id); const buffer = fileBuffer(req); const text = altText(req);
  if (!productId || !buffer || text === undefined) return bad(res);
  return service.upload(req.auth.userId, productId, buffer, text)
    .then(data => res.status(201).json({ success: true, message: 'Product image uploaded', data }))
    .catch(error => failure(res, error));
});
router.put('/seller/products/:id/images/:imageId', ...auth, parseImage, (req, res) => {
  const productId = positiveId(req.params.id); const imageId = positiveId(req.params.imageId); const buffer = fileBuffer(req); const text = altText(req);
  if (!productId || !imageId || !buffer || text === undefined) return bad(res);
  return run(res, () => service.replace(req.auth.userId, productId, imageId, buffer, text));
});
router.patch('/seller/products/:id/images/order', ...auth, (req, res) => {
  const productId = positiveId(req.params.id);
  if (!productId || !req.body || Object.keys(req.body).length !== 1 || !Array.isArray(req.body.imageIds)) return bad(res);
  return run(res, () => service.reorder(req.auth.userId, productId, req.body.imageIds));
});
router.delete('/seller/products/:id/images/:imageId', ...auth, (req, res) => {
  const productId = positiveId(req.params.id); const imageId = positiveId(req.params.imageId);
  if (!productId || !imageId) return bad(res);
  return run(res, () => service.delete(req.auth.userId, productId, imageId));
});

  return router;
}

const router = createSellerProductImageRouter();
export default router;
