import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CategoryTile, ProductGrid, StoreCard } from '@/components/catalogue';
import { ErrorMessage, Eyebrow, Message, Screen, SectionHeading, Title } from '@/components/ui';
import { searchCatalogue } from '@/services/catalogue';
import type { SearchData } from '@/types/catalogue';
import { colors, radii } from '@/theme/tokens';

export default function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string }>(); const initial = Array.isArray(params.q) ? params.q[0] : params.q || '';
  const [query, setQuery] = useState(initial); const [submitted, setSubmitted] = useState(initial); const [data, setData] = useState<SearchData | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [page, setPage] = useState(1); const [hasMore, setHasMore] = useState(false); const [requestVersion, setRequestVersion] = useState(0);
  useEffect(() => { if (initial === submitted) return; setQuery(initial); setSubmitted(initial); setPage(1); setRequestVersion(version => version + 1); }, [initial]);
  useEffect(() => {
    if (!submitted.trim()) { setData(null); setLoading(false); return; }
    let active = true; setLoading(true); setError('');
    void searchCatalogue(submitted.trim(), page).then(result => {
      if (!active) return;
      setData(current => page === 1 ? result.data : current ? ({ products: [...current.products, ...result.data.products], stores: [...current.stores, ...result.data.stores], categories: [...current.categories, ...result.data.categories] }) : result.data);
      setHasMore(result.pagination.hasMore);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Search failed.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [submitted, page, requestVersion]);
  function submit() { const q = query.trim(); setPage(1); setData(null); setSubmitted(q); setRequestVersion(version => version + 1); if (q) router.setParams({ q }); else router.setParams({ q: undefined }); }
  const hasResults = Boolean(data && (data.products.length || data.stores.length || data.categories.length));
  return <Screen><View style={styles.header}><Eyebrow>FIND YOUR NEXT GOOD THING</Eyebrow><Title>Search KiliCart</Title></View><View style={styles.search}><TextInput accessibilityLabel="Search products, stores and categories" value={query} onChangeText={setQuery} placeholder="Try pickles, pottery, hair oil…" returnKeyType="search" onSubmitEditing={submit} style={styles.input} /><Pressable accessibilityRole="button" onPress={submit} style={styles.button}><Text style={styles.buttonText}>Search</Text></Pressable></View>
    {loading ? <Message title="Looking around" body="Searching public products, stores and categories." /> : null}
    {error ? <ErrorMessage message={error} onRetry={submit} /> : null}
    {!submitted.trim() && !loading ? <Message title="What are you looking for?" body="Search products, local makers and categories in the KiliCart marketplace." /> : null}
    {data && !hasResults && !loading && !error ? <Message title="No results yet" body={`We couldn’t find public matches for “${submitted}”. Try a different search.`} /> : null}
    {data?.products.length ? <><SectionHeading title="Products" /><ProductGrid products={data.products} /></> : null}
    {data?.stores.length ? <><SectionHeading title="Local stores" />{data.stores.map(store => <StoreCard key={store.id} store={store} />)}</> : null}
    {data?.categories.length ? <><SectionHeading title="Categories" /><View style={styles.categories}>{data.categories.map(category => <CategoryTile key={category.id} category={category} />)}</View></> : null}
    {hasMore && <Pressable accessibilityRole="button" disabled={loading} onPress={() => setPage(current => current + 1)} style={styles.more}><Text style={styles.moreText}>{loading ? 'Loading…' : 'Load more results'}</Text></Pressable>}
    <Text style={styles.note}>Search results and filters reflect what the catalogue API currently supports.</Text>
  </Screen>;
}
const styles = StyleSheet.create({ header: { gap: 9, paddingVertical: 18 }, search: { flexDirection: 'row', gap: 7 }, input: { flex: 1, height: 50, paddingHorizontal: 13, borderWidth: 1, borderColor: colors.line, borderRadius: radii.sm, backgroundColor: '#fff', fontSize: 13, color: colors.ink }, button: { minWidth: 78, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm, backgroundColor: colors.forest, paddingHorizontal: 13 }, buttonText: { color: '#fff', fontSize: 12, fontWeight: '800' }, categories: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 }, more: { padding: 14, marginTop: 12, alignItems: 'center', borderRadius: 10, backgroundColor: colors.pale }, moreText: { color: colors.forest, fontSize: 12, fontWeight: '800' }, note: { color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 22 } });
