const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = 'ApiError'; }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, accessToken?: string): Promise<{ data: T; pagination?: { page: number; pageSize: number; hasMore: boolean } }> {
  if (!BASE_URL) throw new ApiError(0, 'Set EXPO_PUBLIC_API_BASE_URL before starting the app.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers = new Headers(options.headers);
    headers.set('Accept', 'application/json');
    const isMultipart = typeof FormData !== 'undefined' && options.body instanceof FormData;
    if (options.body && !isMultipart && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    const response = await fetch(`${BASE_URL}${path}`, { ...options, headers, signal: controller.signal, cache: 'no-store' });
    let body: unknown;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) {
      const message = body && typeof body === 'object' && 'message' in body && typeof body.message === 'string' ? body.message : 'Something went wrong. Please try again.';
      throw new ApiError(response.status, message);
    }
    if (!body || typeof body !== 'object' || !('success' in body) || body.success !== true || !('data' in body)) throw new ApiError(502, 'The server returned an unexpected response.');
    return { data: body.data as T, pagination: 'pagination' in body ? body.pagination as { page: number; pageSize: number; hasMore: boolean } : undefined };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new ApiError(0, 'The request took too long. Check your connection and try again.');
    throw new ApiError(0, 'Could not reach KiliCart. Check your connection and API URL.');
  } finally { clearTimeout(timer); }
}

export function queryString(values: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '') query.set(key, String(value));
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}
