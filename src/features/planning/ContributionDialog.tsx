// Guardar ou retirar dinheiro de uma meta. Não mexe no saldo das contas:
// só marca quanto do que você já tem está separado para o objetivo.
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { FormError } from '@/components/FormError';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TextField } from '@/components/TextField';
import { parseDateInput, toISODate } from '@/features/finance/logic';
import { formatDateBR } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { formatCents, parseBRLToCents } from '@/lib/money';
import { colors, fonts, radius, shadows } from '@/theme/tokens';

type Mode = 'in' | 'out';

interface Props {
  visible: boolean;
  savedCents: number;
  loading: boolean;
  onClose: () => void;
  onSave: (input: { amountCents: number; date: string; note: string }) => Promise<void>;
}

export function ContributionDialog({ visible, savedCents, loading, onClose, onSave }: Props) {
  const [mode, setMode] = useState<Mode>('in');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(formatDateBR(new Date()));
  const [note, setNote] = useState('');
  const [errs, setErrs] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const cents = parseBRLToCents(amount);
    const iso = parseDateInput(date);
    const next: Record<string, string | undefined> = {};
    if (!cents || cents <= 0) next.amount = 'Informe o valor.';
    else if (mode === 'out' && cents > savedCents) next.amount = `Você tem ${formatCents(savedCents)} guardados nessa meta.`;
    if (!iso) next.date = 'Use o formato dd/mm/aaaa.';
    else if (iso > toISODate(new Date())) next.date = 'A data não pode ser no futuro.';
    setErrs(next);
    if (Object.values(next).some(Boolean) || !cents || !iso) return;
    setError(null);
    try {
      await onSave({ amountCents: mode === 'in' ? cents : -cents, date: iso, note });
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.dialog}>
            <Text style={styles.title}>{mode === 'in' ? 'Guardar dinheiro' : 'Retirar dinheiro'}</Text>
            <SegmentedControl
              accessibilityLabel="Guardar ou retirar"
              value={mode}
              onChange={setMode}
              segments={[
                { value: 'in', label: 'Guardei' },
                { value: 'out', label: 'Retirei' },
              ]}
            />
            <TextField label="Valor" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" error={errs.amount} />
            <TextField label="Data" value={date} onChangeText={setDate} placeholder="dd/mm/aaaa" keyboardType="numbers-and-punctuation" error={errs.date} />
            <TextField label="Observação (opcional)" value={note} onChangeText={setNote} placeholder="Ex.: 13º salário" />
            <Text style={styles.muted}>Isto não tira dinheiro das suas contas: só marca quanto está separado para a meta.</Text>
            <FormError message={error} />
            <Button variant="ink" size="medium" label="Voltar" onPress={onClose} />
            <Button size="medium" label="Salvar" loading={loading} onPress={submit} />
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
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
});
