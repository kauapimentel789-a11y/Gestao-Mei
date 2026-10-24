import { router } from 'expo-router';
import { FileText } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { DetailBar } from '@/components/DetailBar';
import { Fab } from '@/components/Fab';
import { QueryStates } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { formatShortDate, toISODate } from '@/features/finance/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { useQuotes } from '@/features/quotes/api';
import { isExpired, quoteLabel } from '@/features/quotes/logic';
import { formatCents } from '@/lib/money';
import { colors, fonts, radius } from '@/theme/tokens';

export default function QuotesScreen() {
  const { orgId } = useOrg();
  const list = useQuotes(orgId);
  const today = toISODate(new Date());

  return (
    <View style={styles.flex}>
      <Screen>
        <DetailBar title="Orçamentos" />
        <Card style={styles.list}>
          <QueryStates
            query={list}
            isEmpty={list.data?.length === 0}
            empty={{
              icon: FileText,
              title: 'Nenhum orçamento ainda',
              description: 'Monte um orçamento, mande pelo WhatsApp e, quando o cliente aprovar, transforme em pedido com um toque.',
              action: { label: 'Criar orçamento', onPress: () => router.push({ pathname: '/pedidos/novo', params: { orcamento: '1' } }) },
            }}
          />
          {list.data?.map((q, i) => {
            const open = q.status === 'draft' || q.status === 'sent';
            const expired = isExpired(q, today);
            return (
              <Pressable
                key={q.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/orcamentos/[id]', params: { id: q.id } })}
                style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed]}
              >
                <View style={styles.flex}>
                  <Text style={styles.title} numberOfLines={1}>
                    #{q.number} · {q.customer_name ?? 'Sem cliente'}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {formatShortDate(q.created_at.slice(0, 10))}
                    {q.valid_until ? ` · válido até ${formatShortDate(q.valid_until)}` : ''}
                    {q.items_summary ? ` · ${q.items_summary}` : ''}
                  </Text>
                </View>
                <View style={styles.right}>
                  <Text style={[styles.amount, !open && q.status !== 'approved' && styles.strike]}>{formatCents(q.total_cents)}</Text>
                  <View style={[styles.chip, open && !expired ? styles.chipOpen : styles.chipDone]}>
                    <Text style={[styles.chipText, open && !expired ? styles.chipTextOpen : styles.chipTextDone]}>
                      {q.order_number ? `Pedido #${q.order_number}` : quoteLabel(q, today)}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </Card>
        <View style={styles.fabSpace} />
      </Screen>
      <Fab label="Novo orçamento" onPress={() => router.push({ pathname: '/pedidos/novo', params: { orcamento: '1' } })} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  list: { paddingVertical: 4, gap: 0 },
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
  fabSpace: { height: 70 },
});
