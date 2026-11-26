export type Category = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  parentId: number | null;
  children?: Category[];
};

export type ProductImage = { url: string; altText: string | null; position: number };
export type Store = { id: number; name: string; slug: string; description: string | null };
export type Product = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  price: string;
  stockQuantity: number;
  createdAt: string;
  category: Pick<Category, 'id' | 'name' | 'slug'>;
  store: Store;
  images: ProductImage[];
};
export type Pagination = { page: number; pageSize: number; hasMore: boolean };
export type ProductFilters = {
  page?: string;
  pageSize?: string;
  category?: string;
  store?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
};
export type HomeData = {
  categories: Category[];
  featuredSellers: Store[];
  featuredProducts: Product[];
  trendingProducts: Product[];
  newArrivals: Product[];
  popularProducts?: Product[];
  localProducts?: Product[];
  courierProducts?: Product[];
  promotionalBanners?: { id: number | string; imageUrl: string; altText: string; href?: string }[];
};
export type SearchData = { products: Product[]; stores: Store[]; categories: Category[] };

type Envelope<T> = { success: true; message: string; data: T; pagination?: Pagination };
export class CatalogueApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'CatalogueApiError';
  }
}

function apiBase() {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') throw new CatalogueApiError(0, 'Catalogue API is not configured.');
  return 'http://localhost:5000/api/v1';
}

function queryString(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '') params.set(key, value);
  const value = params.toString();
  return value ? `?${value}` : '';
}

async function get<T>(path: string): Promise<Envelope<T>> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' });
  } catch {
    throw new CatalogueApiError(0, 'The catalogue could not be reached.');
  }
  let body: unknown;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'message' in body && typeof body.message === 'string' ? body.message : 'The catalogue request failed.';
    throw new CatalogueApiError(response.status, message);
  }
  if (!body || typeof body !== 'object' || !('success' in body) || body.success !== true || !('data' in body)) {
    throw new CatalogueApiError(502, 'The catalogue returned an unexpected response.');
  }
  return body as Envelope<T>;
}

export async function getHome() { return (await get<HomeData>('/home')).data; }
export async function getCategories() { return (await get<Category[]>('/categories')).data; }
export async function getCategory(slug: string) { return (await get<Category>(`/categories/${encodeURIComponent(slug)}`)).data; }
export async function getProducts(filters: ProductFilters = {}) {
  const result = await get<Product[]>(`/products${queryString(filters)}`);
  return { items: result.data, pagination: result.pagination ?? { page: 1, pageSize: 20, hasMore: false } };
}
export async function getCategoryProducts(slug: string, filters: ProductFilters = {}) {
  const result = await get<Product[]>(`/categories/${encodeURIComponent(slug)}/products${queryString(filters)}`);
  return { items: result.data, pagination: result.pagination ?? { page: 1, pageSize: 20, hasMore: false } };
}
export async function getProduct(slug: string) { return (await get<Product>(`/products/${encodeURIComponent(slug)}`)).data; }
export async function getStores(page = '1', pageSize = '20') {
  const result = await get<Store[]>(`/stores${queryString({ page, pageSize })}`);
  return { items: result.data, pagination: result.pagination ?? { page: 1, pageSize: 20, hasMore: false } };
}
export async function getStore(slug: string) { return (await get<Store>(`/stores/${encodeURIComponent(slug)}`)).data; }
export async function getStoreProducts(slug: string, filters: ProductFilters = {}) {
  const result = await get<Product[]>(`/stores/${encodeURIComponent(slug)}/products${queryString(filters)}`);
  return { items: result.data, pagination: result.pagination ?? { page: 1, pageSize: 20, hasMore: false } };
}
export async function searchCatalogue(query: string, page = '1', pageSize = '20') {
  return (await get<SearchData>(`/search${queryString({ q: query, page, pageSize })}`));
}

export function safeImageUrl(value: string | null | undefined): string | null {
  if (!value || value.startsWith('//') || value.includes('\\')) return null;
  if (value.startsWith('/') && !value.startsWith('/\\')) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch { return null; }
}

export function formatPrice(value: string) {
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) return `₹${value}`;
  const [whole, fraction] = value.split('.');
  return `₹${Number(whole).toLocaleString('en-IN')}${fraction ? `.${fraction.padEnd(2, '0')}` : ''}`;
}
