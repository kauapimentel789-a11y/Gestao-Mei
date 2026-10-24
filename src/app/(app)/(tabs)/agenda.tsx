import { router } from 'expo-router';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Fab } from '@/components/Fab';
import { QueryStates, Skeleton } from '@/components/ListStates';
import { ErrorCard } from '@/components/ErrorCard';
import { Screen } from '@/components/Screen';
import { type AgendaItem, useAgenda, useUnscheduled } from '@/features/agenda/api';
import { durationLabel, itemsOnDay, overlapping, sameDay, weekDays, weekdayShort } from '@/features/agenda/logic';
import { StatusChip } from '@/features/orders/StatusChip';
import { useOrg } from '@/features/organizations/useOrg';
import { formatTimeBR } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { colors, fonts, minTouch, radius } from '@/theme/tokens';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export default function AgendaScreen() {
  const { orgId, config } = useOrg();
  const today = new Date();
  const [anchor, setAnchor] = useState(today);
  const [selected, setSelected] = useState(today);
  const days = weekDays(anchor);
  const from = days[0];
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7);
  const week = useAgenda(orgId, from.toISOString(), to.toISOString());
  const unscheduled = useUnscheduled(orgId);

  const items = week.data ?? [];
  const dayItems = itemsOnDay(items, selected);
  const conflicts = overlapping(dayItems);
  const shiftWeek = (n: number) => {
    const a = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 7 * n);
    setAnchor(a);
    setSelected(weekDays(a)[0]);
  };

  return (
    <View style={styles.flex}>
      <Screen>
        <Text style={styles.title} accessibilityRole="header">
          {config.tabLabels.agenda}
        </Text>

        <View style={styles.weekRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Semana anterior" onPress={() => shiftWeek(-1)} style={styles.arrow}>
            <ChevronLeft size={20} color={colors.ink} />
          </Pressable>
          <Text style={styles.weekLabel}>
            {days[0].getDate()} {MONTHS[days[0].getMonth()]} – {days[6].getDate()} {MONTHS[days[6].getMonth()]}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Próxima semana" onPress={() => shiftWeek(1)} style={styles.arrow}>
            <ChevronRight size={20} color={colors.ink} />
          </Pressable>
        </View>

        <View style={styles.days}>
          {days.map((d) => {
            const isSel = sameDay(d, selected);
            const count = itemsOnDay(items, d).length;
            return (
              <Pressable
                key={d.toISOString()}
                accessibilityRole="button"
                accessibilityState={{ selected: isSel }}
                accessibilityLabel={`${weekdayShort(d)} ${d.getDate()}, ${count} ${count === 1 ? 'serviço' : 'serviços'}`}
                onPress={() => setSelected(d)}
                style={[styles.day, isSel && styles.daySel]}
              >
                <Text style={[styles.dayName, isSel && styles.dayTextSel]}>{weekdayShort(d)}</Text>
                <Text style={[styles.dayNum, isSel && styles.dayTextSel, sameDay(d, today) && !isSel && styles.today]}>{d.getDate()}</Text>
                <View style={[styles.dot, count === 0 && styles.dotHidden, isSel && styles.dotSel]} />
              </Pressable>
            );
          })}
        </View>

        <Card style={styles.list}>
          {week.isPending ? (
            <Skeleton rows={2} />
          ) : week.error ? (
            <ErrorCard message={friendlyError(week.error)} onRetry={() => week.refetch()} />
          ) : dayItems.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Nada agendado neste dia" description="Os serviços com data marcada aparecem aqui." />
          ) : (
            dayItems.map((o, i) => <AgendaRow key={o.id} item={o} first={i === 0} conflict={conflicts.has(o.id)} />)
          )}
        </Card>

        <Card style={styles.list}>
          <Text style={styles.cardTitle}>Sem data marcada</Text>
          <QueryStates
            query={unscheduled}
            isEmpty={unscheduled.data?.length === 0}
            empty={{ icon: CalendarDays, title: 'Tudo agendado', description: 'Serviços em aberto sem data aparecem aqui.' }}
          />
          {unscheduled.data?.map((o, i) => <AgendaRow key={o.id} item={o} first={i === 0} />)}
        </Card>
        <View style={styles.fabSpace} />
      </Screen>
      <Fab label={`Novo ${config.orderNoun}`} onPress={() => router.push('/pedidos/novo')} />
    </View>
  );
}

function AgendaRow({ item: o, first, conflict }: { item: AgendaItem; first: boolean; conflict?: boolean }) {
  const { config } = useOrg();
  const start = o.scheduled_for ? new Date(o.scheduled_for) : null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/pedidos/[id]', params: { id: o.id } })}
      style={({ pressed }) => [styles.row, !first && styles.divider, pressed && styles.pressed]}
    >
      <View style={styles.time}>
        <Text style={styles.timeText}>{start ? formatTimeBR(start) : `#${o.number}`}</Text>
        {start ? <Text style={styles.muted}>{durationLabel(o.scheduled_minutes)}</Text> : null}
      </View>
      <View style={styles.flex}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {o.customer_name ?? 'Sem cliente'}
          {start ? ` · #${o.number}` : ''}
        </Text>
        <Text style={styles.muted} numberOfLines={1}>
          {o.problem_description || o.items_summary || ''}
        </Text>
        {conflict ? (
          <View style={styles.conflict}>
            <AlertTriangle size={12} color={colors.primaryText} />
            <Text style={styles.conflictText}>Horário em conflito com outro serviço</Text>
          </View>
        ) : null}
      </View>
      <StatusChip status={o.status} label={config.statusLabels[o.status]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.extrabold, fontSize: 26, letterSpacing: -0.5, color: colors.ink },
  weekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { width: minTouch, height: minTouch, borderRadius: minTouch / 2, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  weekLabel: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  days: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 10, borderRadius: radius.card, backgroundColor: colors.surface },
  daySel: { backgroundColor: colors.ink },
  dayName: { fontFamily: fonts.semibold, fontSize: 11, color: colors.gray500 },
  dayNum: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  dayTextSel: { color: colors.white },
  today: { color: colors.primaryText },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  dotHidden: { opacity: 0 },
  dotSel: { backgroundColor: colors.primarySoft },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink, marginBottom: 4 },
  list: { paddingVertical: 10, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  pressed: { backgroundColor: colors.rowPressed },
  time: { width: 52 },
  timeText: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.ink },
  rowTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  conflict: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  conflictText: { fontFamily: fonts.bold, fontSize: 11, color: colors.primaryText },
  fabSpace: { height: 70 },
});
