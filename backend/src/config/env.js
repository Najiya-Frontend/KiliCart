import "dotenv/config";
import { isIP } from "node:net";

export function parseTrustedProxies(value = '') {
  if (!value.trim()) return [];
  return value.split(',').map(entry => {
    const item = entry.trim();
    const parts = item.split('/');
    const family = isIP(parts[0]);
    const bits = family === 4 ? 32 : 128;
    if (!family || parts.length > 2 || (parts.length === 2 && (!/^\d+$/.test(parts[1]) || Number(parts[1]) < 1 || Number(parts[1]) > bits))) throw new Error('Invalid TRUSTED_PROXY_CIDRS');
    return item;
  });
}

export function parseCorsOrigins(value, production = false) {
  if (!value) {
    if (production) throw new Error('CORS_ORIGIN is required in production');
    value = 'http://localhost:3000';
  }
  return value.split(',').map(entry => {
    const origin = entry.trim();
    let url;
    try { url = new URL(origin); } catch { throw new Error('Invalid CORS_ORIGIN'); }
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol) || (production && url.protocol !== 'https:')) throw new Error('Invalid CORS_ORIGIN');
    return origin;
  });
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  corsOrigin: parseCorsOrigins(process.env.CORS_ORIGIN, process.env.NODE_ENV === 'production').join(','),
  trustedProxies: parseTrustedProxies(process.env.TRUSTED_PROXY_CIDRS),
};
