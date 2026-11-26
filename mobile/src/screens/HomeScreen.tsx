import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useCallback } from 'react';
import { CategoryStrip, ProductGrid, StoreCard, validImage } from '@/components/catalogue';
import { SearchBox } from '@/components/SearchBox';
import { Brand, ErrorMessage, Eyebrow, Message, Screen, SectionHeading, Title } from '@/components/ui';
import { useResource } from '@/hooks/useResource';
import { getHome } from '@/services/catalogue';
import { colors, radii, space } from '@/theme/tokens';

export default function HomeScreen() {
  const loadHome = useCallback(() => getHome(), []);
  const { data, loading, refreshing, error, reload } = useResource(loadHome);
  return <Screen refreshing={refreshing} onRefresh={() => void reload(true)}>
    <View style={styles.header}><Brand /><Pressable accessibilityRole="button" onPress={() => Alert.alert('Location', 'Local delivery coverage is not connected yet.')} style={styles.location}><Text style={styles.pin}>⌖</Text><View><Text style={styles.locationLabel}>SHOPPING FROM</Text><Text style={styles.locationValue}>Choose location <Text style={styles.down}>⌄</Text></Text></View></Pressable></View>
    <SearchBox />
    <View style={styles.hero}><View style={styles.heroCopy}><Eyebrow>MADE CLOSE TO HOME</Eyebrow><Title>Good finds.{ '\n' }Closer to home.</Title><Text style={styles.heroText}>Discover the independent makers and small businesses bringing more character to everyday life.</Text><Pressable onPress={() => router.push('/categories')} style={styles.heroLink}><Text style={styles.heroLinkText}>Explore local makers  →</Text></Pressable></View><View style={styles.heroArtwork}><View style={styles.sun} /><View style={styles.vase}><View style={styles.vaseLeafOne} /><View style={styles.vaseLeafTwo} /></View><View style={styles.pedestal} /></View></View>
    {loading && !data ? <Message title="A little moment" body="We’re gathering what’s new around the marketplace." /> : null}
    {error && !data ? <ErrorMessage message={error} onRetry={() => void reload()} /> : null}
    {data ? <>
      {data.promotionalBanners?.filter(banner => validImage(banner.imageUrl)).map(banner => <View key={banner.id} style={styles.bannerInfo}><Image source={{ uri: validImage(banner.imageUrl)! }} contentFit="cover" cachePolicy="memory-disk" accessibilityLabel={banner.altText} style={styles.promoImage} /><Text style={styles.bannerCopy}>{banner.altText}</Text></View>)}
      <SectionHeading title="Explore by category" action="See all" onAction={() => router.push('/categories')} />
      {data.categories.length ? <CategoryStrip categories={data.categories} /> : <Message title="Categories are on the way" body="There aren’t active categories to browse just yet." />}
      {data.featuredSellers.length ? <><SectionHeading title="Meet local makers" action="See all" onAction={() => router.push('/stores')} />{data.featuredSellers.slice(0, 4).map(store => <StoreCard key={store.id} store={store} />)}</> : null}
      {section('Trending right now', data.trendingProducts)}
      {section('Just arrived', data.newArrivals)}
      {section('Popular picks', data.popularProducts)}
      {section('Around your corner', data.localProducts)}
      {section('Courier available', data.courierProducts)}
      {section('Featured finds', data.featuredProducts)}
      {!data.featuredSellers.length && !data.featuredProducts.length && !data.trendingProducts.length && !data.newArrivals.length && !data.popularProducts?.length && !data.localProducts?.length && !data.courierProducts?.length ? <Message title="Local businesses are getting ready" body="The marketplace is open, but there are no public products or stores to browse yet. Check back as local makers join KiliCart." action={<Pressable onPress={() => router.push('/categories')}><Text style={styles.heroLinkText}>Browse categories →</Text></Pressable>} /> : null}
    </> : null}
    <Text style={styles.footer}>KiliCart · Shop Local · Shop Smart</Text>
  </Screen>;

  function section(title: string, products?: import('@/types/catalogue').Product[]) {
    if (!products?.length) return null;
    return <View><SectionHeading title={title} action="View all" onAction={() => router.push('/products')} /><ProductGrid products={products.slice(0, 6)} /></View>;
  }
}

const styles = StyleSheet.create({ header: { minHeight: 70, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }, location: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 10 }, pin: { color: colors.green, fontSize: 22 }, locationLabel: { color: colors.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.8 }, locationValue: { color: colors.ink, fontSize: 11, fontWeight: '700', marginTop: 2 }, down: { color: colors.green, fontSize: 15 }, hero: { minHeight: 252, flexDirection: 'row', alignItems: 'center', marginTop: 18, overflow: 'hidden', borderRadius: radii.lg, backgroundColor: '#EEF2E8', paddingLeft: 20 }, heroCopy: { flex: 1, paddingVertical: 20 }, heroText: { maxWidth: 240, marginTop: 10, color: '#657369', fontSize: 12, lineHeight: 18 }, heroLink: { alignSelf: 'flex-start', marginTop: 15, paddingVertical: 7 }, heroLinkText: { color: colors.forest, fontSize: 12, fontWeight: '800' }, heroArtwork: { width: 110, height: 190, alignSelf: 'flex-end', justifyContent: 'flex-end', alignItems: 'center' }, sun: { position: 'absolute', top: 19, right: 2, width: 90, height: 90, borderRadius: 45, backgroundColor: '#DEE7D4' }, vase: { width: 63, height: 100, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: '#C79972', marginBottom: 13, alignItems: 'center', justifyContent: 'flex-start' }, vaseLeafOne: { height: 72, width: 2, marginTop: -47, marginLeft: -26, backgroundColor: colors.green, transform: [{ rotate: '-23deg' }] }, vaseLeafTwo: { position: 'absolute', top: -55, left: 28, height: 56, width: 2, backgroundColor: colors.green, transform: [{ rotate: '16deg' }] }, pedestal: { position: 'absolute', bottom: 0, right: -10, left: -4, height: 20, borderTopLeftRadius: 26, backgroundColor: '#D5DFCC' }, bannerInfo: { marginTop: 15, backgroundColor: colors.pale, borderRadius: radii.sm, overflow: 'hidden' }, promoImage: { width: '100%', height: 130 }, bannerCopy: { color: colors.forest, fontWeight: '700', fontSize: 13, padding: 12 }, footer: { marginTop: space.xxl, paddingVertical: 20, textAlign: 'center', color: colors.muted, fontSize: 11 } });
