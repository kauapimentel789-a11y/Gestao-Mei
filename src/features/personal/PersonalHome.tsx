// Início de "Minhas finanças": saldo das contas, o mês (entrou, saiu, sobrou),
// para onde foi o dinheiro e os últimos lançamentos. Valores do banco.
import { router } from 'expo-router';
import { ArrowDownLeft, ArrowUpRight, ChevronRight, CreditCard, Layers, Settings, Sparkles, Wallet } from 'lucide-react-native';
import { type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { QueryStates, Skeleton } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/features/auth/AuthProvider';
import { BillRow, useBills } from '@/features/cards/BillsList';
import { PendingInvites } from '@/features/family/PendingInvites';
import { useAccounts, useFinanceSummary, usePeriodEntries } from '@/features/finance/api';
import { Donut, SLICE_COLORS } from '@/features/finance/charts';
import { expenseSlices, formatCompactCents, formatPct } from '@/features/finance/dashboard';
import { EntryRow } from '@/features/finance/EntryRow';
import { cashNet, periodFor, toISODate } from '@/features/finance/logic';
import { SpaceSwitcher } from '@/features/organizations/SpaceSwitcher';
import { useSpace } from '@/features/organizations/useOrg';
import { useBudgetOverview, useGoals } from '@/features/planning/api';
import { GoalRow } from '@/features/planning/GoalRow';
import { budgetProgress, budgetTotals } from '@/features/planning/logic';
import { ProgressBar } from '@/features/planning/ProgressBar';
import { useFinanceReport } from '@/features/reports/api';
import { formatLongToday, greeting } from '@/lib/dates';
import { formatCents } from '@/lib/money';
import { colors, fonts, minTouch, radius } from '@/theme/tokens';

import { personalInsight } from './logic';

const logo = require('../../../assets/brand/logo-tile-dark.png');

export function PersonalHome() {
  const { session } = useAuth();
  const { orgId } = useSpace();
  const month = periodFor('month', 0);
  const previous = periodFor('month', -1);
  const accounts = useAccounts(orgId);
  const summary = useFinanceSummary(orgId, month.from, month.to);
  const prevSummary = useFinanceSummary(orgId, previous.from, previous.to);
  const report = useFinanceReport(orgId, month.from, month.to);
  const entries = usePeriodEntries(orgId, month.from, month.to);
  const bills = useBills(orgId);
  const budget = useBudgetOverview(orgId, month.from);
  const goals = useGoals(orgId);

  const firstName = String(session?.user.user_metadata?.display_name ?? '').split(' ')[0];
  const active = (accounts.data ?? []).filter((a) => a.active);
  const total = active.reduce((sum, a) => sum + a.balance_cents, 0);
  const s = summary.data;
  const slices = expenseSlices(report.data?.expense_by_category ?? []);
  const spent = slices.reduce((sum, x) => sum + x.cents, 0);
  const recent = (entries.data ?? []).filter((e) => e.status !== 'cancelled').slice(0, 5);
  const pending = bills.items;
  const today = toISODate(new Date());
  const totals = budgetTotals(budget.data ?? []);
  const budgetNow = budgetProgress(totals.spent, totals.limit, 100);
  const overBudget = (budget.data ?? []).filter((b) => b.amount_cents !== null && budgetProgress(b.spent_cents, b.amount_cents, b.alert_pct ?? 80).level !== 'ok');
  const activeGoals = (goals.data ?? []).filter((g) => !g.completed_at);

  return (
    <Screen>
      <View style={styles.header}>
        <Image source={logo} style={styles.logo} accessibilityIgnoresInvertColors />
        <View style={styles.flex}>
          <Text style={styles.date}>{formatLongToday()}</Text>
          <Text style={styles.greeting} accessibilityRole="header">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Configurações" onPress={() => router.push('/configuracoes')} style={styles.circle}>
          <Settings size={20} color={colors.ink} />
        </Pressable>
      </View>

      <SpaceSwitcher />
      <PendingInvites />

      <Pressable accessibilityRole="button" accessibilityLabel="Ver contas" onPress={() => router.push('/contas')} style={styles.hero}>
        <View style={styles.glow} pointerEvents="none" />
        <Text style={styles.kicker}>MINHAS FINANÇAS</Text>
        <Text style={styles.heroLabel}>Saldo nas suas contas</Text>
        <Text style={styles.heroValue}>{accounts.data ? formatCents(total) : '–'}</Text>
        <Text style={styles.heroSub}>
          {active.length === 1 ? '1 conta' : `${active.length} contas`} · confira com o extrato do banco
        </Text>
      </Pressable>

      <View style={styles.actions}>
        <QuickAction label="Gastei" primary onPress={() => router.push('/financeiro/lancamento')} icon={<ArrowUpRight size={22} color={colors.white} />} />
        <QuickAction
          label="Recebi"
          onPress={() => router.push({ pathname: '/financeiro/lancamento', params: { tipo: 'entrada' } })}
          icon={<ArrowDownLeft size={22} color={colors.primaryText} />}
        />
        <QuickAction label="Parcelei" onPress={() => router.push('/financeiro/parcelado')} icon={<Layers size={22} color={colors.primaryText} />} />
        <QuickAction label="Cartões" onPress={() => router.push('/cartoes')} icon={<CreditCard size={22} color={colors.primaryText} />} />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Abrir o assistente"
        onPress={() => router.push('/assistente')}
        style={({ pressed }) => [styles.ask, pressed && styles.pressed]}
      >
        <Sparkles size={20} color={colors.primaryText} />
        <Text style={styles.askText}>Pergunte ao assistente: “quanto gastei com mercado?”</Text>
        <ChevronRight size={18} color={colors.gray500} />
      </Pressable>

      <Card>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>{month.label}</Text>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push('/financeiro')}>
            <Text style={styles.link}>Ver lançamentos</Text>
          </Pressable>
        </View>
        {summary.isPending ? (
          <Skeleton rows={2} />
        ) : !s ? (
          <Text style={styles.muted}>Não foi possível carregar o mês.</Text>
        ) : (
          <>
            <View style={styles.kpis}>
              <Kpi label="Entrou" value={s.received_cents} />
              <Kpi label="Saiu" value={s.paid_cents} />
              <Kpi label={cashNet(s) >= 0 ? 'Sobrou' : 'Faltou'} value={cashNet(s)} strong />
            </View>
            <Text style={styles.insight}>
              {personalInsight({ inCents: s.received_cents, outCents: s.paid_cents, prevOutCents: prevSummary.data?.paid_cents, top: slices[0] })}
            </Text>
          </>
        )}
      </Card>

      {pending.length > 0 ? (
        <Card style={styles.list}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/a-pagar')} style={styles.cardHead}>
            <Text style={styles.cardTitle}>Contas a pagar</Text>
            <ChevronRight size={18} color={colors.gray500} />
          </Pressable>
          {pending.slice(0, 3).map((b, i) => (
            <View key={b.key} style={i > 0 && styles.divider}>
              <BillRow item={b} overdue={b.dueDate < today} />
            </View>
          ))}
          {pending.length > 3 ? <Text style={styles.muted}>+ {pending.length - 3} em aberto</Text> : null}
        </Card>
      ) : null}

      {budget.data ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/orcamento')}>
          <Card>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Orçamento do mês</Text>
              <ChevronRight size={18} color={colors.gray500} />
            </View>
            {totals.count === 0 ? (
              <Text style={styles.muted}>Defina quanto quer gastar por categoria e veja quando estiver chegando perto do limite.</Text>
            ) : (
              <>
                <ProgressBar ratio={budgetNow.ratio} level={budgetNow.level} label="Orçamento do mês" />
                <Text style={styles.insight}>
                  {formatCents(totals.spent)} de {formatCents(totals.limit)}
                  {overBudget.length > 0 ? ` · atenção em ${overBudget.map((b) => b.category_name).join(', ')}` : ' · tudo dentro do limite'}
                </Text>
              </>
            )}
          </Card>
        </Pressable>
      ) : null}

      <Card style={styles.list}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/metas')} style={styles.cardHead}>
          <Text style={styles.cardTitle}>Metas</Text>
          <ChevronRight size={18} color={colors.gray500} />
        </Pressable>
        {activeGoals.length === 0 ? (
          <Text style={styles.muted}>Junte dinheiro para uma viagem, uma reserva ou o que quiser. Toque para criar uma meta.</Text>
        ) : (
          activeGoals.slice(0, 2).map((g, i) => (
            <View key={g.id} style={i > 0 && styles.divider}>
              <GoalRow goal={g} today={today} />
            </View>
          ))
        )}
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Para onde foi o dinheiro</Text>
        {report.isPending ? (
          <Skeleton rows={2} />
        ) : slices.length === 0 ? (
          <Text style={styles.muted}>Nenhum gasto lançado neste mês.</Text>
        ) : (
          <View style={styles.donutRow}>
            <Donut slices={slices} centerValue={formatCompactCents(spent)} centerLabel="em gastos" size={124} />
            <View style={styles.legend}>
              {slices.map((x, i) => (
                <View key={x.key} style={styles.legendRow}>
                  <View style={[styles.dot, { backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }]} />
                  <View style={styles.flex}>
                    <Text style={styles.legendName} numberOfLines={1}>
                      {x.name}
                    </Text>
                    <Text style={styles.muted}>
                      {formatCents(x.cents)} · {formatPct(x.pct)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
      </Card>

      <Card style={styles.list}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/financeiro')} style={styles.cardHead}>
          <Text style={styles.cardTitle}>Últimos lançamentos</Text>
          <ChevronRight size={18} color={colors.gray500} />
        </Pressable>
        <QueryStates
          query={entries}
          isEmpty={recent.length === 0}
          empty={{
            icon: Wallet,
            title: 'Nenhum lançamento neste mês',
            description: 'Anote o que entrou e o que saiu para saber para onde vai o seu dinheiro.',
            action: { label: 'Lançar um gasto', onPress: () => router.push('/financeiro/lancamento') },
          }}
        />
        {recent.map((e, i) => (
          <View key={e.id} style={i > 0 && styles.divider}>
            <EntryRow entry={e} />
          </View>
        ))}
      </Card>
    </Screen>
  );
}

function Kpi({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, strong && styles.kpiStrong, strong && value < 0 && styles.negative]} numberOfLines={1} adjustsFontSizeToFit>
        {formatCents(Math.abs(value))}
      </Text>
    </View>
  );
}

function QuickAction({ label, icon, onPress, primary }: { label: string; icon: ReactNode; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.action}>
      <View style={[styles.actionTile, primary && styles.actionTilePrimary]}>{icon}</View>
      <Text style={styles.actionLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 44, height: 44, borderRadius: 14 },
  date: { fontFamily: fonts.semibold, fontSize: 12, color: colors.gray500 },
  greeting: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.ink },
  circle: { width: minTouch, height: minTouch, borderRadius: minTouch / 2, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  hero: { backgroundColor: colors.ink, borderRadius: radius.hero, padding: 20, gap: 4, overflow: 'hidden' },
  glow: { position: 'absolute', top: -120, right: -90, width: 240, height: 240, borderRadius: 120, backgroundColor: colors.primary, opacity: 0.45 },
  kicker: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 2.6, color: colors.primary },
  heroLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gray300, marginTop: 6 },
  heroValue: { fontFamily: fonts.extrabold, fontSize: 34, letterSpacing: -0.7, color: colors.white },
  heroSub: { fontFamily: fonts.semibold, fontSize: 12, color: colors.primarySoft },
  actions: { flexDirection: 'row', gap: 8 },
  ask: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: minTouch,
    backgroundColor: colors.primaryTint,
    borderRadius: radius.card,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  pressed: { opacity: 0.8 },
  askText: { flex: 1, fontFamily: fonts.bold, fontSize: 14, color: colors.primaryText },
  action: { flex: 1, alignItems: 'center', gap: 6 },
  actionTile: { width: 56, height: 56, borderRadius: radius.quickAction, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  actionTilePrimary: { backgroundColor: colors.primary },
  actionLabel: { fontFamily: fonts.bold, fontSize: 12, color: colors.ink, textAlign: 'center' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 28 },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  link: { fontFamily: fonts.bold, fontSize: 13, color: colors.primaryText },
  kpis: { flexDirection: 'row', gap: 8 },
  kpi: { flex: 1, backgroundColor: colors.bg, borderRadius: 16, padding: 12, gap: 2 },
  kpiLabel: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  kpiValue: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  kpiStrong: { color: colors.success },
  negative: { color: colors.danger },
  insight: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 19, color: colors.gray600 },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  list: { gap: 0 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  legend: { flex: 1, gap: 10 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendName: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
});
