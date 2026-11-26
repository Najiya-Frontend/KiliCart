export type Category = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  parentId: number | null;
  children?: Category[];
};
export type Store = { id: number; name: string; slug: string; description: string | null };
export type ProductImage = { url: string; altText: string | null; position: number };
export type Product = {
  id: number; name: string; slug: string; description: string | null; price: string;
  stockQuantity: number; createdAt: string; category: Pick<Category, 'id' | 'name' | 'slug'>;
  store: Store; images: ProductImage[];
};
export type Pagination = { page: number; pageSize: number; hasMore: boolean };
export type Page<T> = { items: T[]; pagination: Pagination };
export type HomeData = {
  categories: Category[]; featuredSellers: Store[]; featuredProducts: Product[];
  trendingProducts: Product[]; newArrivals: Product[];
  popularProducts?: Product[]; localProducts?: Product[]; courierProducts?: Product[];
  promotionalBanners?: { id: string | number; imageUrl: string; altText: string; href?: string }[];
};
export type SearchData = { products: Product[]; stores: Store[]; categories: Category[] };
export type ProductFilters = {
  page?: number; pageSize?: number; category?: string; store?: string;
  minPrice?: string; maxPrice?: string; sort?: 'recommended' | 'newest' | 'price_asc' | 'price_desc';
};
