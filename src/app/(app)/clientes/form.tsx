import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DetailBar } from '@/components/DetailBar';
import { FormError } from '@/components/FormError';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { type Customer, findCustomersByPhone, useCustomer, useSaveCustomer } from '@/features/customers/api';
import { type CustomerFormInput, customerSchema } from '@/features/customers/schemas';
import { useOrg } from '@/features/organizations/useOrg';
import { friendlyError } from '@/lib/errors';
import { colors, fonts } from '@/theme/tokens';

export default function CustomerFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { orgId, config } = useOrg();
  const noun = config.clientNoun;
  const Noun = noun[0]!.toUpperCase() + noun.slice(1);
  const existing = useCustomer(orgId, id ?? '');
  const save = useSaveCustomer(orgId);
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Customer | null>(null);

  const { control, handleSubmit, reset, formState } = useForm<CustomerFormInput>({
    resolver: zodResolver(customerSchema),
    defaultValues: { name: '', phone: '', notes: '' },
  });

  useEffect(() => {
    if (existing.data) reset({ name: existing.data.name, phone: existing.data.phone ?? '', notes: existing.data.notes ?? '' });
  }, [existing.data, reset]);

  const submit = (force: boolean) =>
    handleSubmit(async (input) => {
      setError(null);
      try {
        if (!force && input.phone) {
          const same = (await findCustomersByPhone(orgId, input.phone)).find((c) => c.id !== id);
          if (same) return setDuplicate(same);
        }
        const c = await save.mutateAsync({ id, input });
        toast(id ? `${Noun} atualizado` : `${Noun} cadastrado`);
        router.replace({ pathname: '/clientes/[id]', params: { id: c.id } });
      } catch (e) {
        setError(friendlyError(e));
      }
    })();

  return (
    <Screen>
      <DetailBar title={id ? `Editar ${noun}` : `Novo ${noun}`} />
      <Card>
        <Controller
          control={control}
          name="name"
          render={({ field, fieldState }) => (
            <TextField label="Nome" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} />
          )}
        />
        <Controller
          control={control}
          name="phone"
          render={({ field, fieldState }) => (
            <TextField
              label="WhatsApp ou telefone (opcional)"
              value={field.value}
              onChangeText={(t) => {
                setDuplicate(null);
                field.onChange(t);
              }}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              keyboardType="phone-pad"
              placeholder="(11) 98765-4321"
            />
          )}
        />
        <Controller
          control={control}
          name="notes"
          render={({ field, fieldState }) => (
            <TextField
              label="Observações (opcional)"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              multiline
              style={styles.multiline}
            />
          )}
        />
      </Card>
      {duplicate ? (
        <View style={styles.dup}>
          <Text style={styles.dupText}>Já existe {duplicate.name} com esse telefone.</Text>
          <Button size="medium" variant="tint" label={`Abrir ${duplicate.name}`} onPress={() => router.replace({ pathname: '/clientes/[id]', params: { id: duplicate.id } })} />
          <Button size="medium" variant="outline" label="Salvar mesmo assim" onPress={() => submit(true)} />
        </View>
      ) : null}
      <FormError message={error} />
      {!duplicate ? <Button label={`Salvar ${noun}`} onPress={() => submit(false)} loading={formState.isSubmitting} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  multiline: { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 },
  dup: { gap: 8, padding: 14, borderRadius: 14, backgroundColor: colors.primaryTint },
  dupText: { fontFamily: fonts.bold, fontSize: 13, color: colors.primaryText },
});
