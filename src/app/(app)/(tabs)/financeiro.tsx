import { router } from 'expo-router';
import { ChartColumn, ChevronLeft, ChevronRight, Landmark, Wallet } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { CircleButton } from '@/components/DetailBar';
import { ErrorCard } from '@/components/ErrorCard';
import { Fab } from '@/components/Fab';
import { QueryStates, Skeleton } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useAccounts, useFinanceSummary, useOpenEntries, usePeriodEntries } from '@/features/finance/api';
import { EntryRow } from '@/features/finance/EntryRow';
import { cashNet, operatingResult, type PeriodMode, periodFor } from '@/features/finance/logic';
import { useMeiYear } from '@/features/mei/api';
import { LEVEL_TEXT, limitLevel, yearTotal } from '@/features/mei/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { friendlyError } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { colors, fonts, minTouch, radius } from '@/theme/tokens';

type ListTab = 'receivable' | 'payable' | 'period';

export default function FinanceScreen() {
  const { orgId, config } = useOrg();
  const [mode, setMode] = useState<PeriodMode>('month');
  const [offset, setOffset] = useState(0);
  const [tab, setTab] = useState<ListTab>('receivable');
  const period = periodFor(mode, offset);

  const summary = useFinanceSummary(orgId, period.from, period.to);
  const accounts = useAccounts(orgId);
  const receivable = useOpenEntries(orgId, 'receivable');
  const payable = useOpenEntries(orgId, 'payable');
  const periodEntries = usePeriodEntries(orgId, period.from, period.to);
  const list = tab === 'receivable' ? receivable : tab === 'payable' ? payable : periodEntries;
  const s = summary.data;
  const activeAccounts = (accounts.data ?? []).filter((a) => a.active);
  const totalBalance = activeAccounts.reduce((sum, a) => sum + a.balance_cents, 0);

  return (
    <View style={styles.flex}>
      <Screen>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {config.tabLabels.financeiro}
          </Text>
          <CircleButton label="Relatórios" icon={<ChartColumn size={20} color={colors.ink} />} onPress={() => router.push('/financeiro/relatorios')} />
          <CircleButton label="Contas e transferências" icon={<Landmark size={20} color={colors.ink} />} onPress={() => router.push('/financeiro/contas')} />
        </View>

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
          <Skeleton rows={3} />
        ) : summary.error || !s ? (
          <ErrorCard message={friendlyError(summary.error)} onRetry={() => summary.refetch()} />
        ) : (
          <>
            <View style={styles.hero}>
              <View style={styles.glow} pointerEvents="none" />
              <Text style={styles.heroLabel}>Saldo de caixa no período</Text>
              <Text style={styles.heroValue}>{formatCents(cashNet(s))}</Text>
              <View style={styles.heroRow}>
                <Text style={styles.heroSub}>Entrou {formatCents(s.received_cents)}</Text>
                <Text style={styles.heroSub}>Saiu {formatCents(s.paid_cents)}</Text>
              </View>
              <Text style={styles.heroHint}>Dinheiro recebido menos dinheiro pago nas datas do período. Não é lucro.</Text>
            </View>

            <View style={styles.tiles}>
              <Pressable accessibilityRole="button" onPress={() => setTab('receivable')} style={styles.tile}>
                <Text style={styles.tileLabel}>A receber</Text>
                <Text style={styles.tileValue}>{formatCents(s.open_receivable_cents)}</Text>
                {s.overdue_receivable_cents > 0 ? <Text style={styles.overdue}>{formatCents(s.overdue_receivable_cents)} vencido</Text> : null}
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setTab('payable')} style={styles.tile}>
                <Text style={styles.tileLabel}>A pagar</Text>
                <Text style={styles.tileValue}>{formatCents(s.open_payable_cents)}</Text>
                {s.overdue_payable_cents > 0 ? <Text style={styles.overdue}>{formatCents(s.overdue_payable_cents)} vencido</Text> : null}
              </Pressable>
            </View>

            <Card>
              <Text style={styles.cardTitle}>Resultado estimado do período</Text>
              <Text style={[styles.result, operatingResult(s) < 0 && styles.negative]}>{formatCents(operatingResult(s))}</Text>
              <Line label="Vendas e serviços" value={s.revenue_cents} />
              <Line label="Despesas do negócio e impostos" value={-s.operating_expense_cents} />
              <Text style={styles.hint}>
                Por data de competência, pagos ou não. Fora do resultado: compras de estoque ({formatCents(s.inventory_purchase_cents)}), investimentos (
                {formatCents(s.investment_cents)}), retiradas do dono ({formatCents(s.owner_withdrawal_cents)}) e outras receitas (
                {formatCents(s.other_revenue_cents)}). O custo do que foi vendido ainda não é calculado, então é uma estimativa, não um valor contábil.
              </Text>
              {s.expected_in_cents > 0 || s.expected_out_cents > 0 ? (
                <Text style={styles.hint}>
                  Previsto até o fim do período (em aberto, vencidos incluídos): entra {formatCents(s.expected_in_cents)}, sai{' '}
                  {formatCents(s.expected_out_cents)}.
                </Text>
              ) : null}
            </Card>
          </>
        )}

        <MeiCard orgId={orgId} />

        <Card>
          <Pressable accessibilityRole="button" onPress={() => router.push('/financeiro/contas')} style={styles.accountsHead}>
            <Text style={styles.cardTitle}>Saldo nas contas</Text>
            <Text style={styles.cardTitle}>{accounts.data ? formatCents(totalBalance) : '–'}</Text>
          </Pressable>
          {activeAccounts.map((a) => (
            <View key={a.id} style={styles.lineRow}>
              <Text style={styles.lineLabel}>{a.name}</Text>
              <Text style={[styles.lineValue, a.balance_cents < 0 && styles.negative]}>{formatCents(a.balance_cents)}</Text>
            </View>
          ))}
          <Text style={styles.hint}>Saldo controlado pelo app a partir do saldo inicial. Confira com o extrato do banco.</Text>
        </Card>

        <SegmentedControl
          accessibilityLabel="Lista"
          value={tab}
          onChange={setTab}
          segments={[
            { value: 'receivable', label: 'A receber' },
            { value: 'payable', label: 'A pagar' },
            { value: 'period', label: 'No período' },
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

function Line({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.lineRow}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{formatCents(value)}</Text>
    </View>
  );
}

function MeiCard({ orgId }: { orgId: string }) {
  const year = new Date().getFullYear();
  const mei = useMeiYear(orgId, year);
  const d = mei.data;
  const total = d ? yearTotal(d.months) : 0;
  const limit = d?.limit?.annual_limit_cents ?? null;
  const level = limitLevel(total, limit);
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/financeiro/mei')}>
      <Card>
        <View style={styles.accountsHead}>
          <Text style={styles.cardTitle}>Faturamento do MEI em {year}</Text>
          <ChevronRight size={18} color={colors.gray500} />
        </View>
        <Text style={styles.lineLabel}>
          {!d
            ? mei.error
              ? 'Não foi possível carregar.'
              : 'Carregando…'
            : limit
              ? `${formatCents(total)} de ${formatCents(limit)} (${Math.round((total / limit) * 100)}%)${level !== 'ok' && level !== 'none' ? ` · ${LEVEL_TEXT[level]}` : ''}`
              : `${formatCents(total)} no ano · cadastre o limite anual para acompanhar`}
        </Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontFamily: fonts.extrabold, fontSize: 26, letterSpacing: -0.5, color: colors.ink },
  periodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { width: minTouch, height: minTouch, alignItems: 'center', justifyContent: 'center' },
  periodLabel: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  hero: { backgroundColor: colors.ink, borderRadius: radius.hero, padding: 20, gap: 4, overflow: 'hidden' },
  glow: { position: 'absolute', top: -120, right: -90, width: 240, height: 240, borderRadius: 120, backgroundColor: colors.primary, opacity: 0.45 },
  heroLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gray300 },
  heroValue: { fontFamily: fonts.extrabold, fontSize: 32, letterSpacing: -0.7, color: colors.white },
  heroRow: { flexDirection: 'row', gap: 16 },
  heroSub: { fontFamily: fonts.semibold, fontSize: 13, color: colors.primarySoft },
  heroHint: { fontFamily: fonts.medium, fontSize: 11, color: colors.gray400, marginTop: 4 },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, backgroundColor: colors.surface, borderRadius: 20, padding: 16, gap: 2 },
  tileLabel: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  tileValue: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.ink },
  overdue: { fontFamily: fonts.bold, fontSize: 12, color: colors.primaryText },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  result: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.ink },
  negative: { color: colors.primaryText },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  lineLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.gray600 },
  lineValue: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  hint: { fontFamily: fonts.medium, fontSize: 11, color: colors.gray500, lineHeight: 16 },
  accountsHead: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 32, alignItems: 'center' },
  list: { gap: 0, paddingVertical: 4 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  fabSpace: { height: 70 },
});
