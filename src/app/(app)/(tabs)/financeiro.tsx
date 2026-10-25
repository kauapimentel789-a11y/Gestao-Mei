// Painel do Financeiro: saldo, cartões com comparação, faturamento mês a mês,
// para onde foi o dinheiro, sobra de caixa, limite do MEI e lançamentos.
// Todos os valores vêm do banco (finance_summary, finance_report, saldos).
import { router } from 'expo-router';
import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  HandCoins,
  Landmark,
  type LucideIcon,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CircleButton } from '@/components/DetailBar';
import { ErrorCard } from '@/components/ErrorCard';
import { Fab } from '@/components/Fab';
import { QueryStates, Skeleton } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useAccounts, useFinanceSummary, useOpenEntries, usePeriodEntries } from '@/features/finance/api';
import { AreaChart, BarChart, Donut, SLICE_COLORS, Sparkline } from '@/features/finance/charts';
import {
  cashSeries,
  changePct,
  COMPARE_LABEL,
  expenseSlices,
  formatCompactCents,
  formatPct,
  insightText,
  monthsWindow,
  revenueSeries,
} from '@/features/finance/dashboard';
import { EntryRow } from '@/features/finance/EntryRow';
import { cashNet, type FinanceSummary, operatingResult, type PeriodMode, periodFor } from '@/features/finance/logic';
import { useMeiYear } from '@/features/mei/api';
import { LEVEL_TEXT, limitLevel, yearTotal } from '@/features/mei/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { useFinanceReport } from '@/features/reports/api';
import { friendlyError } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { colors, fonts, minTouch, radius, shadows } from '@/theme/tokens';

type ListTab = 'receivable' | 'payable' | 'period';

export default function FinanceScreen() {
  const { orgId, config } = useOrg();
  const [mode, setMode] = useState<PeriodMode>('month');
  const [offset, setOffset] = useState(0);
  const [tab, setTab] = useState<ListTab>('period');
  const period = periodFor(mode, offset);
  const previous = periodFor(mode, offset - 1);
  const trendWindow = monthsWindow(period.to, 6);

  const summary = useFinanceSummary(orgId, period.from, period.to);
  const prevSummary = useFinanceSummary(orgId, previous.from, previous.to);
  const trend = useFinanceReport(orgId, trendWindow.from, trendWindow.to);
  const breakdown = useFinanceReport(orgId, period.from, period.to);
  const accounts = useAccounts(orgId);
  const receivable = useOpenEntries(orgId, 'receivable');
  const payable = useOpenEntries(orgId, 'payable');
  const periodEntries = usePeriodEntries(orgId, period.from, period.to);
  const list = tab === 'receivable' ? receivable : tab === 'payable' ? payable : periodEntries;

  const s = summary.data;
  const p = prevSummary.data;
  const activeAccounts = (accounts.data ?? []).filter((a) => a.active);
  const totalBalance = activeAccounts.reduce((sum, a) => sum + a.balance_cents, 0);
  const monthly = trend.data?.monthly ?? [];
  const cash = cashSeries(monthly);
  const slices = expenseSlices(breakdown.data?.expense_by_category ?? []);
  const expenseTotal = slices.reduce((sum, x) => sum + x.cents, 0);
  const compare = COMPARE_LABEL[mode];

  return (
    <View style={styles.flex}>
      <Screen>
        <View style={styles.header}>
          <View style={styles.flex}>
            <Text style={styles.title} accessibilityRole="header">
              {config.tabLabels.financeiro}
            </Text>
            <Text style={styles.subtitle}>Como está o dinheiro do seu negócio</Text>
          </View>
          <CircleButton label="Relatórios" icon={<ChartColumn size={20} color={colors.ink} />} onPress={() => router.push('/financeiro/relatorios')} />
          <CircleButton label="Contas e transferências" icon={<Landmark size={20} color={colors.ink} />} onPress={() => router.push('/financeiro/contas')} />
        </View>

        <View style={styles.shortcuts}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/financeiro/venda-rapida')} style={styles.shortcut}>
            <BadgeDollarSign size={20} color={colors.primaryText} />
            <Text style={styles.shortcutText}>Venda rápida</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/financeiro/quem-me-deve')} style={styles.shortcut}>
            <HandCoins size={20} color={colors.primaryText} />
            <Text style={styles.shortcutText}>Quem me deve</Text>
          </Pressable>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="Ver contas" onPress={() => router.push('/financeiro/contas')} style={styles.hero}>
          <View style={styles.glow} pointerEvents="none" />
          <View style={styles.heroTop}>
            <View style={styles.flex}>
              <Text style={styles.heroLabel}>Saldo nas suas contas</Text>
              <Text style={styles.heroValue}>{accounts.data ? formatCents(totalBalance) : '–'}</Text>
            </View>
            <View style={styles.heroIcon}>
              <Wallet size={20} color={colors.primary} />
            </View>
          </View>
          {cash.length > 1 ? <Sparkline values={cash.map((c) => c.value)} color={colors.primary} /> : null}
          <Text style={styles.heroHint}>
            {activeAccounts.length === 1 ? '1 conta' : `${activeAccounts.length} contas`}
            {cash.length > 1 ? ' · a linha mostra a sobra de caixa mês a mês' : ' · confira com o extrato do banco'}
          </Text>
        </Pressable>

        <SegmentedControl
          accessibilityLabel="Período"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setOffset(0);
          }}
          segments={[
            { value: 'day', label: 'Dia' },
            { value: 'week', label: 'Semana' },
            { value: 'month', label: 'Mês' },
          ]}
        />
        <View style={styles.periodRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Período anterior" onPress={() => setOffset(offset - 1)} style={styles.arrow}>
            <ChevronLeft size={20} color={colors.ink} />
          </Pressable>
          <Text style={styles.periodLabel}>{period.label}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Próximo período" onPress={() => setOffset(offset + 1)} style={styles.arrow}>
            <ChevronRight size={20} color={colors.ink} />
          </Pressable>
        </View>

        {summary.isPending ? (
          <Skeleton rows={4} />
        ) : summary.error || !s ? (
          <ErrorCard message={friendlyError(summary.error)} onRetry={() => summary.refetch()} />
        ) : (
          <>
            <View style={styles.grid}>
              <Kpi
                label="Entrou"
                value={s.received_cents}
                previous={p?.received_cents}
                compare={compare}
                icon={ArrowDownLeft}
                tone="up"
              />
              <Kpi label="Saiu" value={s.paid_cents} previous={p?.paid_cents} compare={compare} icon={ArrowUpRight} tone="down" />
            </View>
            <View style={styles.grid}>
              <Kpi
                label={cashNet(s) >= 0 ? 'Sobrou' : 'Faltou'}
                value={cashNet(s)}
                previous={p ? cashNet(p) : undefined}
                compare={compare}
                icon={TrendingUp}
                tone="up"
              />
              <Kpi
                label="A receber"
                value={s.open_receivable_cents}
                note={s.overdue_receivable_cents > 0 ? `${formatCents(s.overdue_receivable_cents)} vencido` : 'nada vencido'}
                icon={HandCoins}
                tone="up"
                onPress={() => router.push('/financeiro/quem-me-deve')}
              />
            </View>
            <ResultCard s={s} p={p} compare={compare} />
          </>
        )}

        <Card>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Faturamento</Text>
            <Text style={styles.cardMeta}>últimos 6 meses</Text>
          </View>
          {trend.isPending ? (
            <Skeleton rows={2} />
          ) : trend.error ? (
            <ErrorCard message={friendlyError(trend.error)} onRetry={() => trend.refetch()} />
          ) : (
            <>
              <BarChart key={trendWindow.to} data={revenueSeries(monthly)} />
              <Text style={styles.hint}>Vendas e serviços pela data da venda, recebidos ou não. Toque num mês para ver o valor.</Text>
            </>
          )}
        </Card>

        <Card>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Para onde foi o dinheiro</Text>
            <Text style={styles.cardMeta}>{period.label.toLowerCase()}</Text>
          </View>
          {breakdown.isPending ? (
            <Skeleton rows={2} />
          ) : breakdown.error ? (
            <ErrorCard message={friendlyError(breakdown.error)} onRetry={() => breakdown.refetch()} />
          ) : slices.length === 0 ? (
            <Text style={styles.body}>Nenhuma despesa lançada neste período.</Text>
          ) : (
            <View style={styles.donutRow}>
              <Donut slices={slices} centerValue={formatCompactCents(expenseTotal)} centerLabel="em despesas" size={132} />
              <View style={styles.legend}>
                {slices.map((x, i) => (
                  <View key={x.key} style={styles.legendRow}>
                    <View style={[styles.dot, { backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }]} />
                    <View style={styles.flex}>
                      <Text style={styles.legendName} numberOfLines={1}>
                        {x.name}
                      </Text>
                      <Text style={styles.legendValue}>
                        {formatCents(x.cents)} · {formatPct(x.pct)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </Card>

        <Card>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Fluxo de caixa</Text>
            <Text style={styles.cardMeta}>entrou menos saiu</Text>
          </View>
          {trend.isPending ? (
            <Skeleton rows={2} />
          ) : trend.error ? null : (
            <>
              <AreaChart data={cash} />
              <Text style={styles.hint}>Quanto sobrou (ou faltou) em cada mês, pela data em que o dinheiro entrou ou saiu.</Text>
            </>
          )}
        </Card>

        <MeiGoal orgId={orgId} />

        {s && trend.data ? (
          <View style={styles.insight}>
            <View style={styles.insightHead}>
              <Sparkles size={18} color={colors.primary} />
              <Text style={styles.insightTitle}>Resumo</Text>
            </View>
            <Text style={styles.insightText}>
              {insightText({ monthly, overdueReceivableCents: s.overdue_receivable_cents, cashNetCents: cashNet(s) })}
            </Text>
            <Button size="medium" label="Ver relatórios" onPress={() => router.push('/financeiro/relatorios')} />
          </View>
        ) : null}

        <Text style={styles.section}>Lançamentos</Text>
        <SegmentedControl
          accessibilityLabel="Lista"
          value={tab}
          onChange={setTab}
          segments={[
            { value: 'period', label: 'No período' },
            { value: 'receivable', label: 'A receber' },
            { value: 'payable', label: 'A pagar' },
          ]}
        />
        <Card style={styles.list}>
          <QueryStates
            query={list}
            isEmpty={(list.data ?? []).length === 0}
            empty={{
              icon: Wallet,
              title: tab === 'period' ? 'Nenhum lançamento no período' : tab === 'receivable' ? 'Nada a receber' : 'Nada a pagar',
              description:
                tab === 'period'
                  ? 'Lançamentos com data de competência no período aparecem aqui.'
                  : 'Valores em aberto aparecem aqui, do vencimento mais antigo ao mais novo.',
              action: { label: 'Novo lançamento', onPress: () => router.push('/financeiro/lancamento') },
            }}
          />
          {(list.data ?? []).map((e, i) => (
            <View key={e.id} style={i > 0 && styles.divider}>
              <EntryRow entry={e} />
            </View>
          ))}
        </Card>
        <View style={styles.fabSpace} />
      </Screen>
      <Fab label="Novo lançamento" onPress={() => router.push('/financeiro/lancamento')} />
    </View>
  );
}

/** Cartão com valor e comparação. `tone` diz se subir é bom ("up") ou ruim ("down"). */
function Kpi({
  label,
  value,
  previous,
  compare,
  note,
  icon: Icon,
  tone,
  onPress,
}: {
  label: string;
  value: number;
  previous?: number;
  compare?: string;
  note?: string;
  icon: LucideIcon;
  tone: 'up' | 'down';
  onPress?: () => void;
}) {
  const pct = previous === undefined ? null : changePct(value, previous);
  const rising = pct !== null && pct > 0;
  const good = pct === null || pct === 0 ? null : tone === 'up' ? rising : !rising;
  const content = (
    <>
      <View style={styles.kpiHead}>
        <Text style={styles.kpiLabel}>{label}</Text>
        <View style={styles.kpiIcon}>
          <Icon size={16} color={colors.primaryText} />
        </View>
      </View>
      <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>
        {formatCents(Math.abs(value))}
      </Text>
      {note ? (
        <Text style={styles.kpiNote}>{note}</Text>
      ) : pct === null ? (
        <Text style={styles.kpiNote}>{previous === undefined ? ' ' : `sem base ${compare}`}</Text>
      ) : (
        <View style={styles.deltaRow}>
          {pct !== 0 ? (
            rising ? (
              <ArrowUpRight size={14} color={good ? colors.success : colors.danger} />
            ) : (
              <ArrowDownRight size={14} color={good ? colors.success : colors.danger} />
            )
          ) : null}
          <Text style={[styles.delta, good === true && styles.good, good === false && styles.bad]} numberOfLines={2}>
            {pct === 0 ? 'sem mudança' : `${formatPct(pct)} ${rising ? 'a mais' : 'a menos'} ${compare}`}
          </Text>
        </View>
      )}
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.kpi, pressed && styles.pressed]}>
      {content}
    </Pressable>
  ) : (
    <View style={styles.kpi}>{content}</View>
  );
}

function ResultCard({ s, p, compare }: { s: FinanceSummary; p: FinanceSummary | undefined; compare: string }) {
  const result = operatingResult(s);
  const pct = p ? changePct(result, operatingResult(p)) : null;
  return (
    <Card>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Lucro estimado</Text>
        {pct !== null && pct !== 0 ? (
          <View style={[styles.pill, pct > 0 ? styles.pillGood : styles.pillBad]}>
            <Text style={[styles.pillText, pct > 0 ? styles.good : styles.bad]}>
              {pct > 0 ? '↑' : '↓'} {formatPct(pct)}
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.result, result < 0 && styles.bad]}>{formatCents(result)}</Text>
      <Line label="Vendas e serviços" value={s.revenue_cents} />
      <Line label="Despesas do negócio e impostos" value={-s.operating_expense_cents} />
      <Text style={styles.hint}>
        Pela data da venda ou da despesa, pagas ou não. A seta compara {compare.replace(/^que /, 'com ')}. Compras de estoque, investimentos e retiradas do dono
        ficam de fora, e o custo do que foi vendido ainda não é descontado: é uma estimativa.
      </Text>
    </Card>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.lineRow}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{formatCents(value)}</Text>
    </View>
  );
}

function MeiGoal({ orgId }: { orgId: string }) {
  const year = new Date().getFullYear();
  const mei = useMeiYear(orgId, year);
  const d = mei.data;
  const total = d ? yearTotal(d.months) : 0;
  const limit = d?.limit?.annual_limit_cents ?? null;
  const level = limitLevel(total, limit);
  const ratio = limit ? Math.min(1, total / limit) : 0;
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/financeiro/mei')}>
      <Card>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>Limite do MEI em {year}</Text>
          <ChevronRight size={18} color={colors.gray500} />
        </View>
        {!d ? (
          <Text style={styles.lineLabel}>{mei.error ? 'Não foi possível carregar.' : 'Carregando…'}</Text>
        ) : limit ? (
          <>
            <View style={styles.goalRow}>
              <Text style={styles.goalValue}>{formatCents(total)}</Text>
              <Text style={styles.goalOf}>de {formatCents(limit)}</Text>
              <Text style={styles.goalPct}>{Math.round((total / limit) * 100)}%</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${ratio * 100}%` }, level === 'attention' && styles.fillAttention, (level === 'near' || level === 'over') && styles.fillWarn]} />
            </View>
            {level !== 'ok' && level !== 'none' ? <Text style={[styles.warn, level === 'attention' && styles.attention]}>{LEVEL_TEXT[level]}</Text> : null}
          </>
        ) : (
          <Text style={styles.lineLabel}>{formatCents(total)} no ano · toque para cadastrar o limite anual e acompanhar</Text>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: fonts.extrabold, fontSize: 26, letterSpacing: -0.5, color: colors.ink },
  subtitle: { fontFamily: fonts.medium, fontSize: 13, color: colors.gray500 },
  periodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
  periodLabel: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  hero: { backgroundColor: colors.ink, borderRadius: radius.hero, padding: 20, gap: 8, overflow: 'hidden' },
  glow: { position: 'absolute', top: -120, right: -90, width: 240, height: 240, borderRadius: 120, backgroundColor: colors.primary, opacity: 0.4 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heroLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gray300 },
  heroValue: { fontFamily: fonts.extrabold, fontSize: 32, letterSpacing: -0.7, color: colors.white },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,106,0,0.12)',
  },
  heroHint: { fontFamily: fonts.medium, fontSize: 11, color: colors.gray400 },
  shortcuts: { flexDirection: 'row', gap: 12 },
  shortcut: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: minTouch, borderRadius: 16, backgroundColor: colors.primaryTint },
  shortcutText: { fontFamily: fonts.bold, fontSize: 14, color: colors.primaryText },
  grid: { flexDirection: 'row', gap: 12 },
  kpi: { flex: 1, backgroundColor: colors.surface, borderRadius: 20, padding: 14, gap: 4, ...shadows.card },
  pressed: { opacity: 0.85 },
  kpiHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kpiLabel: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  kpiIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  kpiValue: { fontFamily: fonts.extrabold, fontSize: 19, letterSpacing: -0.3, color: colors.ink },
  kpiNote: { fontFamily: fonts.medium, fontSize: 11, color: colors.gray500 },
  deltaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 2 },
  delta: { flex: 1, fontFamily: fonts.semibold, fontSize: 11, color: colors.gray500 },
  good: { color: colors.success },
  bad: { color: colors.danger },
  pill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  pillGood: { backgroundColor: colors.successTint },
  pillBad: { backgroundColor: colors.dangerTint },
  pillText: { fontFamily: fonts.bold, fontSize: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 28 },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  cardMeta: { fontFamily: fonts.semibold, fontSize: 12, color: colors.gray500 },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
  result: { fontFamily: fonts.extrabold, fontSize: 26, letterSpacing: -0.5, color: colors.ink },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  lineLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.gray600 },
  lineValue: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  hint: { fontFamily: fonts.medium, fontSize: 11, color: colors.gray500, lineHeight: 16 },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  legend: { flex: 1, gap: 10 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendName: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  legendValue: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  goalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  goalValue: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.ink },
  goalOf: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.gray500 },
  goalPct: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.ink },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.gray150, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5, backgroundColor: colors.primary },
  fillAttention: { backgroundColor: colors.primaryText },
  fillWarn: { backgroundColor: colors.danger },
  attention: { color: colors.primaryText },
  warn: { fontFamily: fonts.bold, fontSize: 12, color: colors.danger },
  insight: { backgroundColor: colors.ink, borderRadius: radius.card, padding: 18, gap: 10 },
  insightHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  insightTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.white },
  insightText: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.gray300 },
  section: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.ink, marginTop: 4 },
  list: { gap: 0, paddingVertical: 4 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  fabSpace: { height: 70 },
});
