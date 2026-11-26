import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radii, shadow, space } from '@/theme/tokens';

export function Screen({ children, scroll = true, refreshing, onRefresh }: PropsWithChildren<{ scroll?: boolean; refreshing?: boolean; onRefresh?: () => void }>) {
  if (!scroll) return <SafeAreaView edges={['top']} style={styles.screen}>{children}</SafeAreaView>;
  return <SafeAreaView edges={['top']} style={styles.screen}><ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={colors.green} /> : undefined}>{children}</ScrollView></SafeAreaView>;
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return <View style={styles.brandRow}><View style={styles.brandMark}><Text style={styles.brandLeaf}>K</Text></View><View><Text style={[styles.brandName, compact && { fontSize: 19 }]}>KiliCart</Text>{!compact && <Text style={styles.brandTagline}>Shop Local · Shop Smart</Text>}</View></View>;
}

export function Eyebrow({ children }: PropsWithChildren) { return <Text style={styles.eyebrow}>{children}</Text>; }
export function Title({ children, small = false }: PropsWithChildren<{ small?: boolean }>) { return <Text style={[styles.title, small && styles.titleSmall]}>{children}</Text>; }
export function SectionHeading({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{title}</Text>{action && onAction ? <Pressable accessibilityRole="button" onPress={onAction}><Text style={styles.actionText}>{action}</Text></Pressable> : null}</View>;
}
export function Button({ title, onPress, disabled, secondary, loading }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean; loading?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.buttonSecondary, (disabled || loading) && styles.disabled, pressed && !disabled && styles.pressed]}>{loading ? <ActivityIndicator color={secondary ? colors.green : '#fff'} /> : <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText]}>{title}</Text>}</Pressable>;
}
export function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize = 'none', autoComplete, multiline }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; secureTextEntry?: boolean; keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'decimal-pad' | 'number-pad'; autoCapitalize?: 'none' | 'words'; autoComplete?: 'email' | 'name' | 'password' | 'new-password'; multiline?: boolean }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#9BA69E" secureTextEntry={secureTextEntry} keyboardType={keyboardType} autoCapitalize={autoCapitalize} autoComplete={autoComplete} multiline={multiline} style={[styles.input, multiline && styles.inputMultiline]} /></View>;
}
export function Message({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return <View style={styles.message}><View style={styles.messageGlyph}><Text style={styles.glyphText}>✦</Text></View><Text style={styles.messageTitle}>{title}</Text><Text style={styles.messageBody}>{body}</Text>{action}</View>;
}
export function ErrorMessage({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <View style={styles.errorBox} accessibilityRole="alert"><Text style={styles.errorTitle}>We couldn’t load this</Text><Text style={styles.messageBody}>{message}</Text><Pressable onPress={onRetry} accessibilityRole="button"><Text style={styles.actionText}>Try again</Text></Pressable></View>;
}
export function InlineNotice({ children }: PropsWithChildren) { return <Text accessibilityRole="alert" style={styles.inlineError}>{children}</Text>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas }, scroll: { paddingHorizontal: space.md, paddingBottom: 42 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, brandMark: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' }, brandLeaf: { color: '#fff', fontSize: 21, fontWeight: '800', fontFamily: 'Georgia' }, brandName: { color: colors.forest, fontSize: 23, fontWeight: '800', letterSpacing: -0.7 }, brandTagline: { color: colors.muted, fontSize: 9, letterSpacing: 1.2, marginTop: 1 },
  eyebrow: { color: colors.green, fontWeight: '800', fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase' }, title: { color: colors.forest, fontSize: 34, lineHeight: 40, fontWeight: '500', letterSpacing: -1, fontFamily: 'Georgia' }, titleSmall: { fontSize: 26, lineHeight: 32 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xl, marginBottom: space.md }, sectionTitle: { color: colors.ink, fontSize: 20, fontWeight: '700', letterSpacing: -0.4 }, actionText: { color: colors.green, fontWeight: '700', fontSize: 13, paddingVertical: 7 },
  button: { minHeight: 50, borderRadius: radii.sm, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, ...shadow }, buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' }, buttonSecondary: { backgroundColor: colors.pale, elevation: 0, shadowOpacity: 0 }, buttonSecondaryText: { color: colors.forest }, disabled: { opacity: 0.5 }, pressed: { opacity: 0.82 },
  field: { gap: 7, marginBottom: 14 }, fieldLabel: { color: colors.ink, fontSize: 13, fontWeight: '700' }, input: { minHeight: 49, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff', paddingHorizontal: 14, color: colors.ink, fontSize: 15 }, inputMultiline: { minHeight: 110, paddingTop: 12, textAlignVertical: 'top' },
  message: { minHeight: 235, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, borderWidth: 1, borderStyle: 'dashed', borderColor: '#D6E0D1', backgroundColor: '#F4F7F0', padding: 24, marginTop: 16 }, messageGlyph: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E6EFE1', marginBottom: 14 }, glyphText: { color: colors.green, fontSize: 22 }, messageTitle: { color: colors.forest, textAlign: 'center', fontSize: 20, fontWeight: '700' }, messageBody: { color: colors.muted, textAlign: 'center', fontSize: 13, lineHeight: 20, marginTop: 7 }, errorBox: { padding: 18, borderRadius: radii.sm, backgroundColor: '#FFF5F1', borderWidth: 1, borderColor: '#F0DDD4', marginVertical: 12, gap: 6 }, errorTitle: { color: colors.danger, fontWeight: '800', fontSize: 16 }, inlineError: { color: colors.danger, fontSize: 13, marginVertical: 6 },
});
