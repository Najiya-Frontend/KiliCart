import { prisma } from '../config/prisma.js';
import { RoleError } from './role.service.js';

// Internal only. All future suspension/deactivation operations must use this
// service and coordinate on the same role lock as SUPER_ADMIN revocation.
export async function setAccountActive(userId, isActive) {
  if (!Number.isInteger(userId) || userId <= 0 || typeof isActive !== 'boolean') throw new TypeError('Invalid account state');
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM roles WHERE code = ${'SUPER_ADMIN'} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: userId }, include: { roles: { include: { role: true } } } });
    if (!user) throw new RoleError('USER_NOT_FOUND', 'User not found');
    if (!isActive && user.isActive && user.roles.some(x => x.role.code === 'SUPER_ADMIN')) {
      const count = await tx.userRole.count({ where: { role: { code: 'SUPER_ADMIN' }, user: { isActive: true } } });
      if (count <= 1) throw new RoleError('LAST_SUPER_ADMIN', 'Cannot deactivate the final active super admin');
    }
    if (!isActive) await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    const updated = await tx.user.update({ where: { id: userId }, data: { isActive }, select: { id: true, isActive: true } });
    await tx.authAuditEvent.create({ data: { userId, event: isActive ? 'ACCOUNT_ACTIVATED' : 'ACCOUNT_SUSPENDED' } });
    return updated;
  }, { isolationLevel: 'ReadCommitted' });
}
