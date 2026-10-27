// Linhas de contas a pagar: títulos e faturas, com o vencimento e o valor.
import { router } from 'expo-router';
import { CreditCard, ReceiptText } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatShortDate } from '@/features/finance/logic';
import { formatCents } from '@/lib/money';
import { colors, fonts, radius } from '@/theme/tokens';

import { useCards, useOpenBills, useStatements } from './api';
import { type BillItem, billsTimeline } from './logic';

/** Contas e faturas em aberto, juntas e por vencimento. */
export function useBills(orgId: string) {
  const bills = useOpenBills(orgId);
  const statements = useStatements(orgId);
  const cards = useCards(orgId);
  const cardName = (id: string) => cards.data?.find((c) => c.id === id)?.name ?? 'Cartão';
  const items = billsTimeline(bills.data ?? [], statements.data ?? [], cardName);
  return {
    items,
    isPending: bills.isPending || statements.isPending,
    error: bills.error ?? statements.error,
    refetch: () => Promise.all([bills.refetch(), statements.refetch(), cards.refetch()]),
  };
}

export function BillRow({ item, overdue }: { item: BillItem; overdue: boolean }) {
  const Icon = item.kind === 'statement' ? CreditCard : ReceiptText;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        item.kind === 'statement'
          ? router.push({ pathname: '/cartao/[id]', params: { id: item.id } })
          : router.push({ pathname: '/financeiro/[id]', params: { id: item.id } })
      }
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.icon, overdue && styles.iconOverdue]}>
        <Icon size={16} color={overdue ? colors.white : colors.primaryText} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[styles.due, overdue && styles.overdue]}>
          {overdue ? 'venceu' : 'vence'} {formatShortDate(item.dueDate)}
        </Text>
      </View>
      <Text style={styles.amount}>{formatCents(item.openCents)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  pressed: { backgroundColor: colors.rowPressed },
  icon: { width: 34, height: 34, borderRadius: radius.segmentedOption, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  iconOverdue: { backgroundColor: colors.primary },
  flex: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  due: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  overdue: { color: colors.primaryText, fontFamily: fonts.bold },
  amount: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.ink },
});
