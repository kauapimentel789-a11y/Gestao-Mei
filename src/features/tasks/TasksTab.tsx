// Aba de tarefas: hoje (inclui atrasadas), abertas e concluídas recentes.
import { router } from 'expo-router';
import { ClipboardList } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { Fab } from '@/components/Fab';
import { QueryStates } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { toISODate } from '@/features/finance/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { colors, fonts } from '@/theme/tokens';

import { useTasks } from './api';
import { filterTasks, type TaskFilter } from './logic';
import { TaskRow } from './TaskRow';

const EMPTY: Record<TaskFilter, { title: string; description: string }> = {
  today: { title: 'Nada para hoje', description: 'Tarefas com prazo para hoje ou atrasadas aparecem aqui.' },
  open: { title: 'Nenhuma tarefa aberta', description: 'Crie tarefas avulsas ou gere as etapas a partir de um pedido.' },
  done: { title: 'Nada concluído ainda', description: 'Tarefas concluídas nos últimos 30 dias aparecem aqui.' },
};

export function TasksTab({ title, header }: { title: string; header?: ReactNode }) {
  const { orgId, config } = useOrg();
  const tasks = useTasks(orgId);
  const [filter, setFilter] = useState<TaskFilter>('today');
  const today = toISODate(new Date());
  const all = tasks.data ?? [];
  const list = filterTasks(all, filter, today);
  const count = (f: TaskFilter) => (tasks.data ? ` (${filterTasks(all, f, today).length})` : '');

  return (
    <View style={styles.flex}>
      <Screen>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {header}
        <SegmentedControl
          accessibilityLabel="Filtro de tarefas"
          value={filter}
          onChange={setFilter}
          segments={[
            { value: 'today', label: `Hoje${count('today')}` },
            { value: 'open', label: `Abertas${count('open')}` },
            { value: 'done', label: 'Concluídas' },
          ]}
        />
        <Card style={styles.list}>
          <QueryStates
            query={tasks}
            isEmpty={list.length === 0}
            empty={{
              icon: ClipboardList,
              ...EMPTY[filter],
              action: filter === 'done' ? undefined : { label: 'Nova tarefa', onPress: () => router.push('/tarefas/form') },
            }}
          />
          {list.map((t, i) => (
            <TaskRow key={t.id} task={t} first={i === 0} orderNoun={capitalize(config.orderNoun)} />
          ))}
        </Card>
        <View style={styles.fabSpace} />
      </Screen>
      <Fab label="Nova tarefa" onPress={() => router.push('/tarefas/form')} />
    </View>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: { fontFamily: fonts.extrabold, fontSize: 26, letterSpacing: -0.5, color: colors.ink },
  list: { paddingVertical: 4, gap: 0 },
  fabSpace: { height: 70 },
});
