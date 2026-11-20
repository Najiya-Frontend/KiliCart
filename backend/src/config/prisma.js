import 'dotenv/config';
import { PrismaClient } from '../../generated/prisma/index.js';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

// The adapter owns its pool; Prisma $disconnect closes it at shutdown.
let url;
try { url = new URL(process.env.DATABASE_URL); }
catch { throw new Error('Invalid DATABASE_URL'); }
if (url.protocol !== 'mysql:') throw new Error('DATABASE_URL must use mysql');
if (!url.searchParams.has('connectionLimit')) url.searchParams.set('connectionLimit', '5');
if (!url.searchParams.has('connectTimeout')) url.searchParams.set('connectTimeout', '10000');
if (!url.searchParams.has('acquireTimeout')) url.searchParams.set('acquireTimeout', '10000');
export const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url.toString()) });
