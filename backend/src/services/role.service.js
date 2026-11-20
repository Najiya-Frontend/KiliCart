import { prisma } from '../config/prisma.js';
import { ROLE_CODES } from '../config/roles.js';
export class RoleError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function validateCode(code) {
  if (!ROLE_CODES.includes(code)) throw new RoleError('UNKNOWN_ROLE', 'Unknown platform role');
}
async function requireUser(db, userId) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new RoleError('USER_NOT_FOUND', 'User not found');
  return user;
}
async function requireRole(db, code) {
  validateCode(code);
  const role = await db.role.findUnique({ where: { code } });
  if (!role) throw new RoleError('ROLE_NOT_SEEDED', 'Platform role has not been seeded');
  return role;
}
export function createRoleService(db = prisma) {
  return {
    getPlatformRoles: () => db.role.findMany({ where: { code: { in: ROLE_CODES } }, select: { code: true, name: true, description: true }, orderBy: { code: 'asc' } }),
    async getUserRoles(userId) {
      await requireUser(db, userId);
      const assignments = await db.userRole.findMany({ where: { userId, role: { code: { in: ROLE_CODES } } }, select: { role: { select: { code: true, name: true, description: true } } } });
      return assignments.map(({ role }) => role);
    },
    async hasRole(userId, code) {
      validateCode(code); await requireUser(db, userId);
      return !!(await db.userRole.findFirst({ where: { userId, role: { code } } }));
    },
    async assignRole(userId, code) {
      validateCode(code);
      return db.$transaction(async (tx) => {
        await requireUser(tx, userId); const role = await requireRole(tx, code);
        return tx.userRole.upsert({ where: { userId_roleId: { userId, roleId: role.id } }, create: { userId, roleId: role.id }, update: {} });
      });
    },
    async revokeRole(userId, code) {
      validateCode(code);
      return db.$transaction(async (tx) => {
        if (code === 'SUPER_ADMIN') await tx.$queryRaw`SELECT id FROM roles WHERE code = ${code} FOR UPDATE`;
        const user = await requireUser(tx, userId); const role = await requireRole(tx, code);
        const where = { userId_roleId: { userId, roleId: role.id } };
        if (!await tx.userRole.findUnique({ where })) return false;
        if (code === 'SUPER_ADMIN' && user.isActive && await tx.userRole.count({ where: { roleId: role.id, user: { isActive: true } } }) <= 1) throw new RoleError('LAST_SUPER_ADMIN', 'Cannot revoke the final active super admin');
        await tx.userRole.delete({ where }); return true;
      }, { isolationLevel: 'ReadCommitted' });
    },
  };
}
export const roleService = createRoleService();
