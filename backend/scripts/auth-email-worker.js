import 'dotenv/config';
import { prisma } from '../src/config/prisma.js';
import { createEmailService } from '../src/services/email.service.js';
import { outboxKey } from '../src/services/outbox-crypto.js';
import { createAuthEmailWorker, workerConfig } from '../src/services/auth-email-worker.js';

let timer;
try {
  const config = workerConfig(); const key = outboxKey(); const mailer = createEmailService();
  if (!mailer) throw new Error('Email configuration incomplete');
  // A hard deadline bounds even a stalled transport; an ambiguous in-flight
  // SMTP acceptance can still cause a later duplicate after lease expiry.
  timer = setTimeout(() => { console.error(JSON.stringify({ event: 'AUTH_EMAIL_WORKER_DEADLINE' })); process.exit(1); }, config.seconds * 1000);
  const count = await createAuthEmailWorker({ mailer, key, config }).run();
  console.info(JSON.stringify({ event: 'AUTH_EMAIL_WORKER_DONE', processed: count }));
} catch {
  console.error(JSON.stringify({ event: 'AUTH_EMAIL_WORKER_FAILED' })); process.exitCode = 1;
} finally {
  clearTimeout(timer);
  await prisma.$disconnect();
}
