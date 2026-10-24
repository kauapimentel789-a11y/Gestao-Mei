import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatCents } from '@/lib/money';
import { colors, fonts, radius } from '@/theme/tokens';

import type { EntryOverview } from './api';
import { type EntryStatus, formatShortDate, statusLabel } from './logic';

const CHIP: Record<EntryStatus, { bg: string; fg: string }> = {
  pending: { bg: colors.gray100, fg: colors.gray700 },
  partial: { bg: colors.primaryTint, fg: colors.primaryText },
  overdue: { bg: colors.primary, fg: colors.white },
  paid: { bg: colors.graphite, fg: colors.white },
  cancelled: { bg: colors.gray100, fg: colors.gray400 },
};

export function EntryStatusChip({ entry }: { entry: Pick<EntryOverview, 'status' | 'direction'> }) {
  const s = CHIP[entry.status];
  return (
    <View style={[styles.chip, { backgroundColor: s.bg }]}>
      <Text style={[styles.chipText, { color: s.fg }]}>{statusLabel(entry.status, entry.direction)}</Text>
    </View>
  );
}

/** Linha de título: mostra o valor em aberto quando há, senão o valor total. */
export function EntryRow({ entry }: { entry: EntryOverview }) {
  const showOpen = entry.open_cents > 0 && entry.open_cents !== entry.amount_cents;
  const sign = entry.direction === 'receivable' ? '+' : '−';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/financeiro/[id]', params: { id: entry.id } })}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.flex}>
        <Text style={styles.title} numberOfLines={1}>
          {entry.description}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {entry.status === 'paid' || entry.status === 'cancelled' ? '' : `Vence ${formatShortDate(entry.due_date)} · `}
          {entry.customer_name ?? entry.supplier_name ?? entry.category_name}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.amount, entry.status === 'cancelled' && styles.strike]}>
          {sign} {formatCents(showOpen ? entry.open_cents : entry.amount_cents)}
        </Text>
        {showOpen ? <Text style={styles.sub}>de {formatCents(entry.amount_cents)}</Text> : null}
        <EntryStatusChip entry={entry} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10 },
  pressed: { backgroundColor: colors.rowPressed },
  flex: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  sub: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  right: { alignItems: 'flex-end', gap: 3 },
  amount: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.ink },
  strike: { textDecorationLine: 'line-through', color: colors.gray400 },
  chip: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontFamily: fonts.bold, fontSize: 10 },
});
