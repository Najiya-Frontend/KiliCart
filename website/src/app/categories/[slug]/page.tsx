import { notFound } from 'next/navigation';
import { CatalogueApiError, getCategory, getCategoryProducts } from '../../../lib/catalogue-api';
import type { ProductFilters } from '../../../lib/catalogue-api';
import CategoryGrid from '../../../components/marketplace/CategoryGrid';
import ProductGrid from '../../../components/marketplace/ProductGrid';
import { ProductFilters as Filters, Pagination } from '../../../components/marketplace/Filters';
import { Breadcrumbs, ErrorState } from '../../../components/marketplace/States';

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (value: string | string[] | undefined) => typeof value === 'string' ? value : undefined;
const queryFilters = (query: Record<string, string | string[] | undefined>): ProductFilters => ({ page: one(query.page) ?? '1', pageSize: one(query.pageSize) ?? '20', minPrice: one(query.minPrice), maxPrice: one(query.maxPrice), sort: one(query.sort) ?? 'recommended' });
const pageHref = (slug: string, filters: ProductFilters, page: number) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, page: String(page) })) if (value) params.set(key, value);
  return `/categories/${encodeURIComponent(slug)}?${params.toString()}`;
};

export default async function CategoryDetailPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Search }) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const filters = queryFilters(query);
  try {
    const [category, products] = await Promise.all([getCategory(slug), getCategoryProducts(slug, filters)]);
    const children = category.children ?? [];
    return <div className="container page-shell"><Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Categories', href: '/categories' }, { label: category.name }]} /><header className="page-intro page-intro--compact"><span className="eyebrow">EXPLORE A LITTLE MORE</span><h1>{category.name}</h1>{category.description && <p>{category.description}</p>}</header>
      {children.length > 0 && <section className="page-section subcategory-section"><div className="section-heading"><div><span className="eyebrow">MORE TO EXPLORE</span><h2>Browse subcategories</h2></div></div><CategoryGrid categories={children} /></section>}
      <section className="listing-layout"><aside><Filters action={`/categories/${encodeURIComponent(slug)}`} filters={filters} includeCategory={false} /></aside><div className="listing-main"><div className="listing-heading"><div><span className="eyebrow">THE COLLECTION</span><h2>Products</h2></div><span className="result-count">{products.items.length} products</span></div><ProductGrid products={products.items} emptyTitle="No public products in this category" emptyDescription="This category is active, but there are no products available to browse just yet." /><Pagination pagination={products.pagination} href={page => pageHref(slug, filters, page)} /></div></section>
    </div>;
  } catch (error) {
    if (error instanceof CatalogueApiError && error.status === 404) notFound();
    return <div className="container page-shell"><ErrorState title="This category could not be loaded" description="Please try again in a moment." /></div>;
  }
}
