// Compra parcelada: no cartão (cada parcela cai na fatura certa) ou em carnê
// e boleto (uma parcela por mês a partir do 1º vencimento).
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chips } from '@/components/Chips';
import { DetailBar } from '@/components/DetailBar';
import { FormError } from '@/components/FormError';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { TextLink } from '@/components/TextLink';
import { useToast } from '@/components/Toast';
import { useCards, useCreateInstallmentPurchase } from '@/features/cards/api';
import { installmentPreview } from '@/features/cards/logic';
import { useCategories } from '@/features/finance/api';
import { parseDateInput, toISODate } from '@/features/finance/logic';
import { useSpace } from '@/features/organizations/useOrg';
import { formatDateBR } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { parseBRLToCents } from '@/lib/money';
import { colors, fonts } from '@/theme/tokens';

const BOLETO = 'boleto';
const QUICK = ['1', '2', '3', '4', '5', '6', '10', '12'];

export default function InstallmentPurchaseScreen() {
  const { orgId } = useSpace();
  const { cartao } = useLocalSearchParams<{ cartao?: string }>();
  const cards = useCards(orgId);
  const categories = useCategories(orgId);
  const create = useCreateInstallmentPurchase(orgId);
  const toast = useToast();

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [count, setCount] = useState('1');
  const [where, setWhere] = useState<string | null>(cartao ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [date, setDate] = useState(formatDateBR(new Date()));
  const [firstDue, setFirstDue] = useState(formatDateBR(new Date()));
  const [errs, setErrs] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(newId);

  const activeCards = (cards.data ?? []).filter((c) => c.active);
  const chosenWhere = where === BOLETO || activeCards.some((c) => c.id === where) ? where : (activeCards[0]?.id ?? BOLETO);
  const onCard = chosenWhere !== BOLETO;
  const options = (categories.data ?? []).filter((c) => c.active && c.direction === 'payable');
  const chosenCategory = options.some((c) => c.id === categoryId) ? categoryId : null;
  const cents = parseBRLToCents(amount);
  const n = Number(count);
  const preview = cents && Number.isInteger(n) ? installmentPreview(cents, n) : null;

  const submit = async () => {
    const purchaseIso = parseDateInput(date);
    const dueIso = onCard ? null : parseDateInput(firstDue);
    const next: Record<string, string | undefined> = {};
    if (description.trim().length < 2) next.description = 'Diga o que foi comprado.';
    if (!cents || cents <= 0) next.amount = 'Informe o valor total.';
    if (!Number.isInteger(n) || n < 1 || n > 48) next.count = 'De 1 a 48 parcelas.';
    else if (cents && cents < n) next.count = 'Valor pequeno demais para tantas parcelas.';
    if (!chosenCategory) next.category = 'Escolha a categoria.';
    if (!purchaseIso) next.date = 'Use o formato dd/mm/aaaa.';
    else if (purchaseIso > toISODate(new Date())) next.date = 'A data da compra não pode ser no futuro.';
    if (!onCard && !dueIso) next.firstDue = 'Use o formato dd/mm/aaaa.';
    setErrs(next);
    if (Object.values(next).some(Boolean) || !cents || !purchaseIso || !chosenCategory) return;

    setError(null);
    try {
      await create.mutateAsync({
        description: description.trim(),
        totalCents: cents,
        installments: n,
        categoryId: chosenCategory,
        purchaseDate: purchaseIso,
        cardId: onCard ? chosenWhere : null,
        firstDueDate: dueIso,
        notes: '',
        idempotencyKey: key,
      });
      toast(n === 1 ? 'Compra lançada' : `Compra lançada em ${n}x`);
      if (onCard) router.replace({ pathname: '/cartao/[id]', params: { id: chosenWhere! } });
      else router.replace('/a-pagar');
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Screen>
      <DetailBar title="Compra parcelada" />

      <Card>
        <TextField label="O que comprou" value={description} onChangeText={setDescription} placeholder="Ex.: geladeira" error={errs.description} />
        <TextField label="Valor total" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" error={errs.amount} />
        <Text style={styles.label}>Parcelas</Text>
        <Chips accessibilityLabel="Parcelas" value={QUICK.includes(count) ? count : null} onChange={setCount} options={QUICK.map((q) => ({ value: q, label: `${q}x` }))} />
        <TextField label="Outro número de parcelas" value={count} onChangeText={setCount} keyboardType="number-pad" error={errs.count} />
        {preview ? <Text style={styles.preview}>{preview}</Text> : null}
      </Card>

      <Card>
        <Text style={styles.label}>Como pagou</Text>
        <Chips
          accessibilityLabel="Como pagou"
          value={chosenWhere}
          onChange={setWhere}
          options={[...activeCards.map((c) => ({ value: c.id, label: c.name })), { value: BOLETO, label: 'Carnê ou boleto' }]}
        />
        {activeCards.length === 0 ? <TextLink label="Cadastrar um cartão" onPress={() => router.push('/cartoes')} /> : null}
        <TextField label="Data da compra" value={date} onChangeText={setDate} placeholder="dd/mm/aaaa" mask="date" error={errs.date} />
        {onCard ? (
          <Text style={styles.muted}>Cada parcela entra na fatura do mês em que vai ser cobrada. O dinheiro só sai da conta quando você paga a fatura.</Text>
        ) : (
          <TextField
            label="Vencimento da 1ª parcela"
            value={firstDue}
            onChangeText={setFirstDue}
            placeholder="dd/mm/aaaa"
            mask="date"
            error={errs.firstDue}
            hint="As outras vencem no mesmo dia dos meses seguintes e aparecem em Contas a pagar."
          />
        )}
      </Card>

      <Card>
        <Text style={styles.label}>Categoria</Text>
        <Chips accessibilityLabel="Categoria" value={chosenCategory} onChange={setCategoryId} options={options.map((c) => ({ value: c.id, label: c.name }))} />
        {errs.category ? <Text style={styles.error}>{errs.category}</Text> : null}
      </Card>

      <FormError message={error} />
      <Button label="Lançar compra" onPress={submit} loading={create.isPending} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500, lineHeight: 17 },
  preview: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.primaryText },
  error: { fontFamily: fonts.semibold, fontSize: 12, color: colors.primaryText },
});
