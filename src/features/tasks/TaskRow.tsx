import { router } from 'expo-router';
import { Check, Circle, CircleDot, OctagonPause } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatShortDate, toISODate } from '@/features/finance/logic';
import { colors, fonts, radius } from '@/theme/tokens';

import type { TaskOverview } from './api';
import { isTaskLate, TASK_STATUS_LABEL } from './logic';

const ICON = { todo: Circle, in_progress: CircleDot, blocked: OctagonPause, done: Check, cancelled: Circle } as const;

export function TaskRow({ task: t, first, orderNoun, showOrder = true }: { task: TaskOverview; first?: boolean; orderNoun: string; showOrder?: boolean }) {
  const today = toISODate(new Date());
  const late = isTaskLate(t, today);
  const Icon = ICON[t.status];
  const closed = t.status === 'done' || t.status === 'cancelled';
  const meta = [
    t.due_date ? (t.due_date === today ? 'Hoje' : formatShortDate(t.due_date)) : null,
    t.assignee_name,
    showOrder && t.order_number ? `${orderNoun} #${t.order_number}${t.customer_name ? ` · ${t.customer_name}` : ''}` : null,
  ].filter(Boolean);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t.title}, ${TASK_STATUS_LABEL[t.status]}${late ? ', atrasada' : ''}`}
      onPress={() => router.push({ pathname: '/tarefas/[id]', params: { id: t.id } })}
      style={({ pressed }) => [styles.row, !first && styles.divider, pressed && styles.pressed]}
    >
      <Icon size={20} color={t.status === 'done' ? colors.primary : t.status === 'blocked' ? colors.primaryText : colors.gray400} />
      <View style={styles.flex}>
        <Text style={[styles.title, closed && styles.closed]} numberOfLines={2}>
          {t.title}
        </Text>
        {meta.length > 0 ? (
          <Text style={[styles.sub, late && styles.late]} numberOfLines={1}>
            {late ? 'Atrasada · ' : ''}
            {meta.join(' · ')}
          </Text>
        ) : null}
      </View>
      {t.priority === 'high' && !closed ? (
        <View style={styles.chip}>
          <Text style={styles.chipText}>Alta</Text>
        </View>
      ) : t.status === 'blocked' ? (
        <View style={styles.chip}>
          <Text style={styles.chipText}>Bloqueada</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  pressed: { backgroundColor: colors.rowPressed },
  title: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  closed: { color: colors.gray400, textDecorationLine: 'line-through' },
  sub: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  late: { color: colors.primaryText },
  chip: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.primaryTint },
  chipText: { fontFamily: fonts.bold, fontSize: 10, color: colors.primaryText },
});
