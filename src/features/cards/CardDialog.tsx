// Novo cartão ou edição: nome, dia de fechamento, dia de vencimento e limite.
// Nunca pede número, código ou senha do cartão.
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { FormError } from '@/components/FormError';
import { TextField } from '@/components/TextField';
import { friendlyError } from '@/lib/errors';
import { parseBRLToCents } from '@/lib/money';
import { colors, fonts, radius, shadows } from '@/theme/tokens';

import type { CardInput, CreditCard } from './api';
import { parseCardDay } from './logic';

const centsToText = (c: number) => (c / 100).toFixed(2).replace('.', ',');

interface Props {
  visible: boolean;
  card?: CreditCard | null;
  loading: boolean;
  onClose: () => void;
  onSave: (input: CardInput) => Promise<void>;
}

export function CardDialog({ visible, card, loading, onClose, onSave }: Props) {
  const [name, setName] = useState(card?.name ?? '');
  const [closing, setClosing] = useState(card ? String(card.closing_day) : '');
  const [due, setDue] = useState(card ? String(card.due_day) : '');
  const [limit, setLimit] = useState(card?.limit_cents != null ? centsToText(card.limit_cents) : '');
  const [errs, setErrs] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const closingDay = parseCardDay(closing);
    const dueDay = parseCardDay(due);
    const limitCents = limit.trim() ? parseBRLToCents(limit) : null;
    const next: Record<string, string | undefined> = {};
    if (name.trim().length < 2) next.name = 'Informe um nome, ex.: Nubank.';
    if (!closingDay) next.closing = 'Dia de 1 a 31.';
    if (!dueDay) next.due = 'Dia de 1 a 31.';
    if (limit.trim() && limitCents === null) next.limit = 'Valor inválido.';
    setErrs(next);
    if (Object.values(next).some(Boolean) || !closingDay || !dueDay) return;
    setError(null);
    try {
      await onSave({ name, closingDay, dueDay, limitCents });
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.dialog}>
            <Text style={styles.title}>{card ? 'Editar cartão' : 'Novo cartão'}</Text>
            <TextField label="Nome do cartão" value={name} onChangeText={setName} placeholder="Ex.: Nubank, Itaú" error={errs.name} />
            <View style={styles.row}>
              <View style={styles.flex}>
                <TextField label="Fecha no dia" value={closing} onChangeText={setClosing} keyboardType="number-pad" placeholder="Ex.: 5" error={errs.closing} />
              </View>
              <View style={styles.flex}>
                <TextField label="Vence no dia" value={due} onChangeText={setDue} keyboardType="number-pad" placeholder="Ex.: 12" error={errs.due} />
              </View>
            </View>
            <TextField
              label="Limite (opcional)"
              value={limit}
              onChangeText={setLimit}
              keyboardType="decimal-pad"
              placeholder="0,00"
              error={errs.limit}
              hint="Os dias estão no aplicativo do banco. Compra no dia do fechamento ou depois cai na fatura seguinte."
            />
            <Text style={styles.safe}>O Gestão Fácil nunca pede o número, o código ou a senha do cartão.</Text>
            <FormError message={error} />
            <Button variant="ink" size="medium" label="Voltar" onPress={onClose} />
            <Button size="medium" label={card ? 'Salvar' : 'Criar cartão'} loading={loading} onPress={submit} />
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
  row: { flexDirection: 'row', gap: 12 },
  flex: { flex: 1 },
  safe: { fontFamily: fonts.semibold, fontSize: 12, color: colors.gray500 },
});
