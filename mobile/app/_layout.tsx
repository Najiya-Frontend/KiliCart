import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/store/AuthContext';
import { colors } from '@/theme/tokens';

export default function RootLayout() {
  return <AuthProvider><StatusBar style="dark" /><Stack screenOptions={{ headerBackTitle: 'Back', headerTintColor: colors.forest, headerStyle: { backgroundColor: colors.canvas }, headerTitleStyle: { color: colors.forest, fontWeight: '700' }, contentStyle: { backgroundColor: colors.canvas } }}>
    <Stack.Screen name="index" options={{ headerShown: false }} />
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="search/index" options={{ title: 'Search' }} />
    <Stack.Screen name="categories/[slug]" options={{ title: 'Category' }} />
    <Stack.Screen name="products/index" options={{ title: 'Products' }} />
    <Stack.Screen name="products/[slug]" options={{ title: 'Product' }} />
    <Stack.Screen name="stores/index" options={{ title: 'Local stores' }} />
    <Stack.Screen name="stores/[slug]" options={{ title: 'Store' }} />
    <Stack.Screen name="seller/index" options={{ title: 'Seller workspace' }} />
    <Stack.Screen name="seller/application" options={{ title: 'Seller application' }} />
    <Stack.Screen name="seller/apply" options={{ title: 'Apply to sell' }} />
    <Stack.Screen name="seller/store" options={{ title: 'Store profile' }} />
    <Stack.Screen name="seller/products/index" options={{ title: 'Seller products' }} />
    <Stack.Screen name="seller/products/new" options={{ title: 'New product' }} />
    <Stack.Screen name="seller/products/[id]" options={{ title: 'Edit product' }} />
    <Stack.Screen name="auth/login" options={{ title: 'Sign in' }} />
    <Stack.Screen name="auth/register" options={{ title: 'Create account' }} />
    <Stack.Screen name="auth/verify-email" options={{ title: 'Verify email' }} />
    <Stack.Screen name="auth/forgot-password" options={{ title: 'Forgot password' }} />
    <Stack.Screen name="auth/reset-password" options={{ title: 'Reset password' }} />
  </Stack></AuthProvider>;
}
