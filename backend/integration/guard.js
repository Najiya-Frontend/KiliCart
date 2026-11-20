import 'dotenv/config';

export function testDatabaseUrl() {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) throw new Error('TEST_DATABASE_URL is required');
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid TEST_DATABASE_URL'); }
  if (url.protocol !== 'mysql:' || decodeURIComponent(url.pathname) !== '/kilicart_test' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase()) || !url.username || url.hash) throw new Error('TEST_DATABASE_URL must point to local MySQL database kilicart_test');
  return value;
}
