import { pathToFileURL } from 'node:url';
import { prisma } from '../src/config/prisma.js';
import { PLATFORM_ROLES } from '../src/config/roles.js';
export async function seedRoles(db = prisma) {
  return db.$transaction(PLATFORM_ROLES.map((role) => db.role.upsert({ where: { code: role.code }, create: role, update: { name: role.name, description: role.description } })));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await seedRoles(); console.log('Seeded five platform roles.'); }
  catch (error) { console.error('Role seed failed:', error.message); process.exitCode = 1; }
  finally { await prisma.$disconnect(); }
}
