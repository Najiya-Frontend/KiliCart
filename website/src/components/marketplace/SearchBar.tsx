export default function SearchBar({ initialValue = '', compact = false }: { initialValue?: string; compact?: boolean }) {
  return (
    <form className={`search-bar${compact ? ' search-bar--compact' : ''}`} action="/search" role="search">
      <label className="sr-only" htmlFor={compact ? 'site-search-mobile' : 'site-search'}>Search products, makers and categories</label>
      <span className="search-icon" aria-hidden="true">⌕</span>
      <input id={compact ? 'site-search-mobile' : 'site-search'} name="q" type="search" placeholder="Search pickles, masala, handmade…" defaultValue={initialValue} />
      <button type="submit" aria-label="Search">Search</button>
    </form>
  );
}
