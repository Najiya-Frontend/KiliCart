import { prisma } from '../config/prisma.js';

export class SellerError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const applicationFields = {
  id: true, businessName: true, businessType: true, contactPhone: true,
  businessAddress: true, description: true, status: true, submittedAt: true,
  decidedAt: true, applicantMessage: true,
};

export function createSellerService(db = prisma) {
  return {
    async submitApplication(userId, input) {
      return db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user?.isActive) throw new SellerError('USER_NOT_FOUND', 'Account is unavailable');
        if (await tx.sellerAccount.findUnique({ where: { userId } })) throw new SellerError('ALREADY_SELLER', 'Seller account already exists');
        if (await tx.sellerApplication.findFirst({ where: { userId, status: 'PENDING' }, select: { id: true } })) throw new SellerError('PENDING_APPLICATION', 'A pending application already exists');
        return tx.sellerApplication.create({ data: { userId, ...input }, select: applicationFields });
      }, { isolationLevel: 'ReadCommitted' });
    },
    listMyApplications(userId) {
      return db.sellerApplication.findMany({ where: { userId }, select: applicationFields, orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }] });
    },
    listApplications({ status, page, pageSize }) {
      const where = status ? { status } : {};
      return db.sellerApplication.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }], include: { applicant: { select: { id: true, fullName: true, email: true } }, decidedBy: { select: { id: true, fullName: true } } } });
    },
    getApplication(id) {
      return db.sellerApplication.findUnique({ where: { id }, include: { applicant: { select: { id: true, fullName: true, email: true } }, decidedBy: { select: { id: true, fullName: true } } } });
    },
    async decideApplication({ applicationId, adminId, decision, internalRejectionReason, applicantMessage }) {
      return db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM seller_applications WHERE id = ${applicationId} FOR UPDATE`;
        const application = await tx.sellerApplication.findUnique({ where: { id: applicationId } });
        if (!application) throw new SellerError('APPLICATION_NOT_FOUND', 'Application not found');
        if (application.status !== 'PENDING') throw new SellerError('APPLICATION_ALREADY_DECIDED', 'Only pending applications can be decided');
        const now = new Date();
        if (decision === 'APPROVE') {
          const sellerAccount = await tx.sellerAccount.create({ data: { userId: application.userId, applicationId, approvedAt: now } });
          const role = await tx.role.findUnique({ where: { code: 'SELLER' } });
          if (!role) throw new SellerError('ROLE_NOT_SEEDED', 'Seller role is not configured');
          await tx.userRole.upsert({ where: { userId_roleId: { userId: application.userId, roleId: role.id } }, create: { userId: application.userId, roleId: role.id }, update: {} });
          await tx.sellerApplication.update({ where: { id: applicationId }, data: { status: 'APPROVED', decidedAt: now, decidedById: adminId, applicantMessage } });
          await tx.sellerAdminAudit.create({ data: { actorUserId: adminId, targetUserId: application.userId, applicationId, sellerAccountId: sellerAccount.id, action: 'APPLICATION_APPROVED', fromStatus: 'PENDING', toStatus: 'APPROVED' } });
        } else {
          await tx.sellerApplication.update({ where: { id: applicationId }, data: { status: 'REJECTED', decidedAt: now, decidedById: adminId, internalRejectionReason, applicantMessage } });
          await tx.sellerAdminAudit.create({ data: { actorUserId: adminId, targetUserId: application.userId, applicationId, action: 'APPLICATION_REJECTED', fromStatus: 'PENDING', toStatus: 'REJECTED', reason: internalRejectionReason } });
        }
        return tx.sellerApplication.findUnique({ where: { id: applicationId }, select: applicationFields });
      }, { isolationLevel: 'ReadCommitted' });
    },
    async changeSellerStatus({ userId, adminId, status, reason }) {
      return db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM seller_accounts WHERE userId = ${userId} FOR UPDATE`;
        const seller = await tx.sellerAccount.findUnique({ where: { userId } });
        if (!seller) throw new SellerError('SELLER_NOT_FOUND', 'Seller account not found');
        if (seller.status === status) throw new SellerError('STATUS_UNCHANGED', 'Seller account already has this status');
        const now = new Date();
        const updated = await tx.sellerAccount.update({ where: { id: seller.id }, data: { status, suspendedAt: status === 'SUSPENDED' ? now : null, suspensionReason: status === 'SUSPENDED' ? reason : null } });
        await tx.sellerAdminAudit.create({ data: { actorUserId: adminId, targetUserId: userId, sellerAccountId: seller.id, action: status === 'SUSPENDED' ? 'SELLER_SUSPENDED' : 'SELLER_REACTIVATED', fromStatus: seller.status, toStatus: status, reason } });
        return updated;
      }, { isolationLevel: 'ReadCommitted' });
    },
  };
}

export const sellerService = createSellerService();
