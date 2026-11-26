import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ProductGrid } from '@/components/catalogue';
import { ErrorMessage, Message, Screen, SectionHeading, Title } from '@/components/ui';
import { getCategoryProducts, getProducts, getStoreProducts } from '@/services/catalogue';
import type { Page, Product, ProductFilters } from '@/types/catalogue';
import { colors, radii } from '@/theme/tokens';

export default function ProductListingScreen({ categorySlug, storeSlug, title = 'Explore products', description = 'Discover thoughtful finds from local businesses.', embedded = false }: { categorySlug?: string; storeSlug?: string; title?: string; description?: string; embedded?: boolean }) {
  const [sort, setSort] = useState<ProductFilters['sort']>('recommended');
  const [category, setCategory] = useState('');
  const [store, setStore] = useState('');
  const [minPrice, setMinPrice] = useState(''); const [maxPrice, setMaxPrice] = useState('');
  const [filters, setFilters] = useState<ProductFilters>({ page: 1, pageSize: 20 });
  const [result, setResult] = useState<Page<Product> | null>(null);
  const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState('');
  const pathKey = `${categorySlug || ''}|${storeSlug || ''}`;

  async function load(nextFilters = filters, pull = false) {
    if (pull) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const selected = categorySlug ? getCategoryProducts(categorySlug, nextFilters) : storeSlug ? getStoreProducts(storeSlug, nextFilters) : getProducts(nextFilters);
      setResult(await selected);
    } catch (e) { setError(e instanceof Error ? e.message : 'Products are unavailable right now.'); }
    finally { setLoading(false); setRefreshing(false); }
  }
  useEffect(() => { const next = { page: 1, pageSize: 20 }; setFilters(next); void load(next); /* route slug is the collection key */ }, [pathKey]);
  const sortChoices: Array<{ label: string; value: NonNullable<ProductFilters['sort']> }> = useMemo(() => [
    { label: 'Recommended', value: 'recommended' }, { label: 'Newest', value: 'newest' }, { label: 'Price ↑', value: 'price_asc' }, { label: 'Price ↓', value: 'price_desc' },
  ], []);
  function applyFilters() {
    const next: ProductFilters = { ...filters, page: 1, sort, category: categorySlug ? undefined : category.trim() || undefined, store: store.trim() || undefined, minPrice: minPrice.trim() || undefined, maxPrice: maxPrice.trim() || undefined };
    setFilters(next); void load(next);
  }
  function changePage(page: number) { const next = { ...filters, page }; setFilters(next); void load(next); }

  const content = <><View style={styles.intro}><Text style={styles.eyebrow}>SHOP THOUGHTFULLY</Text><Title>{title}</Title><Text style={styles.description}>{description}</Text></View>
    <View style={styles.filters}><Text style={styles.filterLabel}>SORT BY</Text><View style={styles.sortRow}>{sortChoices.map(choice => <Pressable key={choice.value} accessibilityRole="button" accessibilityState={{ selected: sort === choice.value }} onPress={() => setSort(choice.value)} style={[styles.chip, sort === choice.value && styles.chipSelected]}><Text style={[styles.chipText, sort === choice.value && styles.chipTextSelected]}>{choice.label}</Text></Pressable>)}</View>
      <View style={styles.priceRow}>{!categorySlug && <TextInput accessibilityLabel="Category slug filter" value={category} onChangeText={setCategory} placeholder="Category" autoCapitalize="none" style={styles.filterInput} />}<TextInput accessibilityLabel="Store slug filter" value={store} onChangeText={setStore} placeholder="Store" autoCapitalize="none" style={styles.filterInput} /><TextInput accessibilityLabel="Minimum price" value={minPrice} onChangeText={setMinPrice} placeholder="Min ₹" keyboardType="decimal-pad" style={styles.filterInput} /><TextInput accessibilityLabel="Maximum price" value={maxPrice} onChangeText={setMaxPrice} placeholder="Max ₹" keyboardType="decimal-pad" style={styles.filterInput} /></View>
      <Pressable accessibilityRole="button" onPress={applyFilters} style={styles.apply}><Text style={styles.applyText}>Apply filters</Text></Pressable>
    </View>
    {loading && !result ? <Message title="Finding good things" body="Loading public products from the KiliCart catalogue." /> : null}
    {error ? <ErrorMessage message={error} onRetry={() => void load()} /> : null}
    {result?.items.length ? <><SectionHeading title={`${result.items.length} ${result.items.length === 1 ? 'product' : 'products'}`} /><ProductGrid products={result.items} />{(result.pagination.page > 1 || result.pagination.hasMore) ? <View style={styles.pagination}><Pressable disabled={result.pagination.page <= 1} onPress={() => changePage(result.pagination.page - 1)}><Text style={[styles.pageButton, result.pagination.page <= 1 && styles.pageDisabled]}>← Previous</Text></Pressable><Text style={styles.pageNumber}>Page {result.pagination.page}</Text><Pressable disabled={!result.pagination.hasMore} onPress={() => changePage(result.pagination.page + 1)}><Text style={[styles.pageButton, !result.pagination.hasMore && styles.pageDisabled]}>Next →</Text></Pressable></View> : null}</> : null}
    {result && !result.items.length ? <Message title="No public products here yet" body="Products will appear when local stores are approved to sell publicly." /> : null}
  </>;
  return embedded ? <View>{content}</View> : <Screen refreshing={refreshing} onRefresh={() => void load(filters, true)}>{content}</Screen>;
}
const styles = StyleSheet.create({ intro: { paddingTop: 18, gap: 8 }, eyebrow: { color: colors.green, fontWeight: '800', fontSize: 10, letterSpacing: 1.3 }, description: { color: colors.muted, fontSize: 13, lineHeight: 20, marginBottom: 5 }, filters: { marginTop: 14, padding: 13, borderRadius: radii.md, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line }, filterLabel: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1 }, sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 }, chip: { paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 99 }, chipSelected: { borderColor: colors.green, backgroundColor: colors.pale }, chipText: { color: colors.muted, fontSize: 10, fontWeight: '600' }, chipTextSelected: { color: colors.forest }, priceRow: { flexDirection: 'row', gap: 7, marginTop: 11 }, filterInput: { flex: 1, minWidth: 0, minHeight: 39, paddingHorizontal: 8, borderWidth: 1, borderRadius: 9, borderColor: colors.line, fontSize: 11, color: colors.ink }, apply: { alignSelf: 'flex-end', padding: 7, marginTop: 4 }, applyText: { color: colors.green, fontSize: 12, fontWeight: '800' }, pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 20 }, pageButton: { color: colors.green, fontSize: 12, fontWeight: '700', padding: 8 }, pageDisabled: { color: '#AEB7B0' }, pageNumber: { color: colors.muted, fontSize: 12 } });
