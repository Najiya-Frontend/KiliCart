import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ProductGrid } from '@/components/catalogue';
import { ErrorMessage, Eyebrow, Message, Screen, SectionHeading, Title } from '@/components/ui';
import { useResource } from '@/hooks/useResource';
import { getStore, getStoreProducts } from '@/services/catalogue';
import { colors, radii } from '@/theme/tokens';

export default function StorefrontScreen() {
  const { slug: rawSlug } = useLocalSearchParams<{ slug: string }>(); const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  const loadStore = useCallback(async () => { const [store, products] = await Promise.all([getStore(slug), getStoreProducts(slug)]); return { store, products: products.items }; }, [slug]);
  const { data, loading, error, reload } = useResource(loadStore, slug);
  if (loading && !data) return <Screen><Message title="Opening local store" body="Loading the public storefront." /></Screen>;
  if (error && !data) return <Screen><ErrorMessage message={error} onRetry={() => void reload()} /></Screen>;
  if (!data) return <Screen><Message title="Store unavailable" body="This store isn’t currently available to the public." /></Screen>;
  return <Screen><View style={styles.banner}><View style={styles.logo}><Text style={styles.logoText}>{data.store.name.trim().slice(0, 1).toUpperCase()}</Text></View><Eyebrow>LOCAL BUSINESS</Eyebrow><Title>{data.store.name}</Title>{data.store.description ? <Text style={styles.description}>{data.store.description}</Text> : null}</View>
    <View style={styles.about}><Text style={styles.aboutTitle}>About this store</Text><Text style={styles.description}>{data.store.description || 'A local business sharing thoughtfully made products.'}</Text></View>
    <SectionHeading title="Products from this store" />
    {data.products.length ? <ProductGrid products={data.products} /> : <Message title="No public products yet" body="Public products appear here after the store is approved and its catalogue is published." />}
  </Screen>;
}
const styles = StyleSheet.create({ banner: { minHeight: 210, justifyContent: 'flex-end', alignItems: 'flex-start', gap: 8, backgroundColor: colors.pale, borderRadius: radii.lg, padding: 20, marginTop: 12 }, logo: { position: 'absolute', top: 17, right: 18, width: 70, height: 70, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }, logoText: { color: colors.green, fontFamily: 'Georgia', fontSize: 34 }, description: { color: colors.muted, fontSize: 13, lineHeight: 20 }, about: { paddingTop: 22 }, aboutTitle: { color: colors.forest, fontSize: 17, fontWeight: '800', marginBottom: 6 } });
