// Moldura das telas de login/cadastro (README de design, "Telas novas"):
// fundo ink com brilho laranja no topo, logo 64 e cartão branco.
import type { ReactNode } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, radius } from '@/theme/tokens';

const logo = require('../../../assets/brand/logo-tile-dark.png');

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.glow} pointerEvents="none" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Image source={logo} style={styles.logo} accessibilityIgnoresInvertColors accessibilityLabel="Gestão Fácil" />
          <Text style={styles.brand}>Gestão Fácil</Text>
          <View style={styles.card}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ink },
  flex: { flex: 1 },
  glow: {
    position: 'absolute',
    top: -160,
    right: -120,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: colors.primary,
    opacity: 0.35,
  },
  content: { flexGrow: 1, justifyContent: 'center', padding: 20, gap: 14 },
  logo: { width: 64, height: 64, borderRadius: 18, alignSelf: 'center' },
  brand: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.white, textAlign: 'center', marginBottom: 6 },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 20, gap: 14 },
  title: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.ink, letterSpacing: -0.4 },
  subtitle: { fontFamily: fonts.medium, fontSize: 13, color: colors.gray600, lineHeight: 19, marginTop: -6 },
});
