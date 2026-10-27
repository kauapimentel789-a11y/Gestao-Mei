// Registrar recebimento ou pagamento (total ou parcial) de um título.
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Chips } from '@/components/Chips';
import { FormError } from '@/components/FormError';
import { TextField } from '@/components/TextField';
import { formatDateBR } from '@/lib/dates';
import { formatCents, parseBRLToCents } from '@/lib/money';
import { colors, fonts, radius, shadows } from '@/theme/tokens';

import type { Account } from './api';
import { METHOD_LABEL, parseDateInput, type PaymentMethod } from './logic';

const METHODS: PaymentMethod[] = ['pix', 'cash', 'debit_card', 'credit_card', 'bank_transfer', 'boleto', 'other'];
const centsToText = (c: number) => (c / 100).toFixed(2).replace('.', ',');

export interface PaymentValues {
  amountCents: number;
  accountId: string;
  method: PaymentMethod;
  paidOn: string;
}

interface Props {
  visible: boolean;
  receiving: boolean;
  openCents: number;
  accounts: Account[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (values: PaymentValues) => void;
}

export function PaymentDialog({ visible, receiving, openCents, accounts, loading, error, onClose, onConfirm }: Props) {
  const active = accounts.filter((a) => a.active);
  const [amount, setAmount] = useState(centsToText(openCents));
  const [accountId, setAccountId] = useState<string | null>(active[0]?.id ?? null);
  const [method, setMethod] = useState<PaymentMethod>('pix');
  const [date, setDate] = useState(formatDateBR(new Date()));
  const [errs, setErrs] = useState<{ amount?: string; date?: string; account?: string }>({});

  const submit = () => {
    const cents = parseBRLToCents(amount);
    const paidOn = parseDateInput(date);
    const next: typeof errs = {};
    if (!cents || cents <= 0) next.amount = 'Informe o valor.';
    else if (cents > openCents) next.amount = `Máximo de ${formatCents(openCents)}.`;
    if (!paidOn) next.date = 'Use o formato dd/mm/aaaa.';
    if (!accountId) next.account = 'Escolha a conta.';
    setErrs(next);
    if (next.amount || next.date || next.account || !cents || !paidOn || !accountId) return;
    onConfirm({ amountCents: cents, accountId, method, paidOn });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.dialog}>
            <Text style={styles.title}>{receiving ? 'Registrar recebimento' : 'Registrar pagamento'}</Text>
            <Text style={styles.body}>
              Em aberto: {formatCents(openCents)}. Para {receiving ? 'receber' : 'pagar'} em partes, informe só o valor de agora.
            </Text>
            <TextField label="Valor" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" error={errs.amount} />
            <TextField label="Data" value={date} onChangeText={setDate} placeholder="dd/mm/aaaa" mask="date" error={errs.date} />
            <Text style={styles.label}>{receiving ? 'Entrou em' : 'Saiu de'}</Text>
            <Chips accessibilityLabel="Conta" value={accountId} onChange={setAccountId} options={active.map((a) => ({ value: a.id, label: a.name }))} />
            {errs.account ? <Text style={styles.error}>{errs.account}</Text> : null}
            <Text style={styles.label}>Forma</Text>
            <Chips accessibilityLabel="Forma de pagamento" value={method} onChange={setMethod} options={METHODS.map((m) => ({ value: m, label: METHOD_LABEL[m] }))} />
            <FormError message={error} />
            <Button variant="ink" size="medium" label="Voltar" onPress={onClose} />
            <Button size="medium" label={receiving ? 'Registrar recebimento' : 'Registrar pagamento'} loading={loading} onPress={submit} />
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
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
  label: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  error: { fontFamily: fonts.semibold, fontSize: 12, color: colors.primaryText },
});
