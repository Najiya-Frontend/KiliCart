import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { colors, radii, shadow, space } from '@/theme/tokens';
import type { Category, Product, Store } from '@/types/catalogue';

export function validImage(value?: string | null) {
  if (!value || value.startsWith('//') || value.includes('\\')) return null;
  if (value.startsWith('/') && !value.startsWith('/\\')) return value;
  try { const url = new URL(value); return url.protocol === 'https:' ? url.toString() : null; } catch { return null; }
}
export function formatPrice(value: string) {
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) return `₹${value}`;
  const [whole, fraction] = value.split('.');
  return `₹${Number(whole).toLocaleString('en-IN')}${fraction ? `.${fraction.padEnd(2, '0')}` : ''}`;
}

export function CategoryTile({ category }: { category: Category }) {
  const image = validImage(category.imageUrl);
  return <Pressable accessibilityRole="button" accessibilityLabel={category.name} onPress={() => router.push({ pathname: '/categories/[slug]', params: { slug: category.slug } })} style={({ pressed }) => [styles.categoryTile, pressed && { opacity: 0.8 }]}>
    {image ? <Image source={{ uri: image }} contentFit="cover" cachePolicy="memory-disk" style={styles.categoryImage} accessibilityLabel={category.name} /> : <View style={styles.categoryArt}><Text style={styles.categoryInitial}>{category.name.slice(0, 1)}</Text></View>}
    <Text numberOfLines={2} style={styles.categoryName}>{category.name}</Text>
  </Pressable>;
}
export function CategoryStrip({ categories }: { categories: Category[] }) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryStrip}>{categories.map(category => <CategoryTile key={category.id} category={category} />)}</ScrollView>;
}
export function ProductCard({ product }: { product: Product }) {
  const uri = validImage(product.images?.[0]?.url);
  const [imageFailed,setImageFailed]=useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${product.name}, ${formatPrice(product.price)}`} onPress={() => router.push({ pathname: '/products/[slug]', params: { slug: product.slug } })} style={({ pressed }) => [styles.productCard, pressed && { opacity: 0.86 }]}>
    <View style={styles.productImageWrap}>{uri&&!imageFailed ? <Image source={{ uri }} contentFit="cover" cachePolicy="memory-disk" style={styles.productImage} accessibilityLabel={product.images[0]?.altText || product.name} onError={()=>setImageFailed(true)} /> : <View style={styles.productImageFallback}><Text style={styles.fallbackMark}>✦</Text></View>}
      <View style={[styles.stockPill, product.stockQuantity > 0 && styles.inStockPill]}><Text style={[styles.stockText, product.stockQuantity > 0 && styles.inStockText]}>{product.stockQuantity > 0 ? 'Available' : 'Out of stock'}</Text></View>
    </View>
    <View style={styles.productInfo}><Text numberOfLines={2} style={styles.productName}>{product.name}</Text><Text numberOfLines={1} style={styles.sellerName}>{product.store.name}</Text><Text style={styles.price}>{formatPrice(product.price)}</Text></View>
  </Pressable>;
}
export function ProductGrid({ products }: { products: Product[] }) {
  return <View style={styles.productGrid}>{products.map(product => <ProductCard key={product.id} product={product} />)}</View>;
}
export function StoreCard({ store }: { store: Store }) {
  return <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/stores/[slug]', params: { slug: store.slug } })} style={({ pressed }) => [styles.storeCard, pressed && { opacity: 0.82 }]}><View style={styles.storeAvatar}><Text style={styles.storeInitial}>{store.name.trim().slice(0, 1).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={styles.storeName}>{store.name}</Text><Text style={styles.sellerName} numberOfLines={1}>Independent local business</Text></View><Text style={styles.chevron}>›</Text></Pressable>;
}

const styles = StyleSheet.create({
  categoryStrip: { gap: 12, paddingVertical: 3, paddingRight: 15 }, categoryTile: { width: 100, alignItems: 'center', gap: 8 }, categoryImage: { width: 88, height: 88, borderRadius: 25, backgroundColor: colors.pale }, categoryArt: { width: 88, height: 88, borderRadius: 25, backgroundColor: colors.pale, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E1EADF' }, categoryInitial: { color: colors.green, fontFamily: 'Georgia', fontSize: 37 }, categoryName: { textAlign: 'center', color: colors.ink, fontSize: 12, fontWeight: '600', lineHeight: 16 },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }, productCard: { width: '48.1%', marginBottom: 3, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: '#fff', ...shadow }, productImageWrap: { position: 'relative', aspectRatio: 0.94, backgroundColor: '#F0F2EC', overflow: 'hidden' }, productImage: { width: '100%', height: '100%' }, productImageFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8EEE4' }, fallbackMark: { color: '#9EB095', fontSize: 38 }, stockPill: { position: 'absolute', left: 8, bottom: 8, paddingVertical: 4, paddingHorizontal: 8, borderRadius: radii.pill, backgroundColor: 'rgba(255,255,255,.94)' }, inStockPill: { backgroundColor: '#EFF6EA' }, stockText: { color: colors.muted, fontSize: 9, fontWeight: '700' }, inStockText: { color: colors.success }, productInfo: { paddingHorizontal: 11, paddingTop: 10, paddingBottom: 13, gap: 4 }, productName: { minHeight: 34, color: colors.ink, fontSize: 13, lineHeight: 17, fontWeight: '700' }, sellerName: { color: colors.muted, fontSize: 10 }, price: { color: colors.forest, fontSize: 15, fontWeight: '800', marginTop: 2 },
  storeCard: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 13, borderWidth: 1, borderColor: colors.line, borderRadius: radii.md, backgroundColor: '#fff', marginBottom: 10 }, storeAvatar: { width: 48, height: 48, borderRadius: 17, backgroundColor: colors.pale, alignItems: 'center', justifyContent: 'center' }, storeInitial: { color: colors.green, fontFamily: 'Georgia', fontSize: 23 }, storeName: { color: colors.ink, fontWeight: '800', fontSize: 14 }, chevron: { color: colors.green, fontSize: 28, paddingHorizontal: 5 },
});
