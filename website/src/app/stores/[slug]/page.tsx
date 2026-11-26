import { notFound } from 'next/navigation';
import { CatalogueApiError, getStore, getStoreProducts } from '../../../lib/catalogue-api';
import ProductGrid from '../../../components/marketplace/ProductGrid';
import { Breadcrumbs, ErrorState, EmptyState } from '../../../components/marketplace/States';

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const [store, products] = await Promise.all([getStore(slug), getStoreProducts(slug)]);
    return <div className="container page-shell"><Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Local stores', href: '/stores' }, { label: store.name }]} /><header className="store-banner"><span className="store-monogram" aria-hidden="true">{store.name.slice(0, 1).toUpperCase()}</span><div><span className="eyebrow">A KILICART LOCAL BUSINESS</span><h1>{store.name}</h1>{store.description && <p>{store.description}</p>}</div></header><section className="store-about"><div><span className="eyebrow">ABOUT THIS STORE</span><h2>A little more about {store.name}</h2><p>{store.description || 'This local business is part of the KiliCart community.'}</p></div><div className="store-availability"><span className="availability-dot" />Public storefront</div></section><section className="page-section"><div className="section-heading"><div><span className="eyebrow">FROM THIS STORE</span><h2>Products</h2></div></div><ProductGrid products={products.items} emptyTitle="No public products from this store" emptyDescription="This storefront has no products available to browse right now." /></section></div>;
  } catch (error) {
    if (error instanceof CatalogueApiError && error.status === 404) notFound();
    return <div className="container page-shell"><ErrorState title="This store could not be loaded" description="Please try again in a moment." /></div>;
  }
}
