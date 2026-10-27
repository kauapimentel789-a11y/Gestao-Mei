// Metas: quanto juntar para cada objetivo e quanto já está guardado.
import { Target } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DetailBar } from '@/components/DetailBar';
import { QueryStates } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { toISODate } from '@/features/finance/logic';
import { useSpace } from '@/features/organizations/useOrg';
import { useCreateGoal, useGoals } from '@/features/planning/api';
import { GoalDialog } from '@/features/planning/GoalDialog';
import { GoalRow } from '@/features/planning/GoalRow';
import { formatCents } from '@/lib/money';
import { colors, fonts } from '@/theme/tokens';

export default function GoalsScreen() {
  const { orgId } = useSpace();
  const goals = useGoals(orgId);
  const create = useCreateGoal(orgId);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const today = toISODate(new Date());

  const list = goals.data ?? [];
  const active = list.filter((g) => !g.completed_at);
  const done = list.filter((g) => g.completed_at);
  const saved = active.reduce((s, g) => s + g.saved_cents, 0);

  return (
    <Screen>
      <DetailBar title="Metas" />

      <QueryStates
        query={goals}
        isEmpty={list.length === 0}
        empty={{
          icon: Target,
          title: 'Nenhuma meta ainda',
          description: 'Reserva de emergência, viagem, carro ou quitar uma dívida. Diga quanto e até quando, e acompanhe aqui.',
          action: { label: 'Criar minha primeira meta', onPress: () => setOpen(true) },
        }}
      />

      {active.length > 0 ? (
        <>
          <Card>
            <Text style={styles.muted}>Guardado nas metas</Text>
            <Text style={styles.amount}>{formatCents(saved)}</Text>
            <Text style={styles.muted}>Guardar para uma meta não é gasto: é separar parte do que você já tem.</Text>
          </Card>
          <Card style={styles.list}>
            {active.map((g, i) => (
              <View key={g.id} style={i > 0 && styles.divider}>
                <GoalRow goal={g} today={today} />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {done.length > 0 ? (
        <Card style={styles.list}>
          <Text style={styles.cardTitle}>Concluídas</Text>
          {done.map((g, i) => (
            <View key={g.id} style={i > 0 && styles.divider}>
              <GoalRow goal={g} today={today} />
            </View>
          ))}
        </Card>
      ) : null}

      {list.length > 0 ? <Button label="Nova meta" onPress={() => setOpen(true)} /> : null}

      <GoalDialog
        key={open ? 'open' : 'closed'}
        visible={open}
        loading={create.isPending}
        onClose={() => setOpen(false)}
        onSave={async (input) => {
          await create.mutateAsync(input);
          setOpen(false);
          toast('Meta criada');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  amount: { fontFamily: fonts.extrabold, fontSize: 28, letterSpacing: -0.5, color: colors.ink },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink, paddingVertical: 8 },
  list: { gap: 0, paddingVertical: 4 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
});
