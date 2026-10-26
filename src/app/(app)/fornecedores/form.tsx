import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DetailBar } from '@/components/DetailBar';
import { FormError } from '@/components/FormError';
import { Skeleton } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useOrg } from '@/features/organizations/useOrg';
import { type Supplier, type SupplierInput, useSaveSupplier, useSuppliers } from '@/features/suppliers/api';
import { normalizeDocument } from '@/features/suppliers/logic';
import { friendlyError } from '@/lib/errors';
import { colors, fonts } from '@/theme/tokens';
import { goBack } from '@/lib/navigation';

export default function SupplierFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { orgId } = useOrg();
  const list = useSuppliers(orgId);
  const existing = id ? list.data?.find((s) => s.id === id) : undefined;

  if (id && list.isPending) {
    return (
      <Screen>
        <DetailBar title="Fornecedor" />
        <Skeleton rows={3} />
      </Screen>
    );
  }
  // A chave remonta o formulário quando o fornecedor carrega.
  return <SupplierForm key={existing?.id ?? 'novo'} id={id} existing={existing} />;
}

function SupplierForm({ id, existing }: { id?: string; existing?: Supplier }) {
  const { orgId } = useOrg();
  const save = useSaveSupplier(orgId);
  const toast = useToast();
  const [form, setForm] = useState<SupplierInput>({
    name: existing?.name ?? '',
    document: existing?.document ?? '',
    phone: existing?.phone ?? '',
    email: existing?.email ?? '',
    notes: existing?.notes ?? '',
    contact_name: existing?.contact_name ?? '',
    address: existing?.address ?? '',
    supplies: existing?.supplies ?? '',
    active: existing?.active ?? true,
  });
  const [errs, setErrs] = useState<Partial<Record<keyof SupplierInput, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof SupplierInput) => (v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const next: typeof errs = {};
    if (!form.name.trim()) next.name = 'Informe o nome.';
    if (normalizeDocument(form.document) === 'invalid') next.document = 'CPF tem 11 dígitos e CNPJ, 14.';
    if (form.email.trim() && !/^[^@\s]+@[^@\s]+$/.test(form.email.trim())) next.email = 'E-mail inválido.';
    if (form.address.trim() && form.address.trim().length < 3) next.address = 'Endereço muito curto.';
    setErrs(next);
    if (Object.values(next).some(Boolean)) return;
    setError(null);
    try {
      const saved = await save.mutateAsync({ id, input: form });
      toast(id ? 'Fornecedor atualizado' : 'Fornecedor cadastrado');
      if (id) goBack();
      else router.replace({ pathname: '/fornecedores/[id]', params: { id: saved.id } });
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Screen>
      <DetailBar title={id ? 'Editar fornecedor' : 'Novo fornecedor'} />
      <Card>
        <TextField label="Nome" value={form.name} onChangeText={set('name')} error={errs.name} />
        <TextField
          label="O que vende (opcional)"
          value={form.supplies}
          onChangeText={set('supplies')}
          placeholder="Ex.: farinha, açúcar, embalagens"
          maxLength={300}
        />
        <TextField label="Com quem falar (opcional)" value={form.contact_name} onChangeText={set('contact_name')} placeholder="Nome do vendedor ou atendente" maxLength={120} />
        <TextField label="WhatsApp ou telefone (opcional)" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="(11) 98765-4321" />
        <TextField label="E-mail (opcional)" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" error={errs.email} />
        <TextField
          label="Endereço (opcional)"
          value={form.address}
          onChangeText={set('address')}
          placeholder="Rua, número, bairro, cidade"
          maxLength={200}
          error={errs.address}
        />
        <TextField label="CPF ou CNPJ (opcional)" value={form.document} onChangeText={set('document')} keyboardType="number-pad" error={errs.document} />
        <TextField label="Observações (opcional)" value={form.notes} onChangeText={set('notes')} multiline />
      </Card>
      {id ? (
        <Card>
          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <Text style={styles.value}>Ativo</Text>
              <Text style={styles.muted}>Inativos não aparecem em novas compras, mas ficam no histórico.</Text>
            </View>
            <Switch value={form.active} onValueChange={set('active')} trackColor={{ true: colors.primary }} accessibilityLabel="Fornecedor ativo" />
          </View>
        </Card>
      ) : null}
      <FormError message={error} />
      <Button label="Salvar fornecedor" onPress={submit} loading={save.isPending} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  value: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
});
