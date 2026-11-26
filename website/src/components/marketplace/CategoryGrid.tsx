import type { Category } from '../../lib/catalogue-api';
import CategoryCard from './CategoryCard';
import { EmptyState } from './States';

export default function CategoryGrid({ categories, emptyTitle = 'Categories are taking shape', emptyDescription = 'There are no active categories to show right now.' }: { categories: Category[]; emptyTitle?: string; emptyDescription?: string }) {
  if (!categories.length) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return <div className="category-grid">{categories.map(category => <CategoryCard key={category.id} category={category} />)}</div>;
}
