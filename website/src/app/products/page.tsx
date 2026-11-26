import { getCategories, getProducts, CatalogueApiError } from '../../lib/catalogue-api';
import type { ProductFilters as ProductFilterValues } from '../../lib/catalogue-api';
import ProductGrid from '../../components/marketplace/ProductGrid';
import { ProductFilters, Pagination } from '../../components/marketplace/Filters';
import { Breadcrumbs, ErrorState } from '../../components/marketplace/States';

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (value: string | string[] | undefined) => typeof value === 'string' ? value : undefined;
const pageHref = (filters: ProductFilterValues, page: number) => { const params = new URLSearchParams(); for (const [key, value] of Object.entries({ ...filters, page: String(page) })) if (value) params.set(key, value); return `/products?${params.toString()}`; };

export default async function ProductsPage({ searchParams }: { searchParams: Search }) {
  const query = await searchParams;
  const filters: ProductFilterValues = { page: one(query.page) ?? '1', pageSize: one(query.pageSize) ?? '20', category: one(query.category), store: one(query.store), minPrice: one(query.minPrice), maxPrice: one(query.maxPrice), sort: one(query.sort) ?? 'recommended' };
  try {
    const [products, categories] = await Promise.all([getProducts(filters), getCategories()]);
    return <div className="container page-shell"><Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Products' }]} /><header className="page-intro page-intro--compact"><span className="eyebrow">LOCAL FINDS, ALL IN ONE PLACE</span><h1>Explore products</h1><p>Browse what local businesses have made available on KiliCart.</p></header><section className="listing-layout"><aside><ProductFilters filters={filters} categories={categories} /></aside><div className="listing-main"><div className="listing-heading"><div><span className="eyebrow">THE MARKETPLACE</span><h2>Products</h2></div><span className="result-count">{products.items.length} products</span></div><ProductGrid products={products.items} /><Pagination pagination={products.pagination} href={page => pageHref(filters, page)} /></div></section></div>;
  } catch (error) {
    return <div className="container page-shell"><ErrorState title="Products could not be loaded" description={error instanceof CatalogueApiError ? 'Please try again in a moment.' : 'Please try again in a moment.'} /></div>;
  }
}
