import type { Category, Pagination, ProductFilters } from '../../lib/catalogue-api';

export function ProductFilters({ action = '/products', filters, categories = [], includeCategory = true }: { action?: string; filters: ProductFilters; categories?: Category[]; includeCategory?: boolean }) {
  return <form className="filter-panel" action={action} method="get">
    <div className="filter-heading"><span className="eyebrow">REFINE YOUR SEARCH</span><span>Set a few preferences</span></div>
    {includeCategory && <label>Category<select name="category" defaultValue={filters.category ?? ''}><option value="">All categories</option>{categories.flatMap(category => [category, ...(category.children ?? [])]).map(category => <option key={category.id} value={category.slug}>{category.name}</option>)}</select></label>}
    <div className="price-filter"><label>Min price<input type="number" name="minPrice" min="0" max="99999999.99" step="0.01" defaultValue={filters.minPrice} placeholder="₹ Min" /></label><label>Max price<input type="number" name="maxPrice" min="0" max="99999999.99" step="0.01" defaultValue={filters.maxPrice} placeholder="₹ Max" /></label></div>
    <label>Store slug<input type="text" name="store" defaultValue={filters.store} maxLength={191} placeholder="Optional store" /></label>
    <label>Sort by<select name="sort" defaultValue={filters.sort ?? 'recommended'}><option value="recommended">Recommended</option><option value="newest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select></label>
    {filters.pageSize && <input type="hidden" name="pageSize" value={filters.pageSize} />}
    <button type="submit" className="button">Apply filters</button>
  </form>;
}

export function Pagination({ pagination, href }: { pagination: Pagination; href: (page: number) => string }) {
  if (pagination.page <= 1 && !pagination.hasMore) return null;
  return <nav className="pagination" aria-label="Pagination">
    {pagination.page > 1 ? <a className="button button--outline" href={href(pagination.page - 1)}>← Previous</a> : <span />}
    <span>Page {pagination.page}</span>
    {pagination.hasMore ? <a className="button button--outline" href={href(pagination.page + 1)}>Next →</a> : <span />}
  </nav>;
}
