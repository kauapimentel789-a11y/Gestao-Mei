// Aba "Lançamentos" de Minhas finanças: o mês escolhido, quanto entrou e saiu e
// a lista filtrada por gastos ou entradas.
import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, Tags, Wallet } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { CircleButton } from '@/components/DetailBar';
import { Fab } from '@/components/Fab';
import { QueryStates } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useFinanceSummary, usePeriodEntries } from '@/features/finance/api';
import { EntryRow } from '@/features/finance/EntryRow';
import { cashNet, periodFor } from '@/features/finance/logic';
import { useSpace } from '@/features/organizations/useOrg';
import { formatCents } from '@/lib/money';
import { colors, fonts, minTouch } from '@/theme/tokens';

import { type EntryFilter, filterByDirection } from './logic';

const EMPTY: Record<EntryFilter, string> = {
  all: 'Nenhum lançamento neste mês',
  out: 'Nenhum gasto neste mês',
  in: 'Nenhuma entrada neste mês',
};

export function PersonalEntries() {
  const { orgId } = useSpace();
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<EntryFilter>('all');
  const month = periodFor('month', offset);
  const summary = useFinanceSummary(orgId, month.from, month.to);
  const entries = usePeriodEntries(orgId, month.from, month.to);
  const list = filterByDirection(entries.data ?? [], filter);
  const s = summary.data;

  return (
    <View style={styles.flex}>
      <Screen>
        <View style={styles.header}>
          <View style={styles.flex}>
            <Text style={styles.title} accessibilityRole="header">
              Lançamentos
            </Text>
            <Text style={styles.subtitle}>Tudo o que entrou e saiu</Text>
          </View>
          <CircleButton label="Categorias" icon={<Tags size={20} color={colors.ink} />} onPress={() => router.push('/financeiro/categorias')} />
        </View>

        <View style={styles.periodRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Mês anterior" onPress={() => setOffset(offset - 1)} style={styles.arrow}>
            <ChevronLeft size={20} color={colors.ink} />
          </Pressable>
          <Text style={styles.periodLabel}>{month.label}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Próximo mês" onPress={() => setOffset(offset + 1)} style={styles.arrow}>
            <ChevronRight size={20} color={colors.ink} />
          </Pressable>
        </View>

        <View style={styles.kpis}>
          <Kpi label="Entrou" value={s ? formatCents(s.received_cents) : '–'} />
          <Kpi label="Saiu" value={s ? formatCents(s.paid_cents) : '–'} />
          <Kpi label={s && cashNet(s) < 0 ? 'Faltou' : 'Sobrou'} value={s ? formatCents(Math.abs(cashNet(s))) : '–'} />
        </View>

        <SegmentedControl
          accessibilityLabel="Mostrar"
          value={filter}
          onChange={setFilter}
          segments={[
            { value: 'all', label: 'Tudo' },
            { value: 'out', label: 'Gastos' },
            { value: 'in', label: 'Entradas' },
          ]}
        />

        <Card style={styles.list}>
          <QueryStates
            query={entries}
            isEmpty={list.length === 0}
            empty={{
              icon: Wallet,
              title: EMPTY[filter],
              description: 'Toque no + para lançar o que você gastou ou recebeu.',
              action: { label: 'Novo lançamento', onPress: () => router.push('/financeiro/lancamento') },
            }}
          />
          {list.map((e, i) => (
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

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
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
  kpis: { flexDirection: 'row', gap: 8 },
  kpi: { flex: 1, backgroundColor: colors.surface, borderRadius: 16, padding: 12, gap: 2 },
  kpiLabel: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  kpiValue: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  list: { gap: 0, paddingVertical: 4 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  fabSpace: { height: 70 },
});
