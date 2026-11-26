'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Product } from '../../lib/catalogue-api';
import { formatPrice, safeImageUrl } from '../../lib/catalogue-api';

export default function ProductCard({ product }: { product: Product }) {
  const image = safeImageUrl(product.images?.[0]?.url);
  const [failed,setFailed]=useState(false);
  const available = Number.isInteger(product.stockQuantity) && product.stockQuantity > 0;
  return <article className="product-card">
    <Link className="product-image" href={`/products/${encodeURIComponent(product.slug)}`} aria-label={`View ${product.name}`}>
      {image&&!failed ? <img src={image} alt={product.images[0]?.altText || product.name} loading="lazy" onError={()=>setFailed(true)} /> : <span className="product-image-fallback" aria-hidden="true"><i>✳</i></span>}
      <span className={`availability-pill${available ? ' is-available' : ''}`}>{available ? 'Available' : 'Unavailable'}</span>
    </Link>
    <div className="product-card-copy"><Link className="product-name" href={`/products/${encodeURIComponent(product.slug)}`}>{product.name}</Link><p className="product-seller">by <Link href={`/stores/${encodeURIComponent(product.store.slug)}`}>{product.store.name}</Link></p><strong className="product-price">{formatPrice(product.price)}</strong></div>
  </article>;
}
