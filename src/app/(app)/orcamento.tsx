// Orçamento do mês: limite por categoria de gasto e quanto já foi gasto
// (somado pelo banco). Categorias sem limite aparecem com o gasto do mês.
import { ChevronLeft, ChevronRight, PiggyBank } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { DetailBar } from '@/components/DetailBar';
import { QueryStates } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { useSpace } from '@/features/organizations/useOrg';
import { type BudgetRow, useBudgetOverview, useDisableBudget, useSaveBudget } from '@/features/planning/api';
import { BudgetDialog } from '@/features/planning/BudgetDialog';
import { BUDGET_LEVEL_LABEL, budgetProgress, budgetTotals, monthStart } from '@/features/planning/logic';
import { ProgressBar } from '@/features/planning/ProgressBar';
import { reportPeriod } from '@/features/reports/logic';
import { formatCents } from '@/lib/money';
import { colors, fonts, minTouch } from '@/theme/tokens';

export default function BudgetScreen() {
  const { orgId } = useSpace();
  const [offset, setOffset] = useState(0);
  const month = monthStart(new Date(), offset);
  const query = useBudgetOverview(orgId, month);
  const save = useSaveBudget(orgId);
  const disable = useDisableBudget(orgId);
  const toast = useToast();
  const [editing, setEditing] = useState<BudgetRow | null>(null);

  const rows = query.data ?? [];
  const withBudget = rows.filter((r) => r.budget_id !== null);
  const without = rows.filter((r) => r.budget_id === null);
  const totals = budgetTotals(rows);
  const total = budgetProgress(totals.spent, totals.limit, 100);

  return (
    <Screen>
      <DetailBar title="Orçamento" />

      <View style={styles.periodRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Mês anterior" onPress={() => setOffset(offset - 1)} style={styles.arrow}>
          <ChevronLeft size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.periodLabel}>{reportPeriod('month', offset).label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Próximo mês"
          onPress={() => setOffset(offset + 1)}
          disabled={offset >= 1}
          style={[styles.arrow, offset >= 1 && styles.disabled]}
        >
          <ChevronRight size={20} color={colors.ink} />
        </Pressable>
      </View>

      <QueryStates
        query={query}
        isEmpty={rows.length === 0}
        empty={{ icon: PiggyBank, title: 'Nenhuma categoria de gasto', description: 'Crie categorias em Lançamentos para montar o orçamento.' }}
      />

      {totals.count > 0 ? (
        <Card>
          <Text style={styles.muted}>Gasto nas categorias com limite</Text>
          <Text style={styles.amount}>
            {formatCents(totals.spent)} <Text style={styles.of}>de {formatCents(totals.limit)}</Text>
          </Text>
          <ProgressBar ratio={total.ratio} level={total.level} label="Orçamento do mês" />
          <Text style={styles.body}>
            {total.remaining >= 0 ? `Ainda dá para gastar ${formatCents(total.remaining)} neste mês.` : `Passou ${formatCents(-total.remaining)} do total planejado.`}
          </Text>
        </Card>
      ) : query.data && rows.length > 0 ? (
        <Card>
          <Text style={styles.cardTitle}>Monte seu orçamento</Text>
          <Text style={styles.body}>Escolha uma categoria abaixo e diga quanto quer gastar por mês. O app avisa quando estiver chegando perto.</Text>
        </Card>
      ) : null}

      {withBudget.length > 0 ? (
        <Card style={styles.list}>
          <Text style={styles.cardTitle}>Com limite</Text>
          {withBudget.map((r, i) => {
            const p = budgetProgress(r.spent_cents, r.amount_cents ?? 0, r.alert_pct ?? 80);
            return (
              <Pressable key={r.category_id} accessibilityRole="button" onPress={() => setEditing(r)} style={[styles.row, i > 0 && styles.divider]}>
                <View style={styles.rowHead}>
                  <Text style={styles.name}>{r.category_name}</Text>
                  <Text style={[styles.pct, p.level === 'over' && styles.over]}>{p.pct}%</Text>
                </View>
                <ProgressBar ratio={p.ratio} level={p.level} label={`${r.category_name}: ${p.pct}%`} />
                <Text style={styles.muted}>
                  {formatCents(r.spent_cents)} de {formatCents(r.amount_cents ?? 0)} ·{' '}
                  {p.level === 'over' ? `passou ${formatCents(-p.remaining)}` : `${BUDGET_LEVEL_LABEL[p.level].toLowerCase()}, faltam ${formatCents(p.remaining)}`}
                </Text>
              </Pressable>
            );
          })}
        </Card>
      ) : null}

      {without.length > 0 ? (
        <Card style={styles.list}>
          <Text style={styles.cardTitle}>Sem limite</Text>
          {without.map((r, i) => (
            <Pressable key={r.category_id} accessibilityRole="button" onPress={() => setEditing(r)} style={[styles.simpleRow, i > 0 && styles.divider]}>
              <View style={styles.flex}>
                <Text style={styles.name}>{r.category_name}</Text>
                <Text style={styles.muted}>{r.spent_cents > 0 ? `${formatCents(r.spent_cents)} neste mês` : 'Nada neste mês'}</Text>
              </View>
              <Text style={styles.link}>Definir limite</Text>
            </Pressable>
          ))}
        </Card>
      ) : null}

      <Text style={styles.note}>Conta tudo o que foi lançado no mês, pago ou não. Compra no cartão entra no mês da fatura.</Text>

      <BudgetDialog
        key={editing?.category_id ?? 'closed'}
        visible={editing !== null}
        row={editing}
        loading={save.isPending || disable.isPending}
        onClose={() => setEditing(null)}
        onSave={async (input) => {
          if (!editing) return;
          await save.mutateAsync({ categoryId: editing.category_id, ...input });
          setEditing(null);
          toast('Limite salvo');
        }}
        onRemove={async () => {
          if (!editing?.budget_id) return;
          await disable.mutateAsync(editing.budget_id);
          setEditing(null);
          toast('Limite retirado');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  periodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { width: minTouch, height: minTouch, borderRadius: minTouch / 2, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.35 },
  periodLabel: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  amount: { fontFamily: fonts.extrabold, fontSize: 26, letterSpacing: -0.5, color: colors.ink },
  of: { fontFamily: fonts.semibold, fontSize: 14, color: colors.gray500 },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink, paddingVertical: 6 },
  body: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 19, color: colors.gray600 },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  list: { gap: 0, paddingVertical: 4 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  row: { gap: 6, paddingVertical: 12 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  simpleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  name: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  pct: { fontFamily: fonts.extrabold, fontSize: 13, color: colors.ink },
  over: { color: colors.danger },
  link: { fontFamily: fonts.bold, fontSize: 13, color: colors.primaryText },
  note: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500, textAlign: 'center' },
});
