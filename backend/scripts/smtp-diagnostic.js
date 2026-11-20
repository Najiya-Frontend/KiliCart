import 'dotenv/config';
import { createEmailService } from '../src/services/email.service.js';

try {
  if (process.env.NODE_ENV !== 'development') throw new Error('Diagnostic requires NODE_ENV=development');
  if ((process.env.SMTP_HOST || '').toLowerCase().replace(/\.$/, '') !== 'sandbox.smtp.mailtrap.io') throw new Error('Diagnostic requires the Mailtrap sandbox host');
  if (process.argv.slice(2).some(arg => arg !== '--send')) throw new Error('Unsupported diagnostic option');
  const mailer = createEmailService();
  if (!mailer) throw new Error('SMTP configuration is incomplete');
  const recipient = process.env.SMTP_TEST_RECIPIENT;
  if (process.argv.includes('--send') && (!recipient || !/^[a-z0-9._+-]+@example\.invalid$/i.test(recipient))) throw new Error('Set SMTP_TEST_RECIPIENT to a designated example.invalid address');
  await mailer.verify();
  console.log('Mailtrap sandbox SMTP connection and authentication verified.');
  if (process.argv.includes('--send')) {
    await mailer.sendDiagnostic(recipient);
    console.log('Test message accepted by the sandbox SMTP server; check the sandbox inbox.');
  }
} catch (error) {
  const safeCodes = new Set(['EAUTH', 'ECONNECTION', 'ETIMEDOUT', 'EDNS', 'ESOCKET', 'ETLS', 'ECONFIG', 'EPROTOCOL']);
  const code = safeCodes.has(error.code) ? error.code : 'CONFIG_OR_SEND_ERROR';
  console.error(`SMTP diagnostic failed (${code}). Check local configuration and network access.`);
  process.exitCode = 1;
}
