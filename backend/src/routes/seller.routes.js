import { Router } from 'express';
import { authenticateRequest } from '../middleware/authentication.middleware.js';
import { requireRoles } from '../middleware/authorization.middleware.js';
import { SellerError, sellerService } from '../services/seller.service.js';

const router = Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const fail = (res, error) => {
  if (error instanceof SellerError) {
    const status = error.code.endsWith('_NOT_FOUND') ? 404 : ['PENDING_APPLICATION', 'ALREADY_SELLER', 'APPLICATION_ALREADY_DECIDED', 'STATUS_UNCHANGED'].includes(error.code) ? 409 : error.code === 'ROLE_NOT_SEEDED' ? 500 : 403;
    return res.status(status).json({ success: false, message: error.message });
  }
  if (error.code === 'P2002') return res.status(409).json({ success: false, message: 'A conflicting resource already exists' });
  return res.status(500).json({ success: false, message: 'Internal server error' });
};
const bad = res => res.status(400).json({ success: false, message: 'Invalid request' });
const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
const allowed = (body, fields) => Object.keys(body).every(key => fields.includes(key));
const applicationKeys = ['businessName', 'businessType', 'contactPhone', 'businessAddress', 'description'];

router.post('/seller-applications', authenticateRequest, ...requireRoles('CUSTOMER'), async (req, res) => {
  const body = req.body;
  if (!isRecord(body) || !allowed(body, applicationKeys) || !text(body.businessName, 2, 191) || !text(body.businessType, 2, 100) || !text(body.contactPhone, 7, 32) || !text(body.businessAddress, 5, 500) || (body.description !== undefined && body.description !== null && !text(body.description, 1, 1000))) return bad(res);
  try {
    const data = { businessName: body.businessName.trim(), businessType: body.businessType.trim(), contactPhone: body.contactPhone.trim(), businessAddress: body.businessAddress.trim(), description: body.description?.trim() || null };
    return res.status(201).json({ success: true, message: 'Seller application submitted', data: await sellerService.submitApplication(req.auth.userId, data) });
  } catch (error) { return fail(res, error); }
});

router.get('/seller-applications/me', authenticateRequest, ...requireRoles('CUSTOMER'), async (req, res) => {
  try { return res.json({ success: true, message: 'Seller applications', data: await sellerService.listMyApplications(req.auth.userId) }); }
  catch (error) { return fail(res, error); }
});

export default router;
