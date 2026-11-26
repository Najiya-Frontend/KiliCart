import { notFound } from 'next/navigation';
import { CatalogueApiError, getProduct, formatPrice } from '../../../lib/catalogue-api';
import { Breadcrumbs, ErrorState } from '../../../components/marketplace/States';
import ProductGallery from '../../../components/marketplace/ProductGallery';

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const product = await getProduct(slug);
    return <div className="container page-shell"><Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Products', href: '/products' }, { label: product.name }]} /><article className="product-detail">
      <ProductGallery images={product.images} name={product.name}/>
      <div className="product-detail-copy"><a className="detail-category" href={`/categories/${encodeURIComponent(product.category.slug)}`}>{product.category.name}</a><span className="eyebrow">A LOCAL FIND</span><h1>{product.name}</h1><strong className="detail-price">{formatPrice(product.price)}</strong>{product.description && <p className="detail-description">{product.description}</p>}
        <p className={`stock-note${product.stockQuantity > 0 ? ' stock-note--available' : ''}`}><span aria-hidden="true">●</span>{product.stockQuantity > 0 ? `${product.stockQuantity} available` : 'Currently unavailable'}</p>
        <div className="detail-seller"><span className="seller-avatar" aria-hidden="true">{product.store.name.slice(0, 1).toUpperCase()}</span><div><small>Made and sold by</small><a href={`/stores/${encodeURIComponent(product.store.slug)}`}>{product.store.name} <span aria-hidden="true">↗</span></a></div></div>
        <button className="button detail-cart" type="button" disabled title="Cart is not part of this step">Add to cart <span>Coming later</span></button>
        <p className="detail-footnote">Product details and prices are provided by KiliCart’s central catalogue.</p>
      </div>
    </article></div>;
  } catch (error) {
    if (error instanceof CatalogueApiError && error.status === 404) notFound();
    return <div className="container page-shell"><ErrorState title="Product details could not be loaded" description="Please try again in a moment." /></div>;
  }
}
