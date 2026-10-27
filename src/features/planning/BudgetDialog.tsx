// Limite do mês para uma categoria de gasto e a partir de quanto avisar.
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Chips } from '@/components/Chips';
import { FormError } from '@/components/FormError';
import { TextField } from '@/components/TextField';
import { friendlyError } from '@/lib/errors';
import { formatCents, parseBRLToCents } from '@/lib/money';
import { colors, fonts, radius, shadows } from '@/theme/tokens';

import type { BudgetRow } from './api';

const centsToText = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const ALERTS = ['70', '80', '90', '100'];

interface Props {
  visible: boolean;
  row: BudgetRow | null;
  loading: boolean;
  onClose: () => void;
  onSave: (input: { amountCents: number; alertPct: number }) => Promise<void>;
  onRemove: () => Promise<void>;
}

export function BudgetDialog({ visible, row, loading, onClose, onSave, onRemove }: Props) {
  const suggestion = row?.avg_prev_cents ?? null;
  const [amount, setAmount] = useState(row?.amount_cents != null ? centsToText(row.amount_cents) : '');
  const [alert, setAlert] = useState(String(row?.alert_pct ?? 80));
  const [err, setErr] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const submit = () => {
    const cents = parseBRLToCents(amount);
    if (!cents || cents <= 0) {
      setErr('Informe o limite do mês.');
      return;
    }
    setErr(undefined);
    void run(() => onSave({ amountCents: cents, alertPct: Number(alert) }));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.dialog}>
            <Text style={styles.title}>Limite para {row?.category_name ?? 'a categoria'}</Text>
            <TextField
              label="Quanto quer gastar por mês"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0,00"
              error={err}
              hint={suggestion ? `Nos últimos 3 meses você gastou em média ${formatCents(suggestion)} por mês.` : undefined}
            />
            <Text style={styles.label}>Avisar quando chegar em</Text>
            <Chips accessibilityLabel="Avisar quando chegar em" value={alert} onChange={setAlert} options={ALERTS.map((a) => ({ value: a, label: `${a}%` }))} />
            <FormError message={error} />
            <Button variant="ink" size="medium" label="Voltar" onPress={onClose} />
            <Button size="medium" label="Salvar limite" loading={loading} onPress={submit} />
            {row?.budget_id ? <Button variant="outline" size="medium" label="Tirar o limite" onPress={() => void run(onRemove)} /> : null}
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
  label: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
});
