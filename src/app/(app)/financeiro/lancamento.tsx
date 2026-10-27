import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chips } from '@/components/Chips';
import { DetailBar } from '@/components/DetailBar';
import { PickerModal } from '@/components/PickerModal';
import { FormError } from '@/components/FormError';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TextField } from '@/components/TextField';
import { TextLink } from '@/components/TextLink';
import { useToast } from '@/components/Toast';
import type { Customer } from '@/features/customers/api';
import { CustomerPicker } from '@/features/customers/CustomerPicker';
import { useAccounts, useCategories, useCreateEntry } from '@/features/finance/api';
import { type Direction, METHOD_LABEL, parseDateInput, type PaymentMethod, toISODate } from '@/features/finance/logic';
import { useSpace } from '@/features/organizations/useOrg';
import { useSuppliers } from '@/features/suppliers/api';
import { formatDateBR } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { parseBRLToCents } from '@/lib/money';
import { colors, fonts } from '@/theme/tokens';

const METHODS: PaymentMethod[] = ['pix', 'cash', 'debit_card', 'credit_card', 'bank_transfer', 'boleto', 'other'];

export default function NewEntryScreen() {
  const { orgId, personal } = useSpace();
  // ?tipo=entrada abre já como receita (atalhos de Minhas finanças).
  const { tipo } = useLocalSearchParams<{ tipo?: string }>();
  const categories = useCategories(orgId);
  const accounts = useAccounts(orgId);
  const create = useCreateEntry(orgId);
  const toast = useToast();

  const [direction, setDirection] = useState<Direction>(tipo === 'entrada' ? 'receivable' : 'payable');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [due, setDue] = useState(formatDateBR(new Date()));
  const [competence, setCompetence] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const suppliers = useSuppliers(orgId);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const supplier = suppliers.data?.find((x) => x.id === supplierId) ?? null;
  const [notes, setNotes] = useState('');
  const [settled, setSettled] = useState(true);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('pix');
  const [errs, setErrs] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [key] = useState(newId);

  const receiving = direction === 'receivable';
  const options = (categories.data ?? []).filter((c) => c.active && c.direction === direction);
  const activeAccounts = (accounts.data ?? []).filter((a) => a.active);
  const chosenAccount = accountId ?? activeAccounts[0]?.id ?? null;
  const chosenCategory = options.some((c) => c.id === categoryId) ? categoryId : null;

  const onSubmit = async () => {
    const cents = parseBRLToCents(amount);
    const dueIso = parseDateInput(due);
    const compIso = competence.trim() && !personal ? parseDateInput(competence) : dueIso;
    const next: Record<string, string | undefined> = {};
    if (description.trim().length < 2) next.description = personal ? 'Diga com o que foi.' : 'Descreva o lançamento.';
    if (!cents || cents <= 0) next.amount = 'Informe o valor.';
    if (!chosenCategory) next.category = 'Escolha a categoria.';
    if (!dueIso) next.due = 'Use o formato dd/mm/aaaa.';
    else if (settled && dueIso > toISODate(new Date()))
      next.due = `Data futura não vale para ${receiving ? 'recebimento' : 'pagamento'}. Desligue a opção acima para agendar.`;
    if (!compIso) next.competence = 'Use o formato dd/mm/aaaa.';
    if (settled && !chosenAccount) next.account = 'Cadastre uma conta antes.';
    setErrs(next);
    if (Object.values(next).some(Boolean) || !cents || !dueIso || !compIso || !chosenCategory) return;

    setError(null);
    try {
      const entry = await create.mutateAsync({
        direction,
        description: description.trim(),
        amountCents: cents,
        categoryId: chosenCategory,
        dueDate: dueIso,
        competenceDate: compIso,
        customerId: receiving && !personal ? (customer?.id ?? null) : null,
        supplierId: receiving || personal ? null : supplierId,
        notes: notes.trim(),
        idempotencyKey: key,
        // Já pago: a baixa usa a data informada, que também vira o vencimento.
        paid: settled && chosenAccount ? { accountId: chosenAccount, method, paidOn: dueIso } : null,
      });
      toast(personal ? (receiving ? 'Entrada salva' : 'Gasto salvo') : receiving ? 'Receita lançada' : 'Despesa lançada');
      router.replace({ pathname: '/financeiro/[id]', params: { id: entry.id } });
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Screen>
      <DetailBar title={personal ? 'Novo lançamento pessoal' : 'Novo lançamento'} />

      <SegmentedControl
        accessibilityLabel="Tipo"
        value={direction}
        onChange={(d) => {
          setDirection(d);
          setCategoryId(null);
        }}
        segments={[
          { value: 'payable', label: personal ? 'Gastei' : 'Despesa' },
          { value: 'receivable', label: personal ? 'Recebi' : 'Receita' },
        ]}
      />

      <Card>
        <TextField
          label="Descrição"
          value={description}
          onChangeText={setDescription}
          placeholder={personal ? (receiving ? 'Ex.: salário' : 'Ex.: mercado do mês') : receiving ? 'Ex.: venda na feira' : 'Ex.: conta de luz'}
          error={errs.description}
        />
        <TextField label="Valor" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" error={errs.amount} />
        <Text style={styles.label}>Categoria</Text>
        <Chips accessibilityLabel="Categoria" value={chosenCategory} onChange={setCategoryId} options={options.map((c) => ({ value: c.id, label: c.name }))} />
        {errs.category ? <Text style={styles.error}>{errs.category}</Text> : null}
        <TextLink label="Gerenciar categorias" onPress={() => router.push('/financeiro/categorias')} />
      </Card>

      <Card>
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text style={styles.value}>{receiving ? 'Já recebido' : 'Já pago'}</Text>
            <Text style={styles.muted}>
              {settled ? 'O dinheiro entra no caixa na data abaixo.' : `Fica em ${receiving ? 'contas a receber' : 'contas a pagar'} até você registrar.`}
            </Text>
          </View>
          <Switch value={settled} onValueChange={setSettled} trackColor={{ true: colors.primary }} accessibilityLabel={receiving ? 'Já recebido' : 'Já pago'} />
        </View>
        <TextField
          label={settled ? (receiving ? 'Data do recebimento' : 'Data do pagamento') : 'Vencimento'}
          value={due}
          onChangeText={setDue}
          placeholder="dd/mm/aaaa"
          keyboardType="numbers-and-punctuation"
          error={errs.due}
        />
        {settled ? (
          <>
            <Text style={styles.label}>{receiving ? 'Entrou em' : 'Saiu de'}</Text>
            <Chips accessibilityLabel="Conta" value={chosenAccount} onChange={setAccountId} options={activeAccounts.map((a) => ({ value: a.id, label: a.name }))} />
            {errs.account ? <Text style={styles.error}>{errs.account}</Text> : null}
            <Text style={styles.label}>Forma</Text>
            <Chips accessibilityLabel="Forma de pagamento" value={method} onChange={setMethod} options={METHODS.map((m) => ({ value: m, label: METHOD_LABEL[m] }))} />
          </>
        ) : null}
        {personal ? null : (
          <TextField
            label="Competência (opcional)"
            value={competence}
            onChangeText={setCompetence}
            placeholder="Igual à data acima"
            keyboardType="numbers-and-punctuation"
            hint="Data a que o valor se refere no resultado (ex.: aluguel de outubro pago em novembro)."
            error={errs.competence}
          />
        )}
      </Card>

      <Card>
        {personal ? null : receiving ? (
          <Pressable accessibilityRole="button" onPress={() => setPickerOpen(true)} style={styles.switchRow}>
            <Text style={styles.label}>Cliente (opcional)</Text>
            <Text style={styles.value}>{customer?.name ?? 'Escolher'}</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setSupplierOpen(true)} style={styles.switchRow}>
            <Text style={styles.label}>Fornecedor (opcional)</Text>
            <Text style={styles.value}>{supplier?.name ?? 'Escolher'}</Text>
          </Pressable>
        )}
        <TextField label="Observações (opcional)" value={notes} onChangeText={setNotes} multiline />
      </Card>

      <FormError message={error} />
      <Button
        label={personal ? (receiving ? 'Salvar entrada' : 'Salvar gasto') : receiving ? 'Lançar receita' : 'Lançar despesa'}
        onPress={onSubmit}
        loading={create.isPending}
      />

      <PickerModal
        visible={supplierOpen}
        title="Fornecedor"
        searchPlaceholder="Buscar fornecedor"
        options={(suppliers.data ?? []).filter((x) => x.active).map((x) => ({ id: x.id, title: x.name }))}
        loading={suppliers.isPending}
        selectedId={supplierId}
        noneLabel="Sem fornecedor"
        emptyText="Nenhum fornecedor. Cadastre em Configurações → Fornecedores."
        onClose={() => setSupplierOpen(false)}
        onSelect={(id) => {
          setSupplierId(id);
          setSupplierOpen(false);
        }}
      />

      <CustomerPicker
        orgId={orgId}
        visible={pickerOpen}
        selectedId={customer?.id ?? null}
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
  flex: { flex: 1, gap: 2 },
  label: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  value: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  error: { fontFamily: fonts.semibold, fontSize: 12, color: colors.primaryText },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
});
