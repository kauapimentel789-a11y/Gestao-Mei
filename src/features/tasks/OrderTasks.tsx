// Tarefas de um pedido, no detalhe do pedido.
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ErrorCard } from '@/components/ErrorCard';
import { FormError } from '@/components/FormError';
import { Skeleton } from '@/components/ListStates';
import { TextLink } from '@/components/TextLink';
import { useToast } from '@/components/Toast';
import { useOrg } from '@/features/organizations/useOrg';
import { friendlyError } from '@/lib/errors';
import { colors, fonts } from '@/theme/tokens';

import { useGenerateOrderTasks, useOrderTasks } from './api';
import { TaskRow } from './TaskRow';

export function OrderTasks({ orderId, closed }: { orderId: string; closed: boolean }) {
  const { orgId, config } = useOrg();
  const tasks = useOrderTasks(orgId, orderId);
  const generate = useGenerateOrderTasks(orgId);
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  if (tasks.isPending) return <Skeleton rows={1} />;
  if (tasks.error) return <ErrorCard message={friendlyError(tasks.error)} onRetry={() => tasks.refetch()} />;
  const list = tasks.data;
  const hasSteps = list.some((t) => t.step_key);
  const done = list.filter((t) => t.status === 'done').length;
  const active = list.filter((t) => t.status !== 'cancelled').length;
  if (closed && list.length === 0) return null;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.cardTitle}>Tarefas</Text>
        {active > 0 ? (
          <Text style={styles.muted}>
            {done} de {active} concluídas
          </Text>
        ) : null}
      </View>
      {list.length === 0 ? <Text style={styles.body}>Divida o trabalho deste {config.orderNoun} em etapas para acompanhar o andamento.</Text> : null}
      {list.map((t, i) => (
        <TaskRow key={t.id} task={t} first={i === 0} orderNoun={config.orderNoun} showOrder={false} />
      ))}
      <FormError message={error} />
      {!closed && !hasSteps ? (
        <Button
          variant="tint"
          size="medium"
          label="Gerar etapas"
          loading={generate.isPending}
          onPress={async () => {
            setError(null);
            try {
              const n = await generate.mutateAsync(orderId);
              toast(n === 1 ? '1 etapa criada' : `${n} etapas criadas`);
            } catch (e) {
              setError(friendlyError(e));
            }
          }}
        />
      ) : null}
      {!closed ? <TextLink label="Nova tarefa" onPress={() => router.push({ pathname: '/tarefas/form', params: { pedido: orderId } })} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
});
