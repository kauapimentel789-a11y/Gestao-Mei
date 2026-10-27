// Linha de meta: nome, guardado de quanto, barra e o que falta.
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatCents } from '@/lib/money';
import { colors, fonts } from '@/theme/tokens';

import type { Goal } from './api';
import { goalStatus } from './logic';
import { ProgressBar } from './ProgressBar';

export function goalLine(goal: Goal, today: string): string {
  const s = goalStatus(goal.target_cents, goal.saved_cents, goal.target_date, today);
  if (goal.completed_at) return 'Meta concluída';
  if (s.reached) return 'Valor atingido!';
  if (s.monthly !== null && s.monthsLeft !== null) {
    return s.monthsLeft > 0
      ? `Faltam ${formatCents(s.remaining)} · guarde ${formatCents(s.monthly)} por mês`
      : `Faltam ${formatCents(s.remaining)} · o prazo já passou`;
  }
  return `Faltam ${formatCents(s.remaining)}`;
}

export function GoalRow({ goal, today }: { goal: Goal; today: string }) {
  const s = goalStatus(goal.target_cents, goal.saved_cents, goal.target_date, today);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/meta/[id]', params: { id: goal.id } })}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.head}>
        <Text style={styles.name} numberOfLines={1}>
          {goal.name}
        </Text>
        <Text style={styles.pct}>{s.pct}%</Text>
      </View>
      <ProgressBar ratio={s.pct / 100} label={`${goal.name}: ${s.pct}%`} />
      <Text style={styles.muted}>
        {formatCents(goal.saved_cents)} de {formatCents(goal.target_cents)} · {goalLine(goal, today)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6, paddingVertical: 12 },
  pressed: { backgroundColor: colors.rowPressed },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  name: { flex: 1, fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  pct: { fontFamily: fonts.extrabold, fontSize: 13, color: colors.ink },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
});
