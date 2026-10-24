import { router } from 'expo-router';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { ErrorCard } from '@/components/ErrorCard';
import { Fab } from '@/components/Fab';
import { QueryStates, Skeleton } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { AgendaRow } from '@/features/agenda/AgendaRow';
import { useAgenda, useUnscheduled } from '@/features/agenda/api';
import { groupByDay, itemsOnDay, overlapping, sameDay, weekDays, weekdayShort } from '@/features/agenda/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { formatDateBR } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { colors, fonts, minTouch, radius } from '@/theme/tokens';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEKDAY_LONG = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

type AgendaView = 'day' | 'week';

export default function AgendaScreen() {
  const { orgId, config } = useOrg();
  const appointments = config.profile === 'appointments';
  const today = new Date();
  const [anchor, setAnchor] = useState(today);
  const [selected, setSelected] = useState(today);
  const [mode, setMode] = useState<AgendaView>('day');
  const days = weekDays(anchor);
  const from = days[0];
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7);
  const week = useAgenda(orgId, from.toISOString(), to.toISOString());
  const unscheduled = useUnscheduled(orgId);

  const items = week.data ?? [];
  const dayItems = itemsOnDay(items, selected);
  const conflicts = overlapping(items);
  const groups = groupByDay(items, days);
  const shiftWeek = (n: number) => {
    const a = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 7 * n);
    setAnchor(a);
    setSelected(weekDays(a)[0]);
  };
  const plural = config.tabLabels.pedidos.toLowerCase();
  const newLabel = `Novo ${config.orderNoun}`;
  const onNew = () =>
    appointments ? router.push({ pathname: '/horarios/novo', params: { data: formatDateBR(selected) } }) : router.push('/pedidos/novo');

  return (
    <View style={styles.flex}>
      <Screen>
        <Text style={styles.title} accessibilityRole="header">
          {config.tabLabels.agenda}
        </Text>

        <SegmentedControl
          accessibilityLabel="Visualização"
          value={mode}
          onChange={setMode}
          segments={[
            { value: 'day', label: 'Dia' },
            { value: 'week', label: 'Semana' },
          ]}
        />

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
            const isSel = mode === 'day' && sameDay(d, selected);
            const count = itemsOnDay(items, d).length;
            return (
              <Pressable
                key={d.toISOString()}
                accessibilityRole="button"
                accessibilityState={{ selected: isSel }}
                accessibilityLabel={`${weekdayShort(d)} ${d.getDate()}, ${count} ${count === 1 ? config.orderNoun : plural}`}
                onPress={() => {
                  setSelected(d);
                  setMode('day');
                }}
                style={[styles.day, isSel && styles.daySel]}
              >
                <Text style={[styles.dayName, isSel && styles.dayTextSel]}>{weekdayShort(d)}</Text>
                <Text style={[styles.dayNum, isSel && styles.dayTextSel, sameDay(d, today) && !isSel && styles.today]}>{d.getDate()}</Text>
                {mode === 'week' && count > 0 ? (
                  <Text style={[styles.count]}>{count}</Text>
                ) : (
                  <View style={[styles.dot, count === 0 && styles.dotHidden, isSel && styles.dotSel]} />
                )}
              </Pressable>
            );
          })}
        </View>

        {week.isPending ? (
          <Card>
            <Skeleton rows={2} />
          </Card>
        ) : week.error ? (
          <ErrorCard message={friendlyError(week.error)} onRetry={() => week.refetch()} />
        ) : mode === 'day' ? (
          <Card style={styles.list}>
            <Text style={styles.cardTitle}>
              {sameDay(selected, today) ? 'Hoje' : WEEKDAY_LONG[selected.getDay()]}, {selected.getDate()} {MONTHS[selected.getMonth()]}
            </Text>
            {dayItems.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="Nada agendado neste dia"
                description={appointments ? `Toque em "${newLabel}" para marcar um horário.` : 'Os serviços com data marcada aparecem aqui.'}
              />
            ) : (
              dayItems.map((o, i) => <AgendaRow key={o.id} item={o} first={i === 0} conflict={conflicts.has(o.id)} />)
            )}
          </Card>
        ) : groups.length === 0 ? (
          <Card>
            <EmptyState icon={CalendarDays} title="Nada agendado nesta semana" />
          </Card>
        ) : (
          groups.map((g) => (
            <Card key={g.day.toISOString()} style={styles.list}>
              <Text style={styles.cardTitle}>
                {sameDay(g.day, today) ? 'Hoje' : WEEKDAY_LONG[g.day.getDay()]}, {g.day.getDate()} {MONTHS[g.day.getMonth()]}
              </Text>
              {g.items.map((o, i) => (
                <AgendaRow key={o.id} item={o} first={i === 0} conflict={conflicts.has(o.id)} />
              ))}
            </Card>
          ))
        )}

        {!appointments ? (
          <Card style={styles.list}>
            <Text style={styles.cardTitle}>Sem data marcada</Text>
            <QueryStates
              query={unscheduled}
              isEmpty={unscheduled.data?.length === 0}
              empty={{ icon: CalendarDays, title: 'Tudo agendado', description: 'Serviços em aberto sem data aparecem aqui.' }}
            />
            {unscheduled.data?.map((o, i) => <AgendaRow key={o.id} item={o} first={i === 0} />)}
          </Card>
        ) : null}
        <View style={styles.fabSpace} />
      </Screen>
      <Fab label={newLabel} onPress={onNew} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  count: { fontFamily: fonts.extrabold, fontSize: 10, color: colors.primaryText },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink, marginBottom: 4 },
  list: { paddingVertical: 10, gap: 0 },
  fabSpace: { height: 70 },
});
