// Contas a pagar: títulos fora do cartão e faturas em aberto, numa lista só,
// agrupadas por vencimento (vencidas, próximos 7 dias, mais para frente).
import { router } from 'expo-router';
import { ReceiptText } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { DetailBar } from '@/components/DetailBar';
import { QueryStates } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { TextLink } from '@/components/TextLink';
import { BillRow, useBills } from '@/features/cards/BillsList';
import { DUE_GROUP_LABEL, type DueGroup, dueGroup } from '@/features/cards/logic';
import { toISODate } from '@/features/finance/logic';
import { useSpace } from '@/features/organizations/useOrg';
import { formatCents } from '@/lib/money';
import { colors, fonts } from '@/theme/tokens';

const GROUPS: DueGroup[] = ['overdue', 'soon', 'later'];

export default function BillsScreen() {
  const { orgId } = useSpace();
  const bills = useBills(orgId);
  const today = toISODate(new Date());
  const total = bills.items.reduce((s, b) => s + b.openCents, 0);

  return (
    <Screen>
      <DetailBar title="Contas a pagar" />

      {bills.items.length > 0 ? (
        <Card>
          <Text style={styles.muted}>Total em aberto</Text>
          <Text style={styles.amount}>{formatCents(total)}</Text>
          <Text style={styles.muted}>Compras no cartão aparecem como uma linha só, na fatura do mês.</Text>
        </Card>
      ) : null}

      <QueryStates
        query={bills}
        isEmpty={bills.items.length === 0}
        empty={{
          icon: ReceiptText,
          title: 'Nada para pagar',
          description: 'Contas lançadas como "a pagar", parcelas de carnê e faturas de cartão aparecem aqui.',
          action: { label: 'Lançar uma conta', onPress: () => router.push('/financeiro/lancamento') },
        }}
      />

      {GROUPS.map((g) => {
        const list = bills.items.filter((b) => dueGroup(b.dueDate, today) === g);
        if (list.length === 0) return null;
        return (
          <Card key={g} style={styles.list}>
            <Text style={styles.cardTitle}>
              {DUE_GROUP_LABEL[g]} · {formatCents(list.reduce((s, b) => s + b.openCents, 0))}
            </Text>
            {list.map((b, i) => (
              <View key={b.key} style={i > 0 && styles.divider}>
                <BillRow item={b} overdue={g === 'overdue'} />
              </View>
            ))}
          </Card>
        );
      })}

      <TextLink label="Lançar compra parcelada" onPress={() => router.push('/financeiro/parcelado')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  amount: { fontFamily: fonts.extrabold, fontSize: 28, letterSpacing: -0.5, color: colors.ink },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink, paddingVertical: 8 },
  list: { gap: 0, paddingVertical: 4 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
});
