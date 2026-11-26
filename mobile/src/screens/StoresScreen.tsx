import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StoreCard } from '@/components/catalogue';
import { ErrorMessage, Eyebrow, Message, Screen, Title } from '@/components/ui';
import { getStores } from '@/services/catalogue';
import type { Store } from '@/types/catalogue';
import { colors } from '@/theme/tokens';

export default function StoresScreen() {
  const [stores, setStores] = useState<Store[] | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [page, setPage] = useState(1); const [hasMore, setHasMore] = useState(false);
  async function load(nextPage = 1, append = false) { if (append) setRefreshing(true); else setLoading(true); setError(''); try { const result = await getStores(nextPage); setStores(current => append ? [...(current || []), ...result.items] : result.items); setPage(result.pagination.page); setHasMore(result.pagination.hasMore); } catch (e) { setError(e instanceof Error ? e.message : 'Stores could not be loaded.'); } finally { setLoading(false); setRefreshing(false); } }
  useEffect(() => { void load(); }, []);
  return <Screen refreshing={refreshing} onRefresh={() => void load(1)}><View style={styles.intro}><Eyebrow>SMALL BUSINESSES, BIG HEART</Eyebrow><Title>Local stores</Title><Text style={styles.description}>Meet the makers and businesses behind the things you find here.</Text></View>
    {loading && !stores ? <Message title="Finding local makers" body="Loading public storefronts from KiliCart." /> : null}
    {error ? <ErrorMessage message={error} onRetry={() => void load()} /> : null}
    {stores?.map(store => <StoreCard key={store.id} store={store} />)}
    {stores && stores.length === 0 ? <Message title="No public stores just yet" body="Stores appear here only after they are approved for public viewing." /> : null}
    {hasMore && <Text accessibilityRole="button" onPress={() => void load(page + 1, true)} style={styles.more}>Load more</Text>}
  </Screen>;
}
const styles = StyleSheet.create({ intro: { paddingVertical: 18, gap: 9 }, description: { color: colors.muted, fontSize: 13, lineHeight: 20 }, more: { textAlign: 'center', padding: 16, color: colors.green, fontWeight: '800' } });
