import { StyleSheet, Text, View } from 'react-native';

import type { OrderStatus } from '@/config/business';
import { colors, fonts, radius } from '@/theme/tokens';

const STYLE: Record<OrderStatus | 'late', { bg: string; fg: string }> = {
  received: { bg: colors.primaryTint, fg: colors.primaryText },
  confirmed: { bg: colors.primaryTint, fg: colors.primaryText },
  in_progress: { bg: '#EEF0F3', fg: colors.gray700 },
  completed: { bg: colors.graphite, fg: colors.white },
  delivered: { bg: colors.gray100, fg: colors.gray500 },
  cancelled: { bg: colors.gray100, fg: colors.gray500 },
  late: { bg: colors.primary, fg: colors.white },
};

export function StatusChip({ status, label, late }: { status: OrderStatus; label: string; late?: boolean }) {
  const s = STYLE[late ? 'late' : status];
  return (
    <View style={[styles.chip, { backgroundColor: s.bg }]}>
      <Text style={[styles.text, { color: s.fg }, status === 'cancelled' && styles.strike]}>{late ? 'Atrasado' : label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-end' },
  text: { fontFamily: fonts.bold, fontSize: 10 },
  strike: { textDecorationLine: 'line-through' },
});
