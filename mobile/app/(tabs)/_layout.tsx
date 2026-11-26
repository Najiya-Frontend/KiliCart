import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { colors } from '@/theme/tokens';

const glyphs: Record<string, string> = { index: '⌂', categories: '▦', cart: '♧', account: '◉' };
export default function TabLayout() {
  return <Tabs screenOptions={({ route }) => ({ headerShown: false, tabBarActiveTintColor: colors.forest, tabBarInactiveTintColor: '#859088', tabBarLabelStyle: { fontSize: 10, fontWeight: '700', paddingBottom: 2 }, tabBarStyle: { height: 64, paddingTop: 7, borderTopColor: colors.line, backgroundColor: '#fff' }, tabBarIcon: ({ color }) => <View style={{ width: 30, height: 28, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color, fontSize: 23, lineHeight: 25 }}>{glyphs[route.name] || '•'}</Text></View> })}>
    <Tabs.Screen name="index" options={{ title: 'Home' }} />
    <Tabs.Screen name="categories" options={{ title: 'Categories' }} />
    <Tabs.Screen name="cart" options={{ title: 'Cart' }} />
    <Tabs.Screen name="account" options={{ title: 'Account' }} />
  </Tabs>;
}
