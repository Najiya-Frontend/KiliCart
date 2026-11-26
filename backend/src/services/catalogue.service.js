import { prisma } from '../config/prisma.js';

const categoryCard = { id: true, name: true, slug: true, description: true, imageUrl: true, parentId: true };
const publicStore = { id: true, name: true, slug: true, description: true };
const publicProduct = {
  id: true, name: true, slug: true, description: true, price: true, stockQuantity: true, createdAt: true,
  category: { select: { id: true, name: true, slug: true } }, store: { select: publicStore },
  images: { where: { status: 'ACTIVE' }, select: { id: true, url: true, altText: true, position: true }, orderBy: { position: 'asc' } },
};
const visibleStore = { status: 'ACTIVE', sellerAccount: { status: 'ACTIVE' } };
const visibleProduct = { status: 'PUBLISHED', category: { status: 'ACTIVE' }, store: visibleStore };
const sortOrder = { recommended: [{ createdAt: 'desc' }, { id: 'desc' }], newest: [{ createdAt: 'desc' }, { id: 'desc' }], price_asc: [{ price: 'asc' }, { id: 'asc' }], price_desc: [{ price: 'desc' }, { id: 'desc' }] };
const pagination = (page, pageSize) => ({ skip: (page - 1) * pageSize, take: pageSize + 1 });
const pageResult = (rows, pageSize) => ({ items: rows.slice(0, pageSize), hasMore: rows.length > pageSize });
const publicProductPage = (rows, pageSize) => pageResult(rows, pageSize);

export function createCatalogueService(db = prisma) {
  const productWhere = filters => ({
    ...visibleProduct,
    ...(filters.category ? { category: { slug: filters.category, status: 'ACTIVE' } } : {}),
    ...(filters.store ? { store: { ...visibleStore, slug: filters.store } } : {}),
    ...(filters.minPrice || filters.maxPrice ? { price: { ...(filters.minPrice ? { gte: filters.minPrice } : {}), ...(filters.maxPrice ? { lte: filters.maxPrice } : {}) } } : {}),
  });
  return {
    async listCategories() {
      return db.category.findMany({ where: { status: 'ACTIVE', parentId: null }, select: { ...categoryCard, children: { where: { status: 'ACTIVE' }, select: categoryCard, orderBy: { name: 'asc' } } }, orderBy: { name: 'asc' } });
    },
    async getCategory(slug) {
      return db.category.findFirst({ where: { slug, status: 'ACTIVE' }, select: { ...categoryCard, children: { where: { status: 'ACTIVE' }, select: categoryCard, orderBy: { name: 'asc' } } } });
    },
    async listCategoryProducts(slug, filters) {
      const rows = await db.product.findMany({ where: { ...productWhere(filters), category: { ...productWhere(filters).category, slug, status: 'ACTIVE' } }, orderBy: sortOrder[filters.sort], ...pagination(filters.page, filters.pageSize), select: publicProduct });
      return publicProductPage(rows, filters.pageSize);
    },
    async listProducts(filters) {
      const rows = await db.product.findMany({ where: productWhere(filters), orderBy: sortOrder[filters.sort], ...pagination(filters.page, filters.pageSize), select: publicProduct });
      return publicProductPage(rows, filters.pageSize);
    },
    async getProduct(slug) {
      const product = await db.product.findFirst({ where: { ...visibleProduct, slug }, select: publicProduct });
      return product;
    },
    async listStores(filters) {
      const rows = await db.store.findMany({ where: visibleStore, orderBy: [{ name: 'asc' }, { id: 'asc' }], ...pagination(filters.page, filters.pageSize), select: publicStore });
      return publicProductPage(rows, filters.pageSize);
    },
    async getStore(slug) {
      return db.store.findFirst({ where: { ...visibleStore, slug }, select: publicStore });
    },
    async listStoreProducts(slug, filters) {
      const rows = await db.product.findMany({ where: { ...productWhere(filters), store: { ...visibleStore, slug } }, orderBy: sortOrder[filters.sort], ...pagination(filters.page, filters.pageSize), select: publicProduct });
      return pageResult(rows, filters.pageSize);
    },
    async search(query, filters) {
      const common = pagination(filters.page, filters.pageSize);
      const [products, stores, categories] = await Promise.all([
        db.product.findMany({ where: { ...visibleProduct, OR: [{ name: { contains: query } }, { description: { contains: query } }] }, orderBy: sortOrder.recommended, ...common, select: publicProduct }),
        db.store.findMany({ where: { ...visibleStore, OR: [{ name: { contains: query } }, { description: { contains: query } }] }, orderBy: [{ name: 'asc' }, { id: 'asc' }], ...common, select: publicStore }),
        db.category.findMany({ where: { status: 'ACTIVE', OR: [{ name: { contains: query } }, { description: { contains: query } }] }, select: categoryCard, orderBy: { name: 'asc' }, ...common }),
      ]);
      return { products, stores, categories };
    },
    async getHome() {
      const [categories, featuredSellers, featuredProducts, trendingProducts, newArrivals] = await Promise.all([
        this.listCategories(),
        db.store.findMany({ where: visibleStore, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: 8, select: publicStore }),
        db.product.findMany({ where: visibleProduct, orderBy: sortOrder.recommended, take: 8, select: publicProduct }),
        db.product.findMany({ where: visibleProduct, orderBy: [{ stockQuantity: 'desc' }, { id: 'desc' }], take: 8, select: publicProduct }),
        db.product.findMany({ where: visibleProduct, orderBy: sortOrder.newest, take: 8, select: publicProduct }),
      ]);
      return { categories, featuredSellers, featuredProducts, trendingProducts, newArrivals };
    },
  };
}

export const catalogueService = createCatalogueService();

const SORTS = new Set(['recommended', 'newest', 'price_asc', 'price_desc']);
const keys = new Set(['page', 'pageSize', 'category', 'store', 'minPrice', 'maxPrice', 'sort']);
const decimal = value => typeof value === 'string' && /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value);

export function parseProductFilters(query) {
  if (Object.keys(query).some(key => !keys.has(key))) return null;
  const page = query.page === undefined ? 1 : Number(query.page); const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) return null;
  if (query.sort !== undefined && !SORTS.has(query.sort)) return null;
  for (const key of ['category', 'store']) if (query[key] !== undefined && (typeof query[key] !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(query[key]) || query[key].length > 191)) return null;
  if (query.minPrice !== undefined && !decimal(query.minPrice)) return null;
  if (query.maxPrice !== undefined && !decimal(query.maxPrice)) return null;
  const cents = value => { const [whole, fraction = ''] = value.split('.'); return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')); };
  if (query.minPrice !== undefined && query.maxPrice !== undefined && cents(query.minPrice) > cents(query.maxPrice)) return null;
  return { page, pageSize, category: query.category, store: query.store, minPrice: query.minPrice, maxPrice: query.maxPrice, sort: query.sort ?? 'recommended' };
}

export function parseSearchQuery(query) {
  if (Object.keys(query).some(key => !['q', 'page', 'pageSize'].includes(key))) return null;
  if (typeof query.q !== 'string' || query.q.trim().length < 1 || query.q.trim().length > 100) return null;
  const page = query.page === undefined ? 1 : Number(query.page); const pageSize = query.pageSize === undefined ? 20 : Number(query.pageSize);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1_000_000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) return null;
  return { query: query.q.trim(), page, pageSize };
}
