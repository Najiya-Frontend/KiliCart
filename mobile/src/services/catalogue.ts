import { apiRequest, queryString } from './api';
import type { Category, HomeData, Page, Product, ProductFilters, SearchData, Store } from '@/types/catalogue';

export const getHome = async () => (await apiRequest<HomeData>('/home')).data;
export const getCategories = async () => (await apiRequest<Category[]>('/categories')).data;
export const getCategory = async (slug: string) => (await apiRequest<Category>(`/categories/${encodeURIComponent(slug)}`)).data;
async function listProducts(path: string, filters: ProductFilters = {}): Promise<Page<Product>> {
  const result = await apiRequest<Product[]>(`${path}${queryString(filters)}`);
  return { items: result.data, pagination: result.pagination ?? { page: 1, pageSize: 20, hasMore: false } };
}
export const getProducts = (filters?: ProductFilters) => listProducts('/products', filters);
export const getCategoryProducts = (slug: string, filters?: ProductFilters) => listProducts(`/categories/${encodeURIComponent(slug)}/products`, filters);
export const getProduct = async (slug: string) => (await apiRequest<Product>(`/products/${encodeURIComponent(slug)}`)).data;
export const getStores = async (page = 1, pageSize = 20) => listStores(`/stores${queryString({ page, pageSize })}`);
async function listStores(path: string): Promise<Page<Store>> {
  const result = await apiRequest<Store[]>(path);
  return { items: result.data, pagination: result.pagination ?? { page: 1, pageSize: 20, hasMore: false } };
}
export const getStore = async (slug: string) => (await apiRequest<Store>(`/stores/${encodeURIComponent(slug)}`)).data;
export const getStoreProducts = (slug: string, filters?: ProductFilters) => listProducts(`/stores/${encodeURIComponent(slug)}/products`, filters);
export async function searchCatalogue(q: string, page = 1, pageSize = 20) {
  const result = await apiRequest<SearchData>(`/search${queryString({ q, page, pageSize })}`);
  return { data: result.data, pagination: result.pagination ?? { page, pageSize, hasMore: false } };
}
