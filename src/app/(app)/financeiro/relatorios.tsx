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
import { type CategoryNature, NATURE_LABEL } from '@/features/finance/logic';
import { formatQuantity } from '@/features/orders/logic';
import { useActiveOrganization } from '@/features/organizations/ActiveOrganizationProvider';
import { useOrg } from '@/features/organizations/useOrg';
import { PersonalReports } from '@/features/personal/PersonalReports';
import { type CategoryTotal, type FinanceReport, useFinanceReport } from '@/features/reports/api';
import { marginPercent, monthLabel, type ReportRange, reportPeriod, shares } from '@/features/reports/logic';
import { friendlyError } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { colors, fonts, minTouch } from '@/theme/tokens';

export default function ReportsRoute() {
  const { active } = useActiveOrganization();
  return active?.organization.kind === 'personal' ? <PersonalReports /> : <ReportsScreen />;
}

function ReportsScreen() {
  const { orgId, config } = useOrg();
  const [range, setRange] = useState<ReportRange>('month');
  const [offset, setOffset] = useState(0);
  const period = reportPeriod(range, offset);
  const query = useFinanceReport(orgId, period.from, period.to);
  const r = query.data;

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
          <Summary report={r} />
          <CategoryCard title="Receitas por categoria" rows={r.revenue_by_category} empty="Nenhuma receita lançada no período." />
          <CategoryCard title="Despesas por categoria" rows={r.expense_by_category} empty="Nenhuma despesa lançada no período." showNature />

          <Card>
            <Text style={styles.cardTitle}>Vendas por item</Text>
            {r.sales_by_item.length === 0 ? (
              <Text style={styles.body}>Nenhum {config.orderNoun} no período.</Text>
            ) : (
              r.sales_by_item.map((s, i) => (
                <Pressable
                  key={s.key}
                  accessibilityRole={s.product_id ? 'button' : undefined}
                  disabled={!s.product_id}
                  onPress={() => s.product_id && router.push({ pathname: '/itens/[id]', params: { id: s.product_id } })}
                  style={[styles.itemRow, i > 0 && styles.divider]}
                >
                  <View style={styles.flex}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {s.name}
                    </Text>
                    <Text style={styles.muted}>
                      {formatQuantity(s.quantity)} {s.unit ?? ''} · em {s.orders} {s.orders === 1 ? config.orderNoun : config.tabLabels.pedidos.toLowerCase()}
                      {s.product_id ? '' : ' · avulso'}
                    </Text>
                  </View>
                  <Text style={styles.value}>{formatCents(s.total_cents)}</Text>
                </Pressable>
              ))
            )}
            <Text style={styles.hint}>
              Itens dos {config.tabLabels.pedidos.toLowerCase()} feitos no período, sem os cancelados, pelo valor de cada linha (antes do desconto do{' '}
              {config.orderNoun}). Mostra até 100 itens.
            </Text>
          </Card>

          {r.monthly.length > 1 ? <MonthlyCard report={r} /> : null}
        </>
      )}

      <Text style={styles.note}>Relatório gerencial. Não é um valor contábil oficial nem substitui a orientação de um contador.</Text>
    </Screen>
  );
}

function sum(rows: CategoryTotal[], natures?: string[]) {
  return rows.filter((c) => !natures || natures.includes(c.nature)).reduce((s, c) => s + c.total_cents, 0);
}

function Summary({ report }: { report: FinanceReport }) {
  const revenue = sum(report.revenue_by_category, ['operating_revenue']);
  const expense = sum(report.expense_by_category, ['operating_expense', 'tax']);
  const cashIn = report.monthly.reduce((s, m) => s + m.cash_in_cents, 0);
  const cashOut = report.monthly.reduce((s, m) => s + m.cash_out_cents, 0);
  const margin = marginPercent(revenue, expense);
  return (
    <Card>
      <Text style={styles.cardTitle}>Resultado do período</Text>
      <Line label="Faturamento (vendas e serviços)" value={formatCents(revenue)} />
      <Line label="Despesas do negócio e impostos" value={formatCents(-expense)} />
      <Line label="Resultado" value={formatCents(revenue - expense)} strong />
      {margin !== null ? <Line label="Margem" value={`${margin.toLocaleString('pt-BR')}%`} /> : null}
      <View style={styles.divider} />
      <Line label="Entrou no caixa" value={formatCents(cashIn)} />
      <Line label="Saiu do caixa" value={formatCents(-cashOut)} />
      <Text style={styles.hint}>
        O resultado usa a data de competência, pago ou não, e deixa de fora compras de estoque, investimentos e retiradas. O caixa usa a data em que o
        dinheiro entrou ou saiu, inclusive de tudo isso.
      </Text>
    </Card>
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

function CategoryCard({ title, rows, empty, showNature }: { title: string; rows: CategoryTotal[]; empty: string; showNature?: boolean }) {
  const parts = shares(rows.map((c) => c.total_cents));
  return (
    <Card>
      <Text style={styles.cardTitle}>{title}</Text>
      {rows.length === 0 ? (
        <Text style={styles.body}>{empty}</Text>
      ) : (
        rows.map((c, i) => (
          <View key={`${c.category_id ?? 'sem'}-${c.nature}`} style={styles.catRow}>
            <View style={styles.catHead}>
              <View style={styles.flex}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {c.name ?? 'Sem categoria'}
                </Text>
                {showNature ? <Text style={styles.muted}>{NATURE_LABEL[c.nature as CategoryNature] ?? c.nature}</Text> : null}
              </View>
              <Text style={styles.value}>{formatCents(c.total_cents)}</Text>
              <Text style={styles.pct}>{Math.round(parts[i]! * 100)}%</Text>
            </View>
            <View style={styles.barWrap}>
              <View style={[styles.bar, { width: `${parts[i]! * 100}%` }]} />
            </View>
          </View>
        ))
      )}
      <Text style={styles.hint}>Pela data de competência, pagos ou não, sem os cancelados.</Text>
    </Card>
  );
}

function MonthlyCard({ report }: { report: FinanceReport }) {
  const crossesYear = report.from.slice(0, 4) !== report.to.slice(0, 4);
  const max = Math.max(1, ...report.monthly.flatMap((m) => [m.revenue_cents, m.expense_cents]));
  return (
    <Card>
      <Text style={styles.cardTitle}>Mês a mês</Text>
      <View style={styles.legend}>
        <View style={[styles.dot, styles.revenue]} />
        <Text style={styles.muted}>Faturamento</Text>
        <View style={[styles.dot, styles.expense]} />
        <Text style={styles.muted}>Despesas</Text>
      </View>
      {report.monthly.map((m) => (
        <View key={m.month} style={styles.monthRow}>
          <Text style={styles.monthLabel}>{monthLabel(m.month, crossesYear)}</Text>
          <View style={styles.monthBars}>
            <View style={styles.barWrap}>
              <View style={[styles.bar, { width: `${(m.revenue_cents / max) * 100}%` }]} />
            </View>
            <View style={styles.barWrap}>
              <View style={[styles.bar, styles.expense, { width: `${(m.expense_cents / max) * 100}%` }]} />
            </View>
          </View>
          <View style={styles.monthValues}>
            <Text style={styles.monthValue}>{formatCents(m.revenue_cents - m.expense_cents)}</Text>
            <Text style={styles.muted}>caixa {formatCents(m.cash_in_cents - m.cash_out_cents)}</Text>
          </View>
        </View>
      ))}
      <Text style={styles.hint}>À direita, o resultado do mês e, abaixo, o saldo do caixa (entradas menos saídas).</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  periodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { width: minTouch, height: minTouch, borderRadius: minTouch / 2, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  periodLabel: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 13, color: colors.gray600, lineHeight: 19 },
  hint: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500, lineHeight: 17, marginTop: 4 },
  muted: { fontFamily: fonts.medium, fontSize: 11, color: colors.gray500 },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, minHeight: 28, alignItems: 'center' },
  lineLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.gray600 },
  lineValue: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  strong: { fontFamily: fonts.extrabold, color: colors.ink },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 8 },
  itemName: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  value: { fontFamily: fonts.extrabold, fontSize: 13, color: colors.ink },
  pct: { width: 40, textAlign: 'right', fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  catRow: { gap: 6, paddingVertical: 6 },
  catHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barWrap: { height: 8, borderRadius: 4, backgroundColor: colors.gray100, overflow: 'hidden' },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  revenue: { backgroundColor: colors.primary },
  expense: { backgroundColor: colors.gray400 },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  monthLabel: { width: 44, fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  monthBars: { flex: 1, gap: 4 },
  monthValues: { width: 116, alignItems: 'flex-end' },
  monthValue: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  note: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500, textAlign: 'center' },
});
