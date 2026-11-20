import { ROLE_CODES } from '../config/roles.js';
// Only trusted authentication middleware may populate req.auth.
export function requireAuthentication(req, res, next) {
  if (!req.auth || !Number.isInteger(req.auth.userId) || req.auth.userId <= 0 || !Array.isArray(req.auth.roles)) return res.status(401).json({ success: false, message: 'Authentication required' });
  next();
}
export function requireRoles(...permittedRoles) {
  if (!permittedRoles.length || permittedRoles.some((role) => !ROLE_CODES.includes(role))) throw new Error('Valid permitted roles are required');
  return [requireAuthentication, (req, res, next) => {
    if (!permittedRoles.some((role) => req.auth.roles.includes(role))) return res.status(403).json({ success: false, message: 'Forbidden' });
    next();
  }];
}
