import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chips } from '@/components/Chips';
import { DetailBar } from '@/components/DetailBar';
import { FormError } from '@/components/FormError';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useAccounts, useCreateTransfer } from '@/features/finance/api';
import { parseDateInput, toISODate } from '@/features/finance/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { formatDateBR } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { formatCents, parseBRLToCents } from '@/lib/money';
import { colors, fonts } from '@/theme/tokens';

export default function TransferScreen() {
  const { orgId } = useOrg();
  const accounts = useAccounts(orgId);
  const create = useCreateTransfer(orgId);
  const toast = useToast();
  const active = (accounts.data ?? []).filter((a) => a.active);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(formatDateBR(new Date()));
  const [description, setDescription] = useState('');
  const [errs, setErrs] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(newId);
  const from = active.find((a) => a.id === fromId);

  const submit = async () => {
    const cents = parseBRLToCents(amount);
    const iso = parseDateInput(date);
    const next: Record<string, string | undefined> = {};
    if (!fromId || !toId) next.accounts = 'Escolha as duas contas.';
    else if (fromId === toId) next.accounts = 'Escolha contas diferentes.';
    if (!cents || cents <= 0) next.amount = 'Informe o valor.';
    if (!iso) next.date = 'Use o formato dd/mm/aaaa.';
    else if (iso > toISODate(new Date())) next.date = 'Data futura não vale para transferência.';
    setErrs(next);
    if (Object.values(next).some(Boolean) || !fromId || !toId || !cents || !iso) return;
    setError(null);
    try {
      await create.mutateAsync({ fromId, toId, amountCents: cents, date: iso, description: description.trim(), idempotencyKey: key });
      toast('Transferência registrada');
      router.back();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const options = active.map((a) => ({ value: a.id, label: a.name }));
  return (
    <Screen>
      <DetailBar title="Transferir" />
      <Card>
        <Text style={styles.label}>De</Text>
        <Chips accessibilityLabel="Conta de origem" value={fromId} onChange={setFromId} options={options} />
        {from ? <Text style={styles.muted}>Saldo: {formatCents(from.balance_cents)}</Text> : null}
        <Text style={styles.label}>Para</Text>
        <Chips accessibilityLabel="Conta de destino" value={toId} onChange={setToId} options={options.filter((o) => o.value !== fromId)} />
        {errs.accounts ? <Text style={styles.error}>{errs.accounts}</Text> : null}
        <TextField label="Valor" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" error={errs.amount} />
        <TextField label="Data" value={date} onChangeText={setDate} placeholder="dd/mm/aaaa" keyboardType="numbers-and-punctuation" error={errs.date} />
        <TextField label="Descrição (opcional)" value={description} onChangeText={setDescription} placeholder="Ex.: saque, depósito" />
      </Card>
      <Text style={styles.note}>Transferência só move dinheiro entre suas contas. Não entra como receita nem despesa.</Text>
      <FormError message={error} />
      <Button label="Transferir" onPress={submit} loading={create.isPending} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  error: { fontFamily: fonts.semibold, fontSize: 12, color: colors.primaryText },
  note: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500, textAlign: 'center' },
});
