import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatShortDate } from '@/features/finance/logic';
import { formatCents } from '@/lib/money';
import { colors, fonts, radius } from '@/theme/tokens';

import type { PurchaseSummary } from './api';

/** Linha de compra: número, fornecedor, data, itens, valor e situação do pagamento. */
export function PurchaseRow({ purchase: p, first, hideSupplier }: { purchase: PurchaseSummary; first?: boolean; hideSupplier?: boolean }) {
  const cancelled = p.status === 'cancelled';
  const status = cancelled ? 'Cancelada' : p.total_cents === 0 ? 'Sem valor' : p.open_cents === 0 ? 'Paga' : p.paid_cents > 0 ? 'Parcial' : 'A pagar';
  const open = status === 'A pagar' || status === 'Parcial';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/compras/[id]', params: { id: p.id } })}
      style={({ pressed }) => [styles.row, !first && styles.divider, pressed && styles.pressed]}
    >
      <View style={styles.flex}>
        <Text style={styles.title} numberOfLines={1}>
          #{p.number}
          {hideSupplier ? '' : ` · ${p.supplier_name ?? 'Sem fornecedor'}`}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {formatShortDate(p.purchase_date)} · {p.items_summary}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.amount, cancelled && styles.strike]}>{formatCents(p.total_cents)}</Text>
        <View style={[styles.chip, open ? styles.chipOpen : styles.chipDone]}>
          <Text style={[styles.chipText, open ? styles.chipTextOpen : styles.chipTextDone]}>{status}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  pressed: { backgroundColor: colors.rowPressed },
  title: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  sub: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  right: { alignItems: 'flex-end', gap: 4 },
  amount: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.ink },
  strike: { textDecorationLine: 'line-through', color: colors.gray400 },
  chip: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  chipOpen: { backgroundColor: colors.primaryTint },
  chipDone: { backgroundColor: colors.gray100 },
  chipText: { fontFamily: fonts.bold, fontSize: 10 },
  chipTextOpen: { color: colors.primaryText },
  chipTextDone: { color: colors.gray500 },
});
