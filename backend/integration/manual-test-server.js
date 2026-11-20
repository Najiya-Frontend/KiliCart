import 'dotenv/config';
import { testDatabaseUrl } from './guard.js';

if (process.env.NODE_ENV !== 'development') throw new Error('Manual test API requires development mode');
const testUrl = testDatabaseUrl();
process.env.DATABASE_URL = testUrl;
const { prisma } = await import('../src/config/prisma.js');
const { default: app } = await import('../src/app.js');
const rows = await prisma.$queryRaw`SELECT DATABASE() AS name`;
if (rows[0]?.name !== 'kilicart_test') throw new Error('Manual test API requires kilicart_test');
const server = app.listen(5001, '127.0.0.1', () => console.log('Manual test API listening on 127.0.0.1:5001 using kilicart_test'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(async () => { await prisma.$disconnect(); }));
