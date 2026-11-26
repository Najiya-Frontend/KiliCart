import { getStores, CatalogueApiError } from '../../lib/catalogue-api';
import { EmptyState, ErrorState } from '../../components/marketplace/States';

export const metadata = { title: 'Local stores' };
export default async function StoresPage() {
  try {
    const result = await getStores();
    return <div className="container page-shell"><header className="page-intro"><span className="eyebrow">SMALL BUSINESSES, BIG HEART</span><h1>Local stores</h1><p>Get to know the makers and small businesses behind the things you find here.</p></header>{result.items.length ? <div className="seller-grid">{result.items.map(store => <a className="seller-card" href={`/stores/${encodeURIComponent(store.slug)}`} key={store.id}><span className="seller-avatar" aria-hidden="true">{store.name.slice(0, 1).toUpperCase()}</span><strong>{store.name}</strong><span>Visit store <i aria-hidden="true">↗</i></span></a>)}</div> : <EmptyState title="No public stores just yet" description="Stores appear here only after they have been approved for public viewing." href="/categories" action="Explore categories" />}</div>;
  } catch (error) {
    return <div className="container page-shell"><ErrorState title="Stores could not be loaded" description={error instanceof CatalogueApiError ? 'Please try again in a moment.' : 'Please try again in a moment.'} /></div>;
  }
}
