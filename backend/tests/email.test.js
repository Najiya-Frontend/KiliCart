import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmailService, validateEmailConfiguration } from '../src/services/email.service.js';
import { testDatabaseUrl } from '../integration/guard.js';

test('fake transport receives secure action URLs without network delivery', async () => {
  const messages = [];
  const mailer = createEmailService({ from: 'sender@example.invalid', publicUrl: 'https://example.invalid', transport: { sendMail: async msg => messages.push(msg) } });
  await mailer.sendAction({ to: 'recipient@example.invalid', purpose: 'VERIFY', token: 'example-token' });
  assert.match(messages[0].text, /https:\/\/example\.invalid\/verify-email#token=example-token/);
  await mailer.sendAction({ to: 'recipient@example.invalid', purpose: 'RESET', token: 'example-token' });
  assert.match(messages[1].text, /https:\/\/example\.invalid\/reset-password#token=example-token/);
  assert.throws(() => createEmailService({ from: 'test@example.invalid', publicUrl: 'http://example.invalid', transport: {} }), /Invalid APP_PUBLIC_URL/);
});
test('production email configuration fails closed for missing and sandbox settings', () => {
  assert.throws(() => validateEmailConfiguration({ NODE_ENV: 'production' }), /incomplete/);
  const config = { NODE_ENV: 'production', SMTP_HOST: 'sandbox.smtp.mailtrap.io', SMTP_PORT: '2525', SMTP_SECURE: 'false', SMTP_USER: 'u', SMTP_PASSWORD: 'p', EMAIL_FROM: 'noreply@example.invalid', APP_PUBLIC_URL: 'https://example.invalid' };
  assert.throws(() => validateEmailConfiguration(config), /Sandbox/);
  assert.equal(validateEmailConfiguration({ ...config, SMTP_HOST: 'smtp.example.invalid' }), true);
  assert.throws(() => validateEmailConfiguration({ ...config, SMTP_HOST: 'smtp.example.invalid', APP_PUBLIC_URL: 'http://localhost:3000' }), /Invalid APP_PUBLIC_URL/);
});
test('integration database guard refuses invalid database names and non-local hosts', () => {
  const original = process.env.TEST_DATABASE_URL;
  try {
    for (const url of ['', 'mysql://u:p@localhost/kilicart_dev', 'mysql://u:p@localhost/kilicart_shadow', 'mysql://u:p@production.example/kilicart_test', 'not-a-url']) {
      process.env.TEST_DATABASE_URL = url; assert.throws(testDatabaseUrl);
    }
    process.env.TEST_DATABASE_URL = 'mysql://u:p@127.0.0.1:3306/kilicart_test'; assert.equal(testDatabaseUrl(), process.env.TEST_DATABASE_URL);
  } finally { if (original === undefined) delete process.env.TEST_DATABASE_URL; else process.env.TEST_DATABASE_URL = original; }
});
