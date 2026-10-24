import { router } from 'expo-router';
import { ShoppingCart, Truck } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { CircleButton, DetailBar } from '@/components/DetailBar';
import { Fab } from '@/components/Fab';
import { QueryStates } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { formatShortDate } from '@/features/finance/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { usePurchases } from '@/features/purchases/api';
import { formatCents } from '@/lib/money';
import { colors, fonts, radius } from '@/theme/tokens';

export default function PurchasesScreen() {
  const { orgId } = useOrg();
  const list = usePurchases(orgId);

  return (
    <View style={styles.flex}>
      <Screen>
        <DetailBar
          title="Compras"
          right={<CircleButton label="Fornecedores" icon={<Truck size={20} color={colors.ink} />} onPress={() => router.push('/fornecedores')} />}
        />
        <Card style={styles.list}>
          <QueryStates
            query={list}
            isEmpty={list.data?.length === 0}
            empty={{
              icon: ShoppingCart,
              title: 'Nenhuma compra registrada',
              description: 'Registre compras de mercadoria e material: o estoque e as contas a pagar são atualizados juntos.',
              action: { label: 'Registrar compra', onPress: () => router.push('/compras/nova') },
            }}
          />
          {list.data?.map((p, i) => {
            const cancelled = p.status === 'cancelled';
            const status = cancelled ? 'Cancelada' : p.total_cents === 0 ? 'Sem valor' : p.open_cents === 0 ? 'Paga' : p.paid_cents > 0 ? 'Parcial' : 'A pagar';
            return (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/compras/[id]', params: { id: p.id } })}
                style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed]}
              >
                <View style={styles.flex}>
                  <Text style={styles.title} numberOfLines={1}>
                    #{p.number} · {p.supplier_name ?? 'Sem fornecedor'}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {formatShortDate(p.purchase_date)} · {p.items_summary}
                  </Text>
                </View>
                <View style={styles.right}>
                  <Text style={[styles.amount, cancelled && styles.strike]}>{formatCents(p.total_cents)}</Text>
                  <View style={[styles.chip, status === 'A pagar' || status === 'Parcial' ? styles.chipOpen : styles.chipDone]}>
                    <Text style={[styles.chipText, status === 'A pagar' || status === 'Parcial' ? styles.chipTextOpen : styles.chipTextDone]}>{status}</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </Card>
        <View style={styles.fabSpace} />
      </Screen>
      <Fab label="Registrar compra" onPress={() => router.push('/compras/nova')} />
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
