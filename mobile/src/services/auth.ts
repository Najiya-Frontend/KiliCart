import * as SecureStore from 'expo-secure-store';
import { ApiError, apiRequest } from './api';

const REFRESH_KEY = 'kilicart.refresh-token';
let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;

type TokenResponse = { accessToken: string; refreshToken: string; expiresIn?: number };
export type Account = { id: number; email: string; fullName: string; roles: string[] };

async function authPost<T>(path: string, body: object, token?: string) {
  return apiRequest<T>(`/auth/${path}`, { method: 'POST', body: JSON.stringify(body) }, token);
}

async function saveTokenResponse(data: TokenResponse) {
  if (typeof data.accessToken !== 'string' || typeof data.refreshToken !== 'string') throw new ApiError(502, 'The sign-in response was incomplete.');
  accessToken = data.accessToken;
  await SecureStore.setItemAsync(REFRESH_KEY, data.refreshToken);
}

export function getAccessToken() { return accessToken; }
export function clearAccessToken() { accessToken = null; }

export async function login(email: string, password: string) {
  const { data } = await authPost<TokenResponse>('login', { email: email.trim(), password, transport: 'mobile' });
  await saveTokenResponse(data);
}

export async function register(fullName: string, email: string, password: string) {
  await authPost<unknown>('register', { fullName: fullName.trim(), email: email.trim(), password });
  await requestEmailVerification(email);
}

export async function requestEmailVerification(email: string) {
  await authPost<unknown>('verify-email/request', { email: email.trim() });
}

export async function confirmEmail(token: string) {
  await authPost<unknown>('verify-email/confirm', { token });
}

export async function requestPasswordReset(email: string) {
  await authPost<unknown>('password-reset/request', { email: email.trim() });
}

export async function resetPassword(token: string, password: string) {
  await authPost<unknown>('password-reset/confirm', { token, password });
}

export async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
    if (!refreshToken) { accessToken = null; return false; }
    try {
      const { data } = await authPost<TokenResponse>('refresh', { transport: 'mobile', refreshToken });
      await saveTokenResponse(data);
      return true;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 400)) await SecureStore.deleteItemAsync(REFRESH_KEY);
      accessToken = null;
      return false;
    } finally { refreshInFlight = null; }
  })();
  return refreshInFlight;
}

export async function getAccount() {
  if (!accessToken) return null;
  try { return (await apiRequest<Account>('/auth/me', {}, accessToken)).data; }
  catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || !await refreshSession()) throw error;
    return (await apiRequest<Account>('/auth/me', {}, accessToken || undefined)).data;
  }
}

export async function logout() {
  const token = accessToken;
  try { if (token) await authPost<unknown>('logout', {}, token); }
  finally { accessToken = null; await SecureStore.deleteItemAsync(REFRESH_KEY); }
}
