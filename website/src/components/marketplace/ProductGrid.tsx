import type { Product } from '../../lib/catalogue-api';
import ProductCard from './ProductCard';
import { EmptyState } from './States';

export default function ProductGrid({ products, emptyTitle = 'The catalogue is getting ready', emptyDescription = 'There are no publicly available products to show just yet. Please check back soon.' }: { products: Product[]; emptyTitle?: string; emptyDescription?: string }) {
  if (!products.length) return <EmptyState title={emptyTitle} description={emptyDescription} href="/categories" action="Browse categories" />;
  return <div className="product-grid">{products.map(product => <ProductCard key={product.id} product={product} />)}</div>;
}
