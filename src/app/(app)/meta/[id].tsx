// Meta: quanto falta, guardar ou retirar, histórico com estorno, concluir,
// editar e arquivar. Nada é apagado.
import { router, useLocalSearchParams } from 'expo-router';
import { Pencil } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
import { useSpace } from '@/features/organizations/useOrg';
import { type GoalContribution, useAddContribution, useGoalContributions, useGoals, useReverseContribution, useUpdateGoal } from '@/features/planning/api';
import { ContributionDialog } from '@/features/planning/ContributionDialog';
import { GoalDialog } from '@/features/planning/GoalDialog';
import { goalLine } from '@/features/planning/GoalRow';
import { goalStatus } from '@/features/planning/logic';
import { ProgressBar } from '@/features/planning/ProgressBar';
import { friendlyError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { formatCents } from '@/lib/money';
import { colors, fonts } from '@/theme/tokens';

export default function GoalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orgId } = useSpace();
  const goals = useGoals(orgId);
  const history = useGoalContributions(orgId, id);
  const update = useUpdateGoal(orgId);
  const add = useAddContribution(orgId);
  const reverse = useReverseContribution(orgId);
  const toast = useToast();
  const [addKey, setAddKey] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [reversing, setReversing] = useState<GoalContribution | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = toISODate(new Date());

  const goal = goals.data?.find((g) => g.id === id);

  if (goals.isPending) {
    return (
      <Screen>
        <DetailBar title="Meta" />
        <Skeleton rows={4} />
      </Screen>
    );
  }
  if (goals.error || !goal) {
    return (
      <Screen>
        <DetailBar title="Meta" />
        <ErrorCard message={goals.error ? friendlyError(goals.error) : 'Meta não encontrada.'} onRetry={() => goals.refetch()} />
      </Screen>
    );
  }

  const s = goalStatus(goal.target_cents, goal.saved_cents, goal.target_date, today);
  const list = history.data ?? [];
  const reversed = new Set(list.map((c) => c.reverses_contribution_id).filter((x): x is number => x != null));

  const setDone = async (completed: boolean) => {
    setError(null);
    try {
      await update.mutateAsync({ id: goal.id, completed });
      toast(completed ? 'Meta concluída. Parabéns!' : 'Meta reaberta');
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Screen>
      <DetailBar title={goal.name} right={<CircleButton label="Editar meta" icon={<Pencil size={18} color={colors.ink} />} onPress={() => setEditOpen(true)} />} />

      <Card>
        <Text style={styles.amount}>
          {formatCents(goal.saved_cents)} <Text style={styles.of}>de {formatCents(goal.target_cents)}</Text>
        </Text>
        <ProgressBar ratio={s.pct / 100} label={`${goal.name}: ${s.pct}%`} />
        <Text style={styles.body}>{goalLine(goal, today)}</Text>
        {goal.target_date ? <Text style={styles.muted}>Prazo: {formatISODate(goal.target_date)}</Text> : null}
        {goal.notes ? <Text style={styles.muted}>{goal.notes}</Text> : null}
      </Card>

      {!goal.completed_at ? (
        <Button
          label="Guardar ou retirar"
          onPress={() => {
            setError(null);
            setAddKey(newId());
          }}
        />
      ) : null}
      {s.reached && !goal.completed_at ? <Button variant="ink" label="Marcar como concluída" onPress={() => void setDone(true)} /> : null}
      {goal.completed_at ? <TextLink label="Reabrir meta" onPress={() => void setDone(false)} /> : null}
      <FormError message={error} />

      <Card style={styles.list}>
        <Text style={styles.cardTitle}>Histórico</Text>
        {history.isPending ? <Skeleton rows={2} /> : null}
        {!history.isPending && list.length === 0 ? <Text style={styles.body}>Nada guardado ainda.</Text> : null}
        {list.map((c, i) => (
          <View key={c.id} style={[styles.row, i > 0 && styles.divider]}>
            <View style={styles.flex}>
              <Text style={styles.rowTitle}>
                {c.reverses_contribution_id ? 'Estorno' : c.amount_cents > 0 ? 'Guardei' : 'Retirei'}
                {reversed.has(c.id) ? <Text style={styles.tag}>  estornado</Text> : null}
              </Text>
              <Text style={styles.muted}>
                {formatISODate(c.contributed_on)}
                {c.note ? ` · ${c.note}` : ''}
              </Text>
            </View>
            <View style={styles.right}>
              <Text style={[styles.rowAmount, c.amount_cents < 0 && styles.negative]}>{formatCents(c.amount_cents)}</Text>
              {!c.reverses_contribution_id && !reversed.has(c.id) ? (
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => {
                    setError(null);
                    setReversing(c);
                  }}
                >
                  <Text style={styles.reverse}>Estornar</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </Card>

      <TextLink label="Arquivar meta" onPress={() => setArchiveOpen(true)} />

      <ContributionDialog
        key={addKey ?? 'closed'}
        visible={addKey !== null}
        savedCents={goal.saved_cents}
        loading={add.isPending}
        onClose={() => setAddKey(null)}
        onSave={async (v) => {
          if (!addKey) return;
          await add.mutateAsync({ goalId: goal.id, ...v, idempotencyKey: addKey });
          setAddKey(null);
          toast(v.amountCents > 0 ? 'Valor guardado' : 'Retirada registrada');
        }}
      />

      <GoalDialog
        key={editOpen ? 'edit-open' : 'edit-closed'}
        visible={editOpen}
        goal={goal}
        loading={update.isPending}
        onClose={() => setEditOpen(false)}
        onSave={async (input) => {
          await update.mutateAsync({ id: goal.id, ...input });
          setEditOpen(false);
          toast('Meta atualizada');
        }}
      />

      <ReasonDialog
        key={reversing?.id}
        visible={reversing !== null}
        title="Estornar?"
        description={reversing ? `Será lançado um estorno de ${formatCents(reversing.amount_cents)}. O registro original continua no histórico.` : ''}
        keepLabel="Voltar"
        confirmLabel="Estornar"
        placeholder="Ex.: valor errado"
        loading={reverse.isPending}
        error={error}
        onClose={() => setReversing(null)}
        onConfirm={async (reason) => {
          if (!reversing) return;
          try {
            await reverse.mutateAsync({ id: reversing.id, reason });
            setReversing(null);
            toast('Estorno registrado');
          } catch (e) {
            setError(friendlyError(e));
          }
        }}
      />

      <ReasonDialog
        visible={archiveOpen}
        title="Arquivar meta?"
        description="Ela sai da lista de metas. O histórico continua guardado."
        keepLabel="Manter"
        confirmLabel="Arquivar"
        placeholder="Ex.: desisti da viagem"
        loading={update.isPending}
        error={error}
        onClose={() => setArchiveOpen(false)}
        onConfirm={async () => {
          try {
            await update.mutateAsync({ id: goal.id, archived: true });
            setArchiveOpen(false);
            toast('Meta arquivada');
            router.replace('/metas');
          } catch (e) {
            setError(friendlyError(e));
          }
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  amount: { fontFamily: fonts.extrabold, fontSize: 28, letterSpacing: -0.5, color: colors.ink },
  of: { fontFamily: fonts.semibold, fontSize: 14, color: colors.gray500 },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink, marginBottom: 6 },
  list: { gap: 0 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  rowTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  tag: { fontFamily: fonts.bold, fontSize: 11, color: colors.gray400 },
  right: { alignItems: 'flex-end', gap: 6 },
  rowAmount: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.ink },
  negative: { color: colors.primaryText },
  reverse: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500, textDecorationLine: 'underline' },
});
