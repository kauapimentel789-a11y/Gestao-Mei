// Relatórios de Minhas finanças: o que entrou e saiu no período, gastos e
// entradas por categoria, mês a mês, maiores gastos, orçamento × realizado e
// metas. Somas do banco (finance_report, budget_overview, goal_progress).
import { router } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { DetailBar } from '@/components/DetailBar';
import { ErrorCard } from '@/components/ErrorCard';
import { Skeleton } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TextLink } from '@/components/TextLink';
import { usePeriodEntries } from '@/features/finance/api';
import { BarChart } from '@/features/finance/charts';
import { EntryRow } from '@/features/finance/EntryRow';
import { toISODate } from '@/features/finance/logic';
import { useSpace } from '@/features/organizations/useOrg';
import { useBudgetOverview, useGoals } from '@/features/planning/api';
import { GoalRow } from '@/features/planning/GoalRow';
import { budgetProgress } from '@/features/planning/logic';
import { ProgressBar } from '@/features/planning/ProgressBar';
import { type CategoryTotal, useFinanceReport } from '@/features/reports/api';
import { monthLabel, type ReportRange, reportPeriod, shares } from '@/features/reports/logic';
import { friendlyError } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { colors, fonts, minTouch } from '@/theme/tokens';

import { savingsPct } from './logic';

export function PersonalReports() {
  const { orgId } = useSpace();
  const [range, setRange] = useState<ReportRange>('month');
  const [offset, setOffset] = useState(0);
  const period = reportPeriod(range, offset);
  const query = useFinanceReport(orgId, period.from, period.to);
  const entries = usePeriodEntries(orgId, period.from, period.to);
  const budget = useBudgetOverview(orgId, period.from);
  const goals = useGoals(orgId);
  const r = query.data;

  const cashIn = r?.monthly.reduce((s, m) => s + m.cash_in_cents, 0) ?? 0;
  const cashOut = r?.monthly.reduce((s, m) => s + m.cash_out_cents, 0) ?? 0;
  const saved = savingsPct(cashIn, cashOut);
  const biggest = (entries.data ?? [])
    .filter((e) => e.direction === 'payable' && e.status !== 'cancelled')
    .sort((a, b) => b.amount_cents - a.amount_cents)
    .slice(0, 5);
  const budgets = range === 'month' ? (budget.data ?? []).filter((b) => b.budget_id !== null) : [];
  const activeGoals = (goals.data ?? []).filter((g) => !g.completed_at);
  const today = toISODate(new Date());

  return (
    <Screen>
      <DetailBar title="Relatórios" />

      <SegmentedControl
        accessibilityLabel="Período do relatório"
        value={range}
        onChange={(v) => {
          setRange(v);
          setOffset(0);
        }}
        segments={[
          { value: 'month', label: 'Mês' },
          { value: 'quarter', label: '3 meses' },
          { value: 'year', label: 'Ano' },
        ]}
      />
      <View style={styles.periodRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Período anterior" onPress={() => setOffset(offset - 1)} style={styles.arrow}>
          <ChevronLeft size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.periodLabel}>{period.label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Próximo período"
          disabled={offset >= 0}
          onPress={() => setOffset(offset + 1)}
          style={[styles.arrow, offset >= 0 && styles.disabled]}
        >
          <ChevronRight size={20} color={colors.ink} />
        </Pressable>
      </View>

      {query.isPending ? (
        <Skeleton rows={4} />
      ) : query.error || !r ? (
        <ErrorCard message={friendlyError(query.error)} onRetry={() => query.refetch()} />
      ) : (
        <>
          <Card>
            <Text style={styles.cardTitle}>Resumo</Text>
            <Line label="Entrou" value={formatCents(cashIn)} />
            <Line label="Saiu" value={formatCents(-cashOut)} />
            <Line label={cashIn - cashOut >= 0 ? 'Sobrou' : 'Faltou'} value={formatCents(cashIn - cashOut)} strong />
            {saved !== null ? <Line label="Quanto da renda sobrou" value={`${saved.toLocaleString('pt-BR')}%`} /> : null}
            <Text style={styles.hint}>Pela data em que o dinheiro entrou ou saiu da conta. Compra no cartão sai quando a fatura é paga.</Text>
          </Card>

          {r.monthly.length > 1 ? (
            <Card>
              <Text style={styles.cardTitle}>Quanto saiu por mês</Text>
              <BarChart data={r.monthly.map((m) => ({ key: m.month, label: monthLabel(m.month), value: m.cash_out_cents }))} />
            </Card>
          ) : null}

          <CategoryCard title="Gastos por categoria" rows={r.expense_by_category} empty="Nenhum gasto lançado no período." />
          <CategoryCard title="Entradas por categoria" rows={r.revenue_by_category} empty="Nenhuma entrada lançada no período." />

          {biggest.length > 0 ? (
            <Card style={styles.list}>
              <Text style={styles.cardTitle}>Maiores gastos</Text>
              {biggest.map((e, i) => (
                <View key={e.id} style={i > 0 && styles.divider}>
                  <EntryRow entry={e} />
                </View>
              ))}
            </Card>
          ) : null}

          {budgets.length > 0 ? (
            <Card style={styles.list}>
              <Text style={styles.cardTitle}>Orçamento × realizado</Text>
              {budgets.map((b, i) => {
                const p = budgetProgress(b.spent_cents, b.amount_cents ?? 0, b.alert_pct ?? 80);
                return (
                  <View key={b.category_id} style={[styles.budgetRow, i > 0 && styles.divider]}>
                    <View style={styles.catHead}>
                      <Text style={styles.itemName}>{b.category_name}</Text>
                      <Text style={styles.value}>
                        {formatCents(b.spent_cents)} / {formatCents(b.amount_cents ?? 0)}
                      </Text>
                    </View>
                    <ProgressBar ratio={p.ratio} level={p.level} label={`${b.category_name}: ${p.pct}%`} />
                  </View>
                );
              })}
              <TextLink label="Ver orçamento" onPress={() => router.push('/orcamento')} />
            </Card>
          ) : null}

          {activeGoals.length > 0 ? (
            <Card style={styles.list}>
              <Text style={styles.cardTitle}>Metas</Text>
              {activeGoals.map((g, i) => (
                <View key={g.id} style={i > 0 && styles.divider}>
                  <GoalRow goal={g} today={today} />
                </View>
              ))}
            </Card>
          ) : null}
        </>
      )}

      <Text style={styles.note}>Gastos e entradas por categoria usam o mês de cada lançamento, pago ou não, sem os cancelados.</Text>
    </Screen>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.lineValue, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

function CategoryCard({ title, rows, empty }: { title: string; rows: CategoryTotal[]; empty: string }) {
  const parts = shares(rows.map((c) => c.total_cents));
  return (
    <Card>
      <Text style={styles.cardTitle}>{title}</Text>
      {rows.length === 0 ? (
        <Text style={styles.body}>{empty}</Text>
      ) : (
        rows.map((c, i) => (
          <View key={c.category_id ?? 'sem'} style={styles.catRow}>
            <View style={styles.catHead}>
              <Text style={[styles.itemName, styles.flex]} numberOfLines={1}>
                {c.name ?? 'Sem categoria'}
              </Text>
              <Text style={styles.value}>{formatCents(c.total_cents)}</Text>
              <Text style={styles.pct}>{Math.round(parts[i]! * 100)}%</Text>
            </View>
            <ProgressBar ratio={parts[i]!} level="alert" label={`${c.name ?? 'Sem categoria'}: ${Math.round(parts[i]! * 100)}%`} />
          </View>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  periodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { width: minTouch, height: minTouch, borderRadius: minTouch / 2, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.35 },
  periodLabel: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink, paddingVertical: 4 },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600 },
  hint: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 17, color: colors.gray500 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  lineLabel: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600 },
  lineValue: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  strong: { fontFamily: fonts.extrabold, color: colors.ink },
  list: { gap: 0, paddingVertical: 4 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  catRow: { gap: 6 },
  catHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  budgetRow: { gap: 6, paddingVertical: 10 },
  itemName: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  value: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  pct: { fontFamily: fonts.semibold, fontSize: 12, color: colors.gray500, minWidth: 34, textAlign: 'right' },
  note: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500, textAlign: 'center' },
});
