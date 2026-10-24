// Aba "Produção" dos negócios de produção: o que falta produzir para os
// pedidos em aberto e as últimas produções registradas.
import { router } from 'expo-router';
import { ChefHat, ClipboardCheck } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { Fab } from '@/components/Fab';
import { QueryStates } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { formatQuantity } from '@/features/orders/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { formatWhen } from '@/lib/dates';
import { formatCents } from '@/lib/money';
import { colors, fonts, radius } from '@/theme/tokens';

import { useProductionDemand, useProductionRuns } from './api';

export function ProductionTab({ header }: { header?: ReactNode }) {
  const { orgId, config } = useOrg();
  const demand = useProductionDemand(orgId);
  const runs = useProductionRuns(orgId);

  return (
    <View style={styles.flex}>
      <Screen>
        <Text style={styles.title} accessibilityRole="header">
          {config.tabLabels.tarefas}
        </Text>
        {header}

        <Card style={styles.list}>
          <Text style={styles.cardTitle}>Para produzir</Text>
          <QueryStates
            query={demand}
            isEmpty={demand.data?.length === 0}
            empty={{
              icon: ClipboardCheck,
              title: 'Nada pendente',
              description: `O estoque cobre os ${config.orderNoun}s em aberto. Produtos acabados que faltarem aparecem aqui.`,
            }}
          />
          {demand.data?.map((d, i) => (
            <Pressable
              key={d.product_id}
              accessibilityRole="button"
              onPress={() =>
                d.has_recipe
                  ? router.push({ pathname: '/producao/nova', params: { produto: d.product_id, qtd: formatQuantity(d.to_produce_qty) } })
                  : router.push({ pathname: '/itens/receita', params: { id: d.product_id } })
              }
              style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed]}
            >
              <View style={styles.flex}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {d.name}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {formatQuantity(d.ordered_qty)} {d.unit} em {d.open_orders} {d.open_orders === 1 ? config.orderNoun : `${config.orderNoun}s`} · estoque{' '}
                  {formatQuantity(d.stock_qty)}
                </Text>
                {!d.has_recipe ? <Text style={styles.warn}>Sem ficha técnica: toque para cadastrar</Text> : null}
              </View>
              <View style={styles.chip}>
                <Text style={styles.chipText}>
                  faltam {formatQuantity(d.to_produce_qty)} {d.unit}
                </Text>
              </View>
            </Pressable>
          ))}
        </Card>

        <Card style={styles.list}>
          <Text style={styles.cardTitle}>Produções recentes</Text>
          <QueryStates
            query={runs}
            isEmpty={runs.data?.length === 0}
            empty={{
              icon: ChefHat,
              title: 'Nenhuma produção registrada',
              description: 'Ao registrar uma produção, os insumos saem do estoque e o produto pronto entra, com o custo calculado pela ficha técnica.',
              action: { label: 'Registrar produção', onPress: () => router.push('/producao/nova') },
            }}
          />
          {runs.data?.map((r, i) => {
            const cancelled = r.status === 'cancelled';
            return (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/producao/[id]', params: { id: r.id } })}
                style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed]}
              >
                <View style={styles.flex}>
                  <Text style={[styles.rowTitle, cancelled && styles.strike]} numberOfLines={1}>
                    #{r.number} · {formatQuantity(r.quantity)} {r.unit} {r.product_name}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {formatWhen(new Date(r.created_at))}
                    {cancelled ? ' · cancelada' : ''}
                  </Text>
                </View>
                <Text style={[styles.amount, cancelled && styles.strike]}>{formatCents(r.unit_cost_cents)}/{r.unit}</Text>
              </Pressable>
            );
          })}
        </Card>
        <View style={styles.fabSpace} />
      </Screen>
      <Fab label="Registrar produção" onPress={() => router.push('/producao/nova')} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.extrabold, fontSize: 26, letterSpacing: -0.5, color: colors.ink },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink, marginBottom: 4 },
  list: { paddingVertical: 14, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  pressed: { backgroundColor: colors.rowPressed },
  rowTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  sub: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  warn: { fontFamily: fonts.bold, fontSize: 11, color: colors.primaryText },
  amount: { fontFamily: fonts.extrabold, fontSize: 13, color: colors.ink },
  strike: { textDecorationLine: 'line-through', color: colors.gray400 },
  chip: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.primaryTint },
  chipText: { fontFamily: fonts.bold, fontSize: 11, color: colors.primaryText },
  fabSpace: { height: 70 },
});
