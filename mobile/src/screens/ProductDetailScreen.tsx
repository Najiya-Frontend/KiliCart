import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Button, ErrorMessage, Eyebrow, Message, Screen, Title } from '@/components/ui';
import { validImage, formatPrice } from '@/components/catalogue';
import { useResource } from '@/hooks/useResource';
import { getProduct } from '@/services/catalogue';
import { colors, radii } from '@/theme/tokens';

export default function ProductDetailScreen() {
  const { width } = useWindowDimensions();
  const [failedImages,setFailedImages]=useState<string[]>([]);
  const { slug: rawSlug } = useLocalSearchParams<{ slug: string }>(); const slug = Array.isArray(rawSlug) ? rawSlug[0] : rawSlug;
  const loadProduct = useCallback(() => getProduct(slug), [slug]);
  const { data, loading, error, reload } = useResource(loadProduct, slug);
  if (loading && !data) return <Screen><Message title="Finding this product" body="Loading current product information." /></Screen>;
  if (error && !data) return <Screen><ErrorMessage message={error} onRetry={() => void reload()} /></Screen>;
  if (!data) return <Screen><Message title="Product unavailable" body="This product may have been unpublished or removed." /></Screen>;
  const images = data.images.map(image => ({ ...image, uri: validImage(image.url) })).filter(image => image.uri&&!failedImages.includes(image.url));
  return <Screen><ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.gallery}>
    {images.length ? images.map(image => <Image key={image.url} source={{ uri: image.uri! }} contentFit="cover" cachePolicy="memory-disk" accessibilityLabel={image.altText || data.name} onError={()=>setFailedImages(old=>old.includes(image.url)?old:[...old,image.url])} style={[styles.image, { width }]} />) : <View style={[styles.imageFallback, { width }]}><Text style={styles.art}>✦</Text></View>}
  </ScrollView>
    <View style={styles.info}><Eyebrow>{data.category.name}</Eyebrow><Title>{data.name}</Title><Text style={styles.price}>{formatPrice(data.price)}</Text><Text style={[styles.stock, data.stockQuantity > 0 && styles.stockAvailable]}>{data.stockQuantity > 0 ? `${data.stockQuantity} available` : 'Currently out of stock'}</Text>
      {data.description ? <Text style={styles.description}>{data.description}</Text> : null}
      <View style={styles.seller}><View style={styles.sellerAvatar}><Text style={styles.sellerMark}>{data.store.name.slice(0, 1).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={styles.sellerLabel}>SOLD BY</Text><Text style={styles.sellerName}>{data.store.name}</Text></View><Button title="Visit store" secondary onPress={() => router.push({ pathname: '/stores/[slug]', params: { slug: data.store.slug } })} /></View>
      <Button title="Add to cart · Coming soon" disabled onPress={() => undefined} />
      <Text style={styles.phaseNote}>Cart and checkout will be available in a future update.</Text>
    </View>
  </Screen>;
}
const styles = StyleSheet.create({ gallery: { height: 330, flexGrow: 0, marginHorizontal: -15, backgroundColor: '#F0F2EC' }, image: { height: '100%', backgroundColor: '#F0F2EC' }, imageFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pale }, art: { color: '#9FB39A', fontSize: 68 }, info: { paddingTop: 20, gap: 10 }, price: { color: colors.forest, fontSize: 24, fontWeight: '800', marginTop: 5 }, stock: { color: colors.muted, fontSize: 12, fontWeight: '700' }, stockAvailable: { color: colors.success }, description: { color: '#68766D', fontSize: 14, lineHeight: 23, marginTop: 4 }, seller: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, marginVertical: 6, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line }, sellerAvatar: { width: 46, height: 46, borderRadius: radii.md, backgroundColor: colors.pale, alignItems: 'center', justifyContent: 'center' }, sellerMark: { color: colors.green, fontFamily: 'Georgia', fontSize: 22 }, sellerLabel: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1 }, sellerName: { color: colors.ink, fontWeight: '800', fontSize: 13, marginTop: 4 }, phaseNote: { textAlign: 'center', color: colors.muted, fontSize: 10, marginTop: 4 } });
