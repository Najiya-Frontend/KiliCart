import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CategoryTile } from '@/components/catalogue';
import { ErrorMessage, Eyebrow, Message, Screen, Title } from '@/components/ui';
import { useResource } from '@/hooks/useResource';
import { getCategories } from '@/services/catalogue';
import { colors, space } from '@/theme/tokens';

export default function CategoriesScreen() {
  const loadCategories = useCallback(() => getCategories(), []);
  const { data, loading, error, refreshing, reload } = useResource(loadCategories);
  return <Screen refreshing={refreshing} onRefresh={() => void reload(true)}><View style={styles.intro}><Eyebrow>A LITTLE BIT OF EVERYTHING</Eyebrow><Title>Browse categories</Title><Text style={styles.body}>From pantry staples to one-of-a-kind pieces, find something made with care.</Text></View>
    {loading && !data ? <Message title="Loading categories" body="Finding the active categories for you." /> : null}
    {error && !data ? <ErrorMessage message={error} onRetry={() => void reload()} /> : null}
    {data?.length ? <View style={styles.grid}>{data.map(category => <View key={category.id} style={styles.item}><CategoryTile category={category} />{category.children?.length ? <Text style={styles.subcategoryCount}>{category.children.length} {category.children.length === 1 ? 'collection' : 'collections'}</Text> : null}</View>)}</View> : null}
    {data && !data.length ? <Message title="No active categories yet" body="New collections will appear here when they’re ready to browse." /> : null}
  </Screen>;
}
const styles = StyleSheet.create({ intro: { paddingTop: 20, paddingBottom: 10, gap: 9 }, body: { color: colors.muted, fontSize: 13, lineHeight: 20, marginBottom: space.md }, grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 18, marginTop: 15 }, item: { width: '31%', alignItems: 'center' }, subcategoryCount: { color: colors.muted, fontSize: 9, marginTop: 5 } });
