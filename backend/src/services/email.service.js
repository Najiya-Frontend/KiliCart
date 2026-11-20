import nodemailer from 'nodemailer';

const requiredKeys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM', 'APP_PUBLIC_URL'];
export function validateEmailConfiguration(config = process.env) {
  const production = config.NODE_ENV === 'production';
  const complete = requiredKeys.every(key => typeof config[key] === 'string' && config[key].trim());
  if (!complete) {
    if (production) throw new Error('Production email configuration is incomplete');
    return false;
  }
  const host = config.SMTP_HOST.toLowerCase().replace(/\.$/, '');
  if (!/^[a-z0-9.-]+$/.test(host) || host.startsWith('.') || host.endsWith('.') || host.includes('..')) throw new Error('Invalid SMTP configuration');
  if (production && (host === 'sandbox.smtp.mailtrap.io' || host.endsWith('.sandbox.smtp.mailtrap.io'))) throw new Error('Sandbox SMTP is not allowed in production');
  if (production && requiredKeys.some(key => /^(your[_ -]|placeholder|change.?me)/i.test(config[key]))) throw new Error('Invalid production email configuration');
  const port = Number(config.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !['true', 'false'].includes(config.SMTP_SECURE)) throw new Error('Invalid SMTP configuration');
  let base;
  try { base = new URL(config.APP_PUBLIC_URL); } catch { throw new Error('Invalid APP_PUBLIC_URL'); }
  if (base.username || base.password || base.search || base.hash || (base.protocol !== 'https:' && !(!production && base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)))) throw new Error('Invalid APP_PUBLIC_URL');
  if (!config.EMAIL_FROM || /[\r\n]/.test(config.EMAIL_FROM)) throw new Error('Invalid EMAIL_FROM');
  return true;
}

// A caller may inject a transport for tests; configuration never selects a fake
// transport in production or writes message bodies to logs.
export function createEmailService({ transport, from, publicUrl } = {}) {
  if (!transport) {
    const { SMTP_HOST: host, SMTP_PORT: port, SMTP_SECURE: secure, SMTP_USER: user, SMTP_PASSWORD: pass, EMAIL_FROM: configuredFrom, APP_PUBLIC_URL: configuredUrl } = process.env;
    if (!validateEmailConfiguration()) return null;
    transport = nodemailer.createTransport({ host, port: Number(port), secure: secure === 'true', requireTLS: secure === 'false', tls: { rejectUnauthorized: true }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000, auth: { user, pass } });
    from = configuredFrom; publicUrl = configuredUrl;
  }
  const base = new URL(publicUrl);
  if (base.username || base.password || base.search || base.hash || (base.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)))) throw new Error('Invalid APP_PUBLIC_URL');
  if (!from || /[\r\n]/.test(from)) throw new Error('Invalid EMAIL_FROM');
  return {
    verify: () => transport.verify(),
    sendDiagnostic: to => transport.sendMail({ from, to, subject: 'KiliCart development SMTP test', text: 'This is a development sandbox test message. It contains no account information.' }),
    async sendAction({ to, purpose, token, messageId }) {
      const url = new URL(purpose === 'VERIFY' ? '/verify-email' : '/reset-password', base);
      // Fragment is not sent to the web server in HTTP requests or referrers.
      url.hash = new URLSearchParams({ token }).toString();
      await transport.sendMail({ from, to, ...(messageId ? { messageId: `<${messageId}@kilicart.local>` } : {}), subject: purpose === 'VERIFY' ? 'Verify your email' : 'Reset your password', text: `Open this link to ${purpose === 'VERIFY' ? 'verify your email' : 'reset your password'}: ${url.href}\nIf you did not request this, ignore this message.` });
    },
  };
}
