import { getCategories, CatalogueApiError } from '../../lib/catalogue-api';
import CategoryGrid from '../../components/marketplace/CategoryGrid';
import { ErrorState } from '../../components/marketplace/States';

export const metadata = { title: 'Browse categories' };
export default async function CategoriesPage() {
  try {
    const categories = await getCategories();
    return <div className="container page-shell"><header className="page-intro"><span className="eyebrow">FIND YOUR KIND OF LOCAL</span><h1>Browse categories</h1><p>From pantry favourites to handmade pieces for your home, explore what local businesses make.</p></header><CategoryGrid categories={categories} emptyTitle="No active categories yet" emptyDescription="There aren’t any active categories to browse right now." /></div>;
  } catch (error) {
    return <div className="container page-shell"><ErrorState title="Categories could not be loaded" description={error instanceof CatalogueApiError ? 'Please check back in a moment.' : 'Please try again in a moment.'} /></div>;
  }
}
