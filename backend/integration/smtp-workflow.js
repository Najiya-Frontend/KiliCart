import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { testDatabaseUrl } from './guard.js';
import { createEmailService } from '../src/services/email.service.js';

if (process.env.NODE_ENV !== 'development' || (process.env.SMTP_HOST || '').toLowerCase().replace(/\.$/, '') !== 'sandbox.smtp.mailtrap.io' || process.argv.slice(2).join(' ') !== '--send') throw new Error('Sandbox workflow requires development mode, the Mailtrap sandbox host and --send');
const designated = process.env.SMTP_TEST_RECIPIENT;
if (!designated || !/^[a-z0-9._+-]+@example\.invalid$/i.test(designated)) throw new Error('Set SMTP_TEST_RECIPIENT to an example.invalid address');
const recipient = `${designated.split('@')[0]}+${randomUUID()}@example.invalid`;
process.env.DATABASE_URL = testDatabaseUrl();
process.env.AUTH_EMAIL_OUTBOX_KEY = randomBytes(32).toString('hex');
const { prisma } = await import('../src/config/prisma.js');
const { register, requestAction, completeAction } = await import('../src/services/auth.service.js');
const { createAuthEmailWorker } = await import('../src/services/auth-email-worker.js');
let userId, roleId;
try {
  assert.equal((await prisma.$queryRaw`SELECT DATABASE() AS name`)[0].name, 'kilicart_test');
  let role = await prisma.role.findUnique({ where: { code: 'CUSTOMER' } });
  if (!role) { role = await prisma.role.create({ data: { code: 'CUSTOMER', name: 'Customer' } }); roleId = role.id; }
  const mailer = createEmailService(); if (!mailer) throw new Error('SMTP configuration missing');
  await mailer.verify();
  await register({ email: recipient, fullName: 'SMTP test fixture', password: 'KiliCart temporary passphrase 423' });
  userId = (await prisma.user.findUniqueOrThrow({ where: { email: recipient } })).id;
  let raw;
  const observer = { sendAction: async args => { raw = args.token; await mailer.sendAction(args); } };
  const worker = createAuthEmailWorker({ mailer: observer, filter: { token: { userId } } });
  await requestAction(recipient, 'VERIFY');
  const job = await worker.claim(); assert.ok(job);
  assert.equal(await worker.processClaim(job), 'SENT');
  assert.equal(await completeAction(raw, 'VERIFY'), true);
  assert.equal(await completeAction(raw, 'VERIFY'), false);
  console.log('Mailtrap Sandbox accepted one queued verification message; single-use confirmation passed.');
} catch {
  console.error('Sandbox workflow failed; check sandbox configuration, rate limits and test database.');
  process.exitCode = 1;
} finally {
  if (userId) { await prisma.authAuditEvent.deleteMany({ where: { userId } }); await prisma.userRole.deleteMany({ where: { userId } }); await prisma.user.delete({ where: { id: userId } }); }
  if (roleId) await prisma.role.delete({ where: { id: roleId } });
  await prisma.$disconnect();
}
