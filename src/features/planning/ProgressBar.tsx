import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme/tokens';

import type { BudgetLevel } from './logic';

const FILL: Record<BudgetLevel, string> = { ok: colors.success, alert: colors.primary, over: colors.danger };

/** Barra de progresso; `ratio` de 0 a 1. */
export function ProgressBar({ ratio, level = 'ok', label }: { ratio: number; level?: BudgetLevel; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
    >
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: FILL[level] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.gray150, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
