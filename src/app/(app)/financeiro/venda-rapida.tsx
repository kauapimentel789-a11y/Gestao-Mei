import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chips } from '@/components/Chips';
import { DetailBar } from '@/components/DetailBar';
import { FormError } from '@/components/FormError';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import type { Customer } from '@/features/customers/api';
import { CustomerPicker } from '@/features/customers/CustomerPicker';
import { useAccounts, useCategories, useCreateEntry } from '@/features/finance/api';
import { METHOD_LABEL, parseDateInput, type PaymentMethod, toISODate } from '@/features/finance/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { formatDateBR } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { parseBRLToCents } from '@/lib/money';
import { colors, fonts, radius } from '@/theme/tokens';
import { goBack } from '@/lib/navigation';

const METHODS: PaymentMethod[] = ['pix', 'cash', 'debit_card', 'credit_card'];

/**
 * Venda rápida: só o valor e como pagou. Vira um lançamento em "Vendas" (ou
 * "Serviços prestados"), que conta no faturamento do MEI. Não mexe no estoque.
 */
export default function QuickSaleScreen() {
  const { orgId, org, config } = useOrg();
  const accounts = useAccounts(orgId);
  const categories = useCategories(orgId);
  const create = useCreateEntry(orgId);
  const toast = useToast();

  const [amount, setAmount] = useState('');
  const [what, setWhat] = useState('');
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [method, setMethod] = useState<PaymentMethod>('pix');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [due, setDue] = useState(() => formatDateBR(new Date(Date.now() + 7 * 86_400_000)));
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [errs, setErrs] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(newId);

  const active = (accounts.data ?? []).filter((a) => a.active);
  // Dinheiro vai para o caixa; Pix e cartão para a primeira conta que não é caixa.
  const autoAccount =
    (method === 'cash' ? active.find((a) => a.kind === 'cash') : active.find((a) => a.kind !== 'cash'))?.id ?? active[0]?.id ?? null;
  const chosenAccount = active.some((a) => a.id === accountId) ? accountId : autoAccount;
  const category = (categories.data ?? []).find((c) => c.active && c.direction === 'receivable' && c.nature === 'operating_revenue');
  const usesStock = org.business_type !== 'services';
  const defaultWhat = org.business_type === 'services' ? 'Serviço' : 'Venda';

  const onSave = async () => {
    const cents = parseBRLToCents(amount);
    const dueIso = when === 'later' ? parseDateInput(due) : toISODate(new Date());
    const next: Record<string, string | undefined> = {};
    if (!cents || cents <= 0) next.amount = 'Digite o valor.';
    if (when === 'later' && !customer) next.customer = `Escolha quem vai pagar, para cobrar depois.`;
    if (when === 'later' && !dueIso) next.due = 'Use o formato dd/mm/aaaa.';
    if (when === 'now' && !chosenAccount) next.account = 'Cadastre uma conta em Financeiro antes.';
    setErrs(next);
    if (Object.values(next).some(Boolean) || !cents || !dueIso) return;
    if (!category) return setError('Falta a categoria de vendas. Crie uma em Financeiro → Categorias.');
    setError(null);
    const today = toISODate(new Date());
    try {
      await create.mutateAsync({
        direction: 'receivable',
        description: what.trim() || defaultWhat,
        amountCents: cents,
        categoryId: category.id,
        dueDate: dueIso,
        competenceDate: today,
        customerId: customer?.id ?? null,
        supplierId: null,
        notes: '',
        idempotencyKey: key,
        paid: when === 'now' && chosenAccount ? { accountId: chosenAccount, method, paidOn: today } : null,
      });
      toast(when === 'now' ? 'Venda registrada' : 'Anotado em Quem me deve');
      goBack();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Screen>
      <DetailBar title="Venda rápida" />

      <Card>
        <Text style={styles.label}>Quanto foi?</Text>
        <View style={[styles.amountBox, errs.amount ? styles.amountError : null]}>
          <Text style={styles.currency}>R$</Text>
          <TextInput
            accessibilityLabel="Valor"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0,00"
            placeholderTextColor={colors.gray300}
            style={styles.amount}
            autoFocus
          />
        </View>
        {errs.amount ? <Text style={styles.error}>{errs.amount}</Text> : null}
        <TextField label="O que foi (opcional)" value={what} onChangeText={setWhat} placeholder={org.business_type === 'services' ? 'Ex.: conserto de celular' : 'Ex.: 2 bolos de pote'} />
      </Card>

      <SegmentedControl
        accessibilityLabel="Pagamento"
        value={when}
        onChange={setWhen}
        segments={[
          { value: 'now', label: 'Já recebi' },
          { value: 'later', label: 'Vai pagar depois' },
        ]}
      />

      <Card>
        {when === 'now' ? (
          <>
            <Text style={styles.label}>Como pagou</Text>
            <Chips accessibilityLabel="Forma de pagamento" value={method} onChange={setMethod} options={METHODS.map((m) => ({ value: m, label: METHOD_LABEL[m] }))} />
            {active.length > 1 ? (
              <>
                <Text style={styles.label}>Entrou em</Text>
                <Chips accessibilityLabel="Conta" value={chosenAccount} onChange={setAccountId} options={active.map((a) => ({ value: a.id, label: a.name }))} />
              </>
            ) : null}
            {errs.account ? <Text style={styles.error}>{errs.account}</Text> : null}
          </>
        ) : (
          <>
            <TextField
              label="Vai pagar até"
              value={due}
              onChangeText={setDue}
              placeholder="dd/mm/aaaa"
              keyboardType="numbers-and-punctuation"
              error={errs.due}
            />
            <Text style={styles.muted}>Fica em Quem me deve, com o botão para cobrar pelo WhatsApp.</Text>
          </>
        )}
        <Pressable accessibilityRole="button" onPress={() => setPickerOpen(true)} style={styles.row}>
          <Text style={styles.label}>{when === 'later' ? `Quem vai pagar` : `${config.clientNoun[0]!.toUpperCase()}${config.clientNoun.slice(1)} (opcional)`}</Text>
          <Text style={styles.value}>{customer?.name ?? 'Escolher'}</Text>
        </Pressable>
        {errs.customer ? <Text style={styles.error}>{errs.customer}</Text> : null}
      </Card>

      <FormError message={error} />
      <Button label={when === 'now' ? 'Registrar venda' : 'Anotar para receber'} onPress={onSave} loading={create.isPending} />
      {usesStock ? (
        <Text style={styles.muted}>
          A venda rápida não mexe no estoque. Para dar baixa nos itens, use {config.orderNoun === 'venda' ? 'Nova venda' : `Novo ${config.orderNoun}`}.
        </Text>
      ) : null}

      <CustomerPicker
        orgId={orgId}
        visible={pickerOpen}
        selectedId={customer?.id ?? null}
        noun={config.clientNoun}
        allowNone={when === 'now'}
        onClose={() => setPickerOpen(false)}
        onSelect={(c) => {
          setCustomer(c);
          setPickerOpen(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  value: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500, lineHeight: 17 },
  error: { fontFamily: fonts.bold, fontSize: 13, color: colors.primaryText },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48 },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.input,
    borderWidth: 1.5,
    borderColor: colors.gray200,
    paddingHorizontal: 16,
    minHeight: 72,
  },
  amountError: { borderColor: colors.primaryText },
  currency: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.gray500 },
  amount: { flex: 1, fontFamily: fonts.extrabold, fontSize: 34, color: colors.ink, paddingVertical: 8 },
});
