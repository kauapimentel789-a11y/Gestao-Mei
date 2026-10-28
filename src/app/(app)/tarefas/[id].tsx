import { router, useLocalSearchParams } from 'expo-router';
import { Pencil } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CircleButton, DetailBar } from '@/components/DetailBar';
import { ErrorCard } from '@/components/ErrorCard';
import { FormError } from '@/components/FormError';
import { Skeleton } from '@/components/ListStates';
import { ReasonDialog } from '@/components/ReasonDialog';
import { Screen } from '@/components/Screen';
import { TextLink } from '@/components/TextLink';
import { useToast } from '@/components/Toast';
import { formatISODate, toISODate } from '@/features/finance/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { useMembers, useSetTaskStatus, useTask } from '@/features/tasks/api';
import { isTaskLate, nextActions, PRIORITY_LABEL, TASK_STATUS_LABEL, type TaskStatus } from '@/features/tasks/logic';
import { formatWhen } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { goBack } from '@/lib/navigation';
import { colors, fonts } from '@/theme/tokens';

const DIALOG = {
  blocked: { title: 'Bloquear tarefa?', description: 'Conte o que está impedindo, para ficar no histórico.', confirm: 'Bloquear', placeholder: 'Ex.: esperando o material chegar' },
  cancelled: {
    title: 'Cancelar tarefa?',
    description: 'A tarefa sai das listas abertas e não pode ser reaberta. Ela continua no histórico.',
    confirm: 'Cancelar tarefa',
    placeholder: 'Ex.: cliente desistiu',
  },
} as const;

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orgId, config } = useOrg();
  const query = useTask(orgId, id);
  const members = useMembers(orgId);
  const setStatus = useSetTaskStatus(orgId);
  const toast = useToast();
  const [dialog, setDialog] = useState<'blocked' | 'cancelled' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (query.isPending) {
    return (
      <Screen>
        <DetailBar title="Tarefa" />
        <Skeleton rows={4} />
      </Screen>
    );
  }
  if (query.error || !query.data) {
    return (
      <Screen>
        <DetailBar title="Tarefa" />
        <ErrorCard message={friendlyError(query.error)} onRetry={() => query.refetch()} />
      </Screen>
    );
  }

  const t = query.data;
  const late = isTaskLate(t, toISODate(new Date()));
  const names = new Map((members.data ?? []).map((m) => [m.user_id, m.name]));

  const change = async (status: TaskStatus, note?: string) => {
    setError(null);
    try {
      await setStatus.mutateAsync({ id: t.id, status, note });
      setDialog(null);
      toast(`Tarefa: ${TASK_STATUS_LABEL[status].toLowerCase()}`);
      // Concluiu: volta para onde estava, sem precisar tocar em voltar.
      if (status === 'done') goBack();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Screen>
      <DetailBar
        title="Tarefa"
        right={
          t.status !== 'cancelled' ? (
            <CircleButton
              label="Editar tarefa"
              icon={<Pencil size={18} color={colors.ink} />}
              onPress={() => router.push({ pathname: '/tarefas/form', params: { id: t.id } })}
            />
          ) : undefined
        }
      />

      <Card>
        <Text style={styles.status}>{TASK_STATUS_LABEL[t.status]}</Text>
        <Text style={styles.title}>{t.title}</Text>
        {t.description ? <Text style={styles.body}>{t.description}</Text> : null}
        <View style={styles.meta}>
          <Meta label="Prioridade" value={PRIORITY_LABEL[t.priority]} />
          <Meta label="Prazo" value={t.due_date ? `${formatISODate(t.due_date)}${late ? ' · atrasada' : ''}` : 'Sem prazo'} warn={late} />
          <Meta label="Responsável" value={t.assignee_name ?? 'Ninguém'} />
        </View>
        {t.order_id ? (
          <TextLink
            label={`Ver ${config.orderNoun} #${t.order_number}${t.customer_name ? ` · ${t.customer_name}` : ''}`}
            onPress={() => router.push({ pathname: '/pedidos/[id]', params: { id: t.order_id! } })}
          />
        ) : null}
      </Card>

      {nextActions(t.status).map((a, i) => (
        <Button
          key={a.status}
          label={a.label}
          variant={i === 0 ? 'primary' : 'tint'}
          loading={setStatus.isPending && setStatus.variables?.status === a.status}
          onPress={() => (a.status === 'blocked' ? setDialog('blocked') : change(a.status))}
        />
      ))}
      {!dialog ? <FormError message={error} /> : null}

      <Card style={styles.history}>
        <Text style={styles.cardTitle}>Histórico</Text>
        {t.history.map((h, i) => (
          <View key={h.id} style={[styles.histRow, i > 0 && styles.divider]}>
            <Text style={styles.histTitle}>{h.from_status ? `${TASK_STATUS_LABEL[h.from_status]} → ${TASK_STATUS_LABEL[h.to_status]}` : 'Criada'}</Text>
            {h.note ? <Text style={styles.body}>{h.note}</Text> : null}
            <Text style={styles.muted}>
              {formatWhen(new Date(h.changed_at))}
              {names.get(h.changed_by) ? ` · ${names.get(h.changed_by)}` : ''}
            </Text>
          </View>
        ))}
      </Card>

      {t.status !== 'cancelled' && t.status !== 'done' ? (
        <TextLink
          label="Cancelar tarefa"
          onPress={() => {
            setError(null);
            setDialog('cancelled');
          }}
        />
      ) : null}

      {dialog ? (
        <ReasonDialog
          visible
          title={DIALOG[dialog].title}
          description={DIALOG[dialog].description}
          keepLabel="Voltar"
          confirmLabel={DIALOG[dialog].confirm}
          placeholder={DIALOG[dialog].placeholder}
          loading={setStatus.isPending}
          error={error}
          onClose={() => setDialog(null)}
          onConfirm={(reason) => change(dialog, reason)}
        />
      ) : null}
    </Screen>
  );
}

function Meta({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, warn && styles.warn]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  status: { fontFamily: fonts.bold, fontSize: 12, color: colors.primaryText },
  title: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  meta: { gap: 0, marginTop: 4 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 36, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.divider },
  metaLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gray500 },
  metaValue: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  warn: { color: colors.primaryText },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink, marginBottom: 4 },
  history: { gap: 0 },
  histRow: { paddingVertical: 10, gap: 2 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  histTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
});
