import { searchCatalogue, CatalogueApiError } from '../../lib/catalogue-api';
import CategoryGrid from '../../components/marketplace/CategoryGrid';
import ProductGrid from '../../components/marketplace/ProductGrid';
import { ErrorState, EmptyState } from '../../components/marketplace/States';

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (value: string | string[] | undefined) => typeof value === 'string' ? value : '';

export default async function SearchPage({ searchParams }: { searchParams: Search }) {
  const query = await searchParams;
  const term = one(query.q).trim();
  if (!term) return <div className="container page-shell"><header className="page-intro"><span className="eyebrow">FIND SOMETHING YOU’LL LOVE</span><h1>Search KiliCart</h1><p>Search across local categories, products and stores.</p></header><EmptyState title="What are you looking for?" description="Try a category or product name in the search box above." /></div>;
  try {
    const response = await searchCatalogue(term, one(query.page) || '1', one(query.pageSize) || '20');
    const results = response.data;
    const total = results.products.length + results.stores.length + results.categories.length;
    return <div className="container page-shell"><header className="page-intro page-intro--compact"><span className="eyebrow">YOUR SEARCH</span><h1>Results for <em>“{term}”</em></h1><p>{total ? `${total} results found` : 'No matching products, stores or categories were found.'}</p></header>
      {results.categories.length > 0 && <section className="page-section search-section"><div className="section-heading"><div><span className="eyebrow">BROWSE BY TYPE</span><h2>Categories</h2></div></div><CategoryGrid categories={results.categories} /></section>}
      {results.stores.length > 0 && <section className="page-section search-section"><div className="section-heading"><div><span className="eyebrow">MEET THE MAKERS</span><h2>Stores</h2></div></div><div className="seller-grid">{results.stores.map(store => <a className="seller-card" href={`/stores/${encodeURIComponent(store.slug)}`} key={store.id}><span className="seller-avatar" aria-hidden="true">{store.name.slice(0, 1).toUpperCase()}</span><strong>{store.name}</strong><span>Visit store <i aria-hidden="true">↗</i></span></a>)}</div></section>}
      {results.products.length > 0 && <section className="page-section search-section"><div className="section-heading"><div><span className="eyebrow">PRODUCTS</span><h2>Matching finds</h2></div></div><ProductGrid products={results.products} /></section>}
      {!total && <EmptyState title="No results yet" description="We couldn’t find a public product, store or category for that search. Try another word or browse all categories." href="/categories" action="Browse categories" />}
      {response.pagination?.hasMore && <div className="search-pagination"><a className="button button--outline" href={`/search?${new URLSearchParams({ q: term, page: String(response.pagination.page + 1), pageSize: String(response.pagination.pageSize) })}`}>More categories →</a></div>}
    </div>;
  } catch (error) {
    return <div className="container page-shell"><ErrorState title="Search could not be completed" description={error instanceof CatalogueApiError ? 'Please check your search and try again.' : 'Please try again in a moment.'} /></div>;
  }
}
