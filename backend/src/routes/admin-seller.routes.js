import { Router } from 'express';
import { authenticateRequest } from '../middleware/authentication.middleware.js';
import { requireRoles } from '../middleware/authorization.middleware.js';
import { SellerError, sellerService } from '../services/seller.service.js';

const router = Router();
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.use(authenticateRequest, ...requireRoles('ADMIN', 'SUPER_ADMIN'));
const bad = res => res.status(400).json({ success: false, message: 'Invalid request' });
const text = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
const sendError = (res, error) => {
  if (error instanceof SellerError) {
    const status = error.code.endsWith('_NOT_FOUND') ? 404 : ['APPLICATION_ALREADY_DECIDED', 'STATUS_UNCHANGED'].includes(error.code) ? 409 : 400;
    return res.status(status).json({ success: false, message: error.message });
  }
  if (error.code === 'P2002') return res.status(409).json({ success: false, message: 'A conflicting resource already exists' });
  return res.status(500).json({ success: false, message: 'Internal server error' });
};
const parseId = value => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;

router.get('/seller-applications', async (req, res) => {
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  const pageSize = req.query.pageSize === undefined ? 20 : Number(req.query.pageSize);
  const status = req.query.status;
  if (!Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || (status !== undefined && !['PENDING', 'APPROVED', 'REJECTED'].includes(status)) || Object.keys(req.query).some(key => !['page', 'pageSize', 'status'].includes(key))) return bad(res);
  try {
    const data = await sellerService.listApplications({ status, page, pageSize });
    return res.json({ success: true, message: 'Seller applications', data, pagination: { page, pageSize, hasMore: data.length === pageSize } });
  } catch (error) { return sendError(res, error); }
});

router.get('/seller-applications/:id', async (req, res) => {
  const id = parseId(req.params.id); if (!id) return bad(res);
  try {
    const data = await sellerService.getApplication(id);
    if (!data) return res.status(404).json({ success: false, message: 'Application not found' });
    return res.json({ success: true, message: 'Seller application', data });
  } catch (error) { return sendError(res, error); }
});

router.post('/seller-applications/:id/decision', async (req, res) => {
  const applicationId = parseId(req.params.id); const body = req.body;
  if (!applicationId || !body || typeof body !== 'object' || Array.isArray(body)) return bad(res);
  const keys = Object.keys(body);
  if (keys.some(key => !['decision', 'applicantMessage', 'internalRejectionReason'].includes(key)) || !['APPROVE', 'REJECT'].includes(body.decision) || !text(body.applicantMessage, 1, 1000)) return bad(res);
  if (body.decision === 'REJECT' && !text(body.internalRejectionReason, 1, 1000)) return bad(res);
  if (body.decision === 'APPROVE' && body.internalRejectionReason !== undefined) return bad(res);
  try {
    const data = await sellerService.decideApplication({ applicationId, adminId: req.auth.userId, decision: body.decision, applicantMessage: body.applicantMessage.trim(), internalRejectionReason: body.internalRejectionReason?.trim() });
    return res.json({ success: true, message: 'Seller application decided', data });
  } catch (error) { return sendError(res, error); }
});

router.post('/sellers/:userId/status', async (req, res) => {
  const userId = parseId(req.params.userId); const body = req.body;
  if (!userId || !body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['status', 'reason'].includes(key))) return bad(res);
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!['ACTIVE', 'SUSPENDED'].includes(body.status) || !text(reason, 1, 1000)) return bad(res);
  try {
    const data = await sellerService.changeSellerStatus({ userId, adminId: req.auth.userId, status: body.status, reason });
    return res.json({ success: true, message: 'Seller account status updated', data: { id: data.id, userId: data.userId, status: data.status, suspendedAt: data.suspendedAt } });
  } catch (error) { return sendError(res, error); }
});

export default router;
