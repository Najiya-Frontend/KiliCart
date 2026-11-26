import Link from 'next/link';
import type { Category } from '../../lib/catalogue-api';
import { safeImageUrl } from '../../lib/catalogue-api';

function hue(slug: string) {
  let value = 0;
  for (const char of slug) value = (value * 31 + char.charCodeAt(0)) % 360;
  return value;
}

export default function CategoryCard({ category }: { category: Category }) {
  const image = safeImageUrl(category.imageUrl);
  return <Link className="category-card" href={`/categories/${encodeURIComponent(category.slug)}`} style={{ '--category-hue': hue(category.slug) } as React.CSSProperties}>
    <span className="category-art">{image ? <img src={image} alt="" loading="lazy" /> : <span className="category-art-shape" aria-hidden="true"><i /><b /><em /></span>}</span>
    <span className="category-card-copy"><strong>{category.name}</strong><span>Explore collection <i aria-hidden="true">↗</i></span></span>
  </Link>;
}
