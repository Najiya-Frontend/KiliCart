import { getHome, CatalogueApiError } from '../lib/catalogue-api';
import type { HomeData } from '../lib/catalogue-api';
import CategoryGrid from '../components/marketplace/CategoryGrid';
import ProductGrid from '../components/marketplace/ProductGrid';
import { EmptyState, ErrorState } from '../components/marketplace/States';

function ProductSection({ title, eyebrow, products }: { title: string; eyebrow: string; products: HomeData['featuredProducts'] }) {
  if (!products?.length) return null;
  return <section className="page-section"><div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><a className="text-link" href="/products">Explore all <span aria-hidden="true">→</span></a></div><ProductGrid products={products} /></section>;
}

function SellerSection({ sellers }: { sellers: HomeData['featuredSellers'] }) {
  if (!sellers?.length) return null;
  return <section className="page-section"><div className="section-heading"><div><span className="eyebrow">GOOD PEOPLE, GOOD THINGS</span><h2>Meet local makers</h2></div><a className="text-link" href="/stores">All stores <span aria-hidden="true">→</span></a></div><div className="seller-grid">{sellers.map(seller => <a className="seller-card" href={`/stores/${encodeURIComponent(seller.slug)}`} key={seller.id}><span className="seller-avatar" aria-hidden="true">{seller.name.slice(0, 1).toUpperCase()}</span><strong>{seller.name}</strong><span>Visit store <i aria-hidden="true">↗</i></span></a>)}</div></section>;
}

export default async function HomePage() {
  let home: HomeData;
  try { home = await getHome(); }
  catch (error) {
    return <div className="container page-shell"><ErrorState title="The marketplace is taking a little pause" description={error instanceof CatalogueApiError ? 'We couldn’t load the latest marketplace information. Please try again.' : 'Please try again in a moment.'} /></div>;
  }
  return <>
    <section className="home-hero"><div className="container hero-inner"><div className="hero-copy"><span className="eyebrow"><i className="eyebrow-dot" /> A MARKETPLACE FOR THE THINGS MADE WITH CARE</span><h1>Good finds.<br /><em>Closer to home.</em></h1><p>Discover the small businesses and independent makers bringing a little more character to everyday life.</p><a className="button hero-button" href="#discover">Explore the marketplace <span aria-hidden="true">↓</span></a><div className="hero-note"><span className="hero-note-mark" aria-hidden="true">✳</span><span>From family kitchens to thoughtful homewares,<br />there’s room for every kind of local business.</span></div></div><div className="hero-art" aria-hidden="true"><div className="hero-art-sun" /><div className="hero-art-orbit orbit-one" /><div className="hero-art-orbit orbit-two" /><div className="hero-art-vase vase-one"><i /></div><div className="hero-art-vase vase-two"><i /></div><div className="hero-art-leaf leaf-one" /><div className="hero-art-leaf leaf-two" /><div className="hero-art-pedestal" /><span className="hero-art-stamp">made<br />nearby</span></div></div></section>
    {home.promotionalBanners?.length ? <section className="container promo-row" aria-label="Promotions">{home.promotionalBanners.map(banner => <a href={banner.href || '/products'} key={banner.id}><img src={banner.imageUrl} alt={banner.altText} /></a>)}</section> : null}
    <div className="container content-shell" id="discover">
      <section className="page-section category-section"><div className="section-heading"><div><span className="eyebrow">A LITTLE BIT OF EVERYTHING</span><h2>Explore by category</h2><p>From pantry staples to one-of-a-kind pieces, start wherever curiosity takes you.</p></div><a className="text-link" href="/categories">All categories <span aria-hidden="true">→</span></a></div><CategoryGrid categories={home.categories} /></section>
      <SellerSection sellers={home.featuredSellers} />
      <ProductSection eyebrow="MAKING A BUZZ" title="Trending right now" products={home.trendingProducts} />
      <ProductSection eyebrow="FRESH FROM THE MAKERS" title="Just arrived" products={home.newArrivals} />
      <ProductSection eyebrow="COMMUNITY FAVOURITES" title="Popular picks" products={home.popularProducts ?? []} />
      <ProductSection eyebrow="AROUND YOUR CORNER" title="Local delivery" products={home.localProducts ?? []} />
      <ProductSection eyebrow="FROM FURTHER AFIELD" title="Courier available" products={home.courierProducts ?? []} />
      <ProductSection eyebrow="MADE WITH CARE" title="Featured finds" products={home.featuredProducts} />
      {!home.featuredProducts.length && !home.trendingProducts.length && !home.newArrivals.length && !home.featuredSellers.length && !home.popularProducts?.length && !home.localProducts?.length && !home.courierProducts?.length ? <EmptyState title="Local businesses are getting ready" description="The marketplace is open, but there are no public products or stores to browse yet. Check back as local makers join KiliCart." href="/categories" action="Browse categories" /> : null}
    </div>
  </>;
}
