// Nova meta ou edição: nome, quanto juntar, prazo (opcional) e observações.
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { FormError } from '@/components/FormError';
import { TextField } from '@/components/TextField';
import { formatISODate, parseDateInput, toISODate } from '@/features/finance/logic';
import { friendlyError } from '@/lib/errors';
import { parseBRLToCents } from '@/lib/money';
import { colors, fonts, radius, shadows } from '@/theme/tokens';

import type { Goal, GoalInput } from './api';

const centsToText = (c: number) => (c / 100).toFixed(2).replace('.', ',');

interface Props {
  visible: boolean;
  goal?: Goal | null;
  loading: boolean;
  onClose: () => void;
  onSave: (input: GoalInput) => Promise<void>;
}

export function GoalDialog({ visible, goal, loading, onClose, onSave }: Props) {
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState(goal ? centsToText(goal.target_cents) : '');
  const [date, setDate] = useState(goal?.target_date ? formatISODate(goal.target_date) : '');
  const [notes, setNotes] = useState(goal?.notes ?? '');
  const [errs, setErrs] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const cents = parseBRLToCents(target);
    const iso = date.trim() ? parseDateInput(date) : null;
    const next: Record<string, string | undefined> = {};
    if (name.trim().length < 2) next.name = 'Dê um nome, ex.: Viagem.';
    if (!cents || cents <= 0) next.target = 'Informe quanto quer juntar.';
    if (date.trim() && !iso) next.date = 'Use o formato dd/mm/aaaa.';
    else if (iso && !goal && iso < toISODate(new Date())) next.date = 'O prazo precisa ser hoje ou depois.';
    setErrs(next);
    if (Object.values(next).some(Boolean) || !cents) return;
    setError(null);
    try {
      await onSave({ name, targetCents: cents, targetDate: iso, notes });
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.dialog}>
            <Text style={styles.title}>{goal ? 'Editar meta' : 'Nova meta'}</Text>
            <TextField label="Nome da meta" value={name} onChangeText={setName} placeholder="Ex.: reserva de emergência" error={errs.name} />
            <TextField label="Quanto quer juntar" value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="0,00" error={errs.target} />
            <TextField
              label="Até quando (opcional)"
              value={date}
              onChangeText={setDate}
              placeholder="dd/mm/aaaa"
              keyboardType="numbers-and-punctuation"
              error={errs.date}
              hint="Com prazo, o app mostra quanto guardar por mês."
            />
            <TextField label="Observações (opcional)" value={notes} onChangeText={setNotes} placeholder="Ex.: fica na poupança" />
            <FormError message={error} />
            <Button variant="ink" size="medium" label="Voltar" onPress={onClose} />
            <Button size="medium" label={goal ? 'Salvar' : 'Criar meta'} loading={loading} onPress={submit} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(11,11,15,0.45)' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 20, gap: 12, ...shadows.card },
  title: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.ink },
});
