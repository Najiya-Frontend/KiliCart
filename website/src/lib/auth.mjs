export function captureToken(location, history) {
  const url = new URL(location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const token = url.searchParams.get('token') || fragment.get('token');
  if (url.searchParams.has('token') || fragment.has('token')) {
    url.searchParams.delete('token'); fragment.delete('token');
    const hash = fragment.toString();
    history.replaceState(history.state, '', `${url.pathname}${url.search}${hash ? `#${hash}` : ''}`);
  }
  return token;
}
export function validPassword(password) {
  return password.length >= 12 && new TextEncoder().encode(password).length <= 256 && !/^\s*$/.test(password);
}
export function safeReturnTo(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  try { return new URL(value, 'https://kilicart.invalid').origin === 'https://kilicart.invalid' ? value : '/'; }
  catch { return '/'; }
}
let accessToken = null;

function authBase() {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000/api/v1');
  if (!base) throw new Error('API_NOT_CONFIGURED');
  return `${base.replace(/\/$/, '')}/auth`;
}

async function authRequest(path, body, token = null) {
  const headers = { 'Content-Type': 'application/json', 'X-KiliCart-Request': '1' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${authBase()}/${path}`, { method: 'POST', headers, body: JSON.stringify(body), credentials: 'include', cache: 'no-store', referrerPolicy: 'no-referrer' });
  const responseBody = typeof response.json === 'function' ? await response.json().catch(() => null) : null;
  return { response, body: responseBody };
}

export async function postAuth(path, body) {
  const { response } = await authRequest(path, body);
  return response.status;
}

export async function login(email, password) {
  const { response, body } = await authRequest('login', { email, password });
  if (!response.ok || typeof body?.data?.accessToken !== 'string') throw new Error(response.status === 401 ? 'Invalid email or password.' : 'We could not sign you in. Please try again.');
  accessToken = body.data.accessToken;
  return body.data;
}

export async function register(fullName, email, password) {
  const { response } = await authRequest('register', { fullName, email, password });
  if (response.status !== 202) throw new Error(response.status === 400 ? 'Check your details and try again.' : 'We could not create your account. Please try again.');
  return true;
}

export async function refreshSession() {
  const { response, body } = await authRequest('refresh', {});
  if (!response.ok || typeof body?.data?.accessToken !== 'string') { accessToken = null; return false; }
  accessToken = body.data.accessToken;
  return true;
}

export async function getAccount() {
  if (!accessToken) return null;
  let response;
  try {
    response = await fetch(`${authBase()}/me`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }, credentials: 'include', cache: 'no-store', referrerPolicy: 'no-referrer' });
  } catch { throw new Error('ACCOUNT_UNAVAILABLE'); }
  const body = await response.json().catch(() => null);
  if (response.status === 401) { accessToken = null; return null; }
  if (!response.ok || !body?.success) throw new Error('ACCOUNT_UNAVAILABLE');
  return body.data;
}

export async function logout() {
  const token = accessToken;
  try {
    if (token) await authRequest('logout', {}, token);
  } finally { accessToken = null; }
}

export function clearSession() { accessToken = null; }

const apiBase = () => {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000/api/v1');
  if (!base) throw new Error('API_NOT_CONFIGURED');
  return base.replace(/\/$/, '');
};

/** @param {string} path @param {File} file @param {string|null} altText @param {(percent:number)=>void} [onProgress] @param {string} [method] */
export async function uploadProductImage(path, file, altText, onProgress = () => {}, method = 'POST') {
  const send = () => new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${apiBase()}${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)); };
    xhr.onerror = () => reject(Object.assign(new Error('Could not reach KiliCart. Check your connection and try again.'), { status: 0 }));
    xhr.onload = () => {
      let body = null; try { body = JSON.parse(xhr.responseText); } catch { /* surfaced as generic API error below */ }
      if (xhr.status >= 200 && xhr.status < 300 && body?.success) return resolve(body);
      reject(Object.assign(new Error(body?.message || 'The image upload could not be completed.'), { status: xhr.status }));
    };
    const form = new FormData(); form.append('image', file); if (altText) form.append('altText', altText);
    xhr.send(form);
  });
  try { return await send(); }
  catch (error) {
    if (error?.status !== 401 || !await refreshSession()) throw error;
    return send();
  }
}

/** Uses the existing in-memory access token and refresh cookie; tokens are never persisted by this client. */
export async function apiRequest(path, options = {}) {
  const send = () => fetch(`${apiBase()}${path}`, {
    ...options,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...options.headers },
    credentials: 'include', cache: 'no-store', referrerPolicy: 'no-referrer',
  });
  let response = await send();
  if (response.status === 401 && await refreshSession()) response = await send();
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) throw Object.assign(new Error(body?.message || 'The request could not be completed.'), { status: response.status });
  return body;
}
