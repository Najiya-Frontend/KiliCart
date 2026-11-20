import { Router } from 'express';
import { createAuthRateLimiter } from '../middleware/auth-rate-limit.js';
import { env } from '../config/env.js';
import { authenticateRequest } from '../middleware/authentication.middleware.js';
import { register, login, refresh, logout, requestAction, completeAction, normalizeEmail, validEmail, validPassword } from '../services/auth.service.js';

const router = Router();
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const limiter = createAuthRateLimiter();
const registrationLimiter = limiter.middleware('register');
const loginLimiter = limiter.middleware('login');
const refreshLimiter = limiter.middleware('refresh');
const recoveryConfirmLimiter = limiter.middleware('confirm');
const bad = res => res.status(400).json({ success: false, message: 'Invalid request' });
const denied = res => res.status(401).json({ success: false, message: 'Invalid credentials' });
const ok = (res, message, data) => res.json({ success: true, message, ...(data ? { data } : {}) });
const cookieName = 'kilicart_refresh';
const cookieOptions = { httpOnly: true, secure: env.nodeEnv === 'production', sameSite: 'strict', path: '/api/v1/auth', maxAge: 2592000000 };
function readCookie(req) {
  const cookies = (req.get('cookie') || '').split(';').map(x => x.trim()).filter(x => x.startsWith(`${cookieName}=`));
  return cookies.length === 1 ? cookies[0].slice(cookieName.length + 1) : '';
}
function webOrigin(req) { return env.corsOrigin.split(',').map(x => x.trim()).includes(req.get('origin')) && req.get('x-kilicart-request') === '1'; }
function respondTokens(req, res, tokens) {
  if (req.body.transport === 'mobile') return ok(res, 'Authenticated', tokens);
  if (!webOrigin(req)) return res.status(403).json({ success: false, message: 'Origin rejected' });
  res.cookie(cookieName, tokens.refreshToken, cookieOptions);
  return ok(res, 'Authenticated', { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn });
}
router.post('/register', registrationLimiter, async (req, res) => {
  const { fullName, password } = req.body || {}; const email = normalizeEmail(req.body?.email);
  if (typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.trim().length > 191 || !validEmail(email) || !validPassword(password) || Object.hasOwn(req.body, 'role') || Object.hasOwn(req.body, 'roles')) return bad(res);
  await register({ fullName: fullName.trim(), email, password });
  return res.status(202).json({ success: true, message: 'If eligible, registration has been received' });
});
router.post('/login', loginLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email); const password = req.body?.password;
  if (!validEmail(email) || typeof password !== 'string' || Buffer.byteLength(password) > 256) return bad(res);
  if (req.body?.transport !== 'mobile' && !webOrigin(req)) return res.status(403).json({ success: false, message: 'Origin rejected' });
  const result = await login(email, password); if (!result) return denied(res);
  return respondTokens(req, res, result);
});
router.post('/refresh', refreshLimiter, async (req, res) => {
  const mobile = req.body?.transport === 'mobile';
  if (!mobile && !webOrigin(req)) return res.status(403).json({ success: false, message: 'Origin rejected' });
  const result = await refresh(mobile ? req.body?.refreshToken : readCookie(req));
  if (!result) return denied(res);
  return respondTokens(req, res, result);
});
router.post('/logout', authenticateRequest, async (req, res) => {
  await logout(req.auth.sessionId); res.clearCookie(cookieName, cookieOptions); return ok(res, 'Logged out');
});
router.get('/me', authenticateRequest, (req, res) => ok(res, 'Account', { ...req.auth.user, roles: req.auth.roles }));
for (const [path, purpose] of [['verify-email', 'VERIFY'], ['password-reset', 'RESET']]) {
  router.post(`/${path}/request`, limiter.middleware(purpose === 'VERIFY' ? 'verify' : 'reset'), async (req, res) => {
    const email = normalizeEmail(req.body?.email); if (!validEmail(email)) return bad(res);
    await requestAction(email, purpose); return ok(res, 'If eligible, the request has been received');
  });
  router.post(`/${path}/confirm`, recoveryConfirmLimiter, async (req, res) => {
    if (typeof req.body?.token !== 'string' || (purpose === 'RESET' && !validPassword(req.body?.password))) return bad(res);
    if (!await completeAction(req.body.token, purpose, req.body?.password)) return bad(res);
    return ok(res, 'Request completed');
  });
}
export default router;
