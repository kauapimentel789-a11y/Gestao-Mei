import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chips } from '@/components/Chips';
import { DetailBar } from '@/components/DetailBar';
import { ErrorCard } from '@/components/ErrorCard';
import { FormError } from '@/components/FormError';
import { Skeleton } from '@/components/ListStates';
import { PickerModal } from '@/components/PickerModal';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { formatISODate, parseDateInput } from '@/features/finance/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { type TaskOverview, useMembers, useSaveTask, useTask } from '@/features/tasks/api';
import { PRIORITY_LABEL, type TaskPriority } from '@/features/tasks/logic';
import { formatDateBR } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { colors, fonts, radius } from '@/theme/tokens';
import { goBack } from '@/lib/navigation';

const PRIORITIES: TaskPriority[] = ['low', 'normal', 'high'];

export default function TaskFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string; pedido?: string }>();
  const { orgId } = useOrg();
  const task = useTask(orgId, id);

  if (id && task.isPending) {
    return (
      <Screen>
        <DetailBar title="Editar tarefa" />
        <Skeleton rows={3} />
      </Screen>
    );
  }
  if (id && (task.error || !task.data)) {
    return (
      <Screen>
        <DetailBar title="Editar tarefa" />
        <ErrorCard message={friendlyError(task.error)} onRetry={() => task.refetch()} />
      </Screen>
    );
  }
  return <TaskForm task={id ? task.data : undefined} />;
}

function TaskForm({ task }: { task?: TaskOverview }) {
  const { pedido } = useLocalSearchParams<{ pedido?: string }>();
  const { orgId } = useOrg();
  const toast = useToast();
  const members = useMembers(orgId);
  const save = useSaveTask(orgId);

  const [key] = useState(newId);
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'normal');
  const [due, setDue] = useState(task?.due_date ? formatISODate(task.due_date) : '');
  const [assigneeId, setAssigneeId] = useState<string | null>(task?.assignee_id ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assignee = members.data?.find((m) => m.user_id === assigneeId);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const submit = async () => {
    setError(null);
    if (title.trim().length < 2) return setError('Informe o que precisa ser feito.');
    const dueDate = due.trim() ? parseDateInput(due) : null;
    if (due.trim() && !dueDate) return setError('Prazo inválido. Use dd/mm/aaaa.');
    try {
      const saved = await save.mutateAsync({
        id: task?.id,
        idempotencyKey: key,
        orderId: pedido ?? null,
        input: { title: title.trim(), description: description.trim(), priority, dueDate, assigneeId },
      });
      toast(task ? 'Tarefa atualizada' : 'Tarefa criada');
      if (task) goBack();
      else router.replace({ pathname: '/tarefas/[id]', params: { id: saved.id } });
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Screen>
      <DetailBar title={task ? 'Editar tarefa' : 'Nova tarefa'} />

      <Card>
        <TextField label="O que precisa ser feito" value={title} onChangeText={setTitle} placeholder="Ex.: comprar embalagens" maxLength={120} />
        <TextField label="Detalhes (opcional)" value={description} onChangeText={setDescription} multiline maxLength={1000} />
      </Card>

      <Card>
        <Text style={styles.label}>Prioridade</Text>
        <Chips accessibilityLabel="Prioridade" value={priority} onChange={setPriority} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} />
        <TextField label="Prazo (opcional)" value={due} onChangeText={setDue} placeholder="dd/mm/aaaa" mask="date" />
        <View style={styles.quick}>
          <QuickDate label="Hoje" onPress={() => setDue(formatDateBR(new Date()))} />
          <QuickDate label="Amanhã" onPress={() => setDue(formatDateBR(tomorrow))} />
          {due ? <QuickDate label="Sem prazo" onPress={() => setDue('')} /> : null}
        </View>
        <Text style={styles.label}>Responsável</Text>
        <Pressable accessibilityRole="button" onPress={() => setPickerOpen(true)} style={styles.select}>
          <Text style={[styles.selectText, !assignee && styles.placeholder]}>{assignee?.name ?? 'Sem responsável'}</Text>
          <ChevronRight size={18} color={colors.gray500} />
        </Pressable>
      </Card>

      <FormError message={error} />
      <Button label={task ? 'Salvar' : 'Criar tarefa'} onPress={submit} loading={save.isPending} />

      <PickerModal
        visible={pickerOpen}
        title="Responsável"
        searchPlaceholder="Buscar pessoa"
        options={(members.data ?? []).map((m) => ({ id: m.user_id, title: m.name }))}
        loading={members.isPending}
        selectedId={assigneeId}
        noneLabel="Sem responsável"
        emptyText="Nenhuma pessoa encontrada."
        onClose={() => setPickerOpen(false)}
        onSelect={(id) => {
          setAssigneeId(id);
          setPickerOpen(false);
        }}
      />
    </Screen>
  );
}

function QuickDate({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.quickChip} hitSlop={4}>
      <Text style={styles.quickText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  quick: { flexDirection: 'row', gap: 8 },
  quickChip: { borderRadius: radius.pill, backgroundColor: colors.gray100, paddingHorizontal: 12, paddingVertical: 8 },
  quickText: { fontFamily: fonts.bold, fontSize: 12, color: colors.ink },
  select: {
    minHeight: 50,
    borderRadius: radius.input,
    borderWidth: 1.5,
    borderColor: colors.gray200,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  placeholder: { color: colors.gray500 },
});
