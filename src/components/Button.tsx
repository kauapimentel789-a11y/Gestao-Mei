import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, shadows } from '@/theme/tokens';

type Variant = 'primary' | 'ink' | 'tint' | 'outline';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  /** Conteúdo à direita (valor ou ícone), conforme o design. */
  trailing?: ReactNode;
  size?: 'large' | 'medium';
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
}

const palette: Record<Variant, { bg: string; pressed: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary, pressed: colors.primaryPressed, fg: colors.white },
  ink: { bg: colors.ink, pressed: colors.graphite, fg: colors.white },
  tint: { bg: colors.primaryTint, pressed: colors.primaryTintPressed, fg: colors.primaryText },
  outline: { bg: colors.surface, pressed: colors.rowPressed, fg: colors.ink, border: colors.gray200 },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  trailing,
  size = 'large',
  disabled,
  loading,
  accessibilityHint,
}: ButtonProps) {
  const p = palette[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        size === 'large' ? styles.large : styles.medium,
        { backgroundColor: pressed ? p.pressed : p.bg, opacity: inactive ? 0.6 : 1 },
        p.border ? { borderWidth: 1.5, borderColor: p.border } : null,
        variant === 'primary' && size === 'large' ? shadows.primaryButton : null,
      ]}
    >
      <Text style={[styles.label, { color: p.fg }]}>{label}</Text>
      <View>{loading ? <ActivityIndicator color={p.fg} /> : trailing}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  large: { minHeight: 56, borderRadius: radius.buttonLarge },
  medium: { minHeight: 48, borderRadius: radius.input },
  label: { fontFamily: fonts.extrabold, fontSize: 15 },
});
