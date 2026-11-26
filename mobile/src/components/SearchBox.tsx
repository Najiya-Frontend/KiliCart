import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radii } from '@/theme/tokens';

export function SearchBox({ initial = '', compact = false }: { initial?: string; compact?: boolean }) {
  const [query, setQuery] = useState(initial);
  function submit() { const q = query.trim(); router.push(q ? { pathname: '/search', params: { q } } : '/search'); }
  return <View style={[styles.wrap, compact && styles.compact]}><Text style={styles.icon}>⌕</Text><TextInput accessibilityLabel="Search KiliCart" value={query} onChangeText={setQuery} onSubmitEditing={submit} returnKeyType="search" placeholder="Pickles, pottery, something lovely…" placeholderTextColor="#929D95" style={styles.input} /><Pressable accessibilityRole="button" accessibilityLabel="Search" hitSlop={8} onPress={submit} style={styles.searchButton}><Text style={styles.arrow}>→</Text></Pressable></View>;
}
const styles = StyleSheet.create({ wrap: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 9, paddingLeft: 15, paddingRight: 5, borderWidth: 1, borderColor: colors.line, borderRadius: radii.sm, backgroundColor: '#fff' }, compact: { height: 46 }, icon: { color: colors.green, fontSize: 24, fontWeight: '400' }, input: { flex: 1, minWidth: 0, height: '100%', color: colors.ink, fontSize: 13 }, searchButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.pale, alignItems: 'center', justifyContent: 'center' }, arrow: { color: colors.forest, fontSize: 21, fontWeight: '700' } });
