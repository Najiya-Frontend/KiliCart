import { authenticate } from '../services/auth.service.js';
export async function authenticateRequest(req, res, next) {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.get('authorization') || '');
  const identity = match && await authenticate(match[1]);
  if (!identity) return res.status(401).json({ success: false, message: 'Authentication required' });
  req.auth = identity;
  next();
}
