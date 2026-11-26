import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ProductListingScreen from './ProductListingScreen';
import { ErrorMessage, Eyebrow, Message, Screen, Title } from '@/components/ui';
import { useResource } from '@/hooks/useResource';
import { getCategory } from '@/services/catalogue';
import { colors } from '@/theme/tokens';

export default function CategoryDetailScreen() {
  const { slug: rawSlug } = useLocalSearchParams<{ slug: string }>(); const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  const loadCategory = useCallback(() => getCategory(slug), [slug]);
  const { data, error, loading, reload } = useResource(loadCategory, slug);
  if (loading && !data) return <Screen><Message title="Opening collection" body="Loading category details." /></Screen>;
  if (error && !data) return <Screen><ErrorMessage message={error} onRetry={() => void reload()} /></Screen>;
  if (!data) return <Screen><Message title="Category unavailable" body="This category may no longer be active." /></Screen>;
  return <Screen><View style={styles.header}><Eyebrow>COLLECTION</Eyebrow><Title>{data.name}</Title>{data.description ? <Text style={styles.description}>{data.description}</Text> : null}</View>
    {data.children?.length ? <><Text style={styles.subTitle}>Explore a collection</Text>{data.children.map(child => <Pressable key={child.id} onPress={() => router.push({ pathname: '/categories/[slug]', params: { slug: child.slug } })} style={styles.child}><View><Text style={styles.childName}>{child.name}</Text>{child.description ? <Text numberOfLines={1} style={styles.description}>{child.description}</Text> : null}</View><Text style={styles.arrow}>›</Text></Pressable>)}</> : null}
    <ProductListingScreen categorySlug={slug} title={`${data.name} finds`} description="Explore the products in this active category." embedded />
  </Screen>;
}
const styles = StyleSheet.create({ header: { gap: 9, paddingTop: 17, paddingBottom: 14 }, description: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 3 }, subTitle: { color: colors.ink, fontSize: 16, fontWeight: '800', marginTop: 7, marginBottom: 8 }, child: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 62, borderWidth: 1, borderColor: colors.line, borderRadius: 12, backgroundColor: '#fff', paddingHorizontal: 15, marginBottom: 8 }, childName: { color: colors.forest, fontWeight: '700', fontSize: 13 }, arrow: { color: colors.green, fontSize: 27 } });
