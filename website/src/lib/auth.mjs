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
export async function postAuth(path, body) {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000/api/v1');
  if (!base) throw new Error('API_NOT_CONFIGURED');
  const response = await fetch(`${base.replace(/\/$/, '')}/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', referrerPolicy: 'no-referrer' });
  return response.status;
}
