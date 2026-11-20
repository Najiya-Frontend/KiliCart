import crypto from 'node:crypto';

export function outboxKey(config = process.env) {
  if (!/^[a-f0-9]{64}$/i.test(config.AUTH_EMAIL_OUTBOX_KEY || '')) throw new Error('AUTH_EMAIL_OUTBOX_KEY must be 32 random bytes encoded as 64 hex characters');
  return Buffer.from(config.AUTH_EMAIL_OUTBOX_KEY, 'hex');
}

export function encryptToken(token, id, key = outboxKey()) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(id));
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString('base64url')).join('.');
}

export function decryptToken(payload, id, key = outboxKey()) {
  const [iv, tag, ciphertext] = payload.split('.').map(part => Buffer.from(part, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(id)); decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
