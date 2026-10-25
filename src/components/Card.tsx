import type { ReactNode } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';

import { colors, radius, shadows, spacing } from '@/theme/tokens';

import { FadeIn } from './motion';

/** Cartão branco das telas; entra com uma animação curta ao aparecer. */
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return (
    <FadeIn distance={8} duration={320} style={[styles.card, style]}>
      {children}
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.cardPadding,
    gap: spacing.gap,
    ...shadows.card,
  },
});
