import type { Category } from './catalogue';

export type SellerApplication = {
  id: number; businessName: string; businessType: string; contactPhone: string;
  businessAddress: string; description: string | null; status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedAt: string; decidedAt: string | null; applicantMessage: string | null;
};
export type SellerStore = {
  id: number; name: string; slug: string; description: string | null; contactPhone: string | null;
  location: string | null; status: 'DRAFT' | 'PENDING_REVIEW' | 'ACTIVE' | 'REJECTED'; rejectionReason: string | null;
  createdAt: string; updatedAt: string;
};
export type SellerProduct = {
  id: number; storeId: number; categoryId: number; name: string; slug: string; description: string | null;
  price: string; status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'REJECTED' | 'ARCHIVED';
  rejectionReason: string | null; stockQuantity: number; createdAt: string; updatedAt: string;
  images: { id: number; url: string; altText: string | null; position: number; isMain?: boolean }[];
  category: Pick<Category, 'id' | 'name' | 'slug'> & { status: string };
};
export type SellerPage<T> = { items: T[]; pagination: { page: number; pageSize: number; hasMore: boolean } };
