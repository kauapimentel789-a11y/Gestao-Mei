import { zodResolver } from '@hookform/resolvers/zod';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chips } from '@/components/Chips';
import { DetailBar } from '@/components/DetailBar';
import { FormError } from '@/components/FormError';
import { Skeleton } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { formatQuantity } from '@/features/orders/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { useProduct, useSaveProduct } from '@/features/products/api';
import { type ProductFormInput, productSchema } from '@/features/products/schemas';
import { ITEM_TYPE_LABEL, ITEM_TYPES_BY_BUSINESS, marginRatio, SELLABLE_TYPES, UNITS } from '@/features/products/types';
import { friendlyError } from '@/lib/errors';
import { formatCents, parseBRLToCents } from '@/lib/money';
import { colors, fonts } from '@/theme/tokens';

const centsToText = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));

export default function ItemFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { orgId, org } = useOrg();
  const existing = useProduct(orgId, id);
  const save = useSaveProduct(orgId);
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const types = ITEM_TYPES_BY_BUSINESS[org.business_type];

  const { control, handleSubmit, reset, setValue, formState } = useForm<ProductFormInput>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      itemType: types[0]!,
      name: '',
      description: '',
      sku: '',
      unit: 'un',
      trackStock: types[0] !== 'service',
      minStock: '',
      cost: '',
      price: '',
      active: true,
    },
  });
  const [itemType, cost, price] = useWatch({ control, name: ['itemType', 'cost', 'price'] });
  const isService = itemType === 'service';
  const sellable = SELLABLE_TYPES.includes(itemType);

  useEffect(() => {
    const p = existing.data;
    if (!p) return;
    reset({
      itemType: p.item_type,
      name: p.name,
      description: p.description ?? '',
      sku: p.sku ?? '',
      unit: p.unit,
      trackStock: p.track_stock,
      minStock: Number(p.min_stock) ? formatQuantity(p.min_stock) : '',
      cost: centsToText(p.cost_cents),
      price: centsToText(p.price_cents),
      active: p.active,
    });
  }, [existing.data, reset]);

  const margin = marginRatio({ cost_cents: parseBRLToCents(cost), price_cents: parseBRLToCents(price) });

  const onSubmit = handleSubmit(async (input) => {
    setError(null);
    try {
      await save.mutateAsync({ id, input });
      toast(id ? 'Item atualizado' : 'Item cadastrado');
      router.back();
    } catch (e) {
      setError(friendlyError(e));
    }
  });

  if (id && existing.isPending) {
    return (
      <Screen>
        <DetailBar title="Item" />
        <Skeleton rows={4} />
      </Screen>
    );
  }

  return (
    <Screen>
      <DetailBar title={id ? 'Editar item' : 'Novo item'} />

      <Card>
        <Text style={styles.label}>Tipo</Text>
        {id ? (
          <Text style={styles.value}>{ITEM_TYPE_LABEL[itemType]}</Text>
        ) : (
          <Chips
            accessibilityLabel="Tipo do item"
            value={itemType}
            onChange={(t) => {
              setValue('itemType', t);
              setValue('trackStock', t !== 'service');
              if (t === 'service') setValue('unit', 'un');
            }}
            options={types.map((t) => ({ value: t, label: ITEM_TYPE_LABEL[t] }))}
          />
        )}
        <Controller
          control={control}
          name="name"
          render={({ field, fieldState }) => (
            <TextField label="Nome" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} />
          )}
        />
        <Controller
          control={control}
          name="description"
          render={({ field, fieldState }) => (
            <TextField label="Descrição (opcional)" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />
          )}
        />
        <Controller
          control={control}
          name="sku"
          render={({ field, fieldState }) => (
            <TextField label="Código ou SKU (opcional)" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} autoCapitalize="characters" />
          )}
        />
        {!isService ? (
          <>
            <Text style={styles.label}>Unidade</Text>
            <Controller
              control={control}
              name="unit"
              render={({ field }) => (
                <Chips accessibilityLabel="Unidade" value={field.value} onChange={field.onChange} options={UNITS.map((u) => ({ value: u, label: u }))} />
              )}
            />
          </>
        ) : null}
      </Card>

      <Card>
        <Controller
          control={control}
          name="cost"
          render={({ field, fieldState }) => (
            <TextField
              label={isService ? 'Custo estimado (opcional)' : 'Custo unitário (opcional)'}
              value={field.value}
              onChangeText={field.onChange}
              error={fieldState.error?.message}
              keyboardType="decimal-pad"
              placeholder="0,00"
              hint={itemType === 'finished' ? 'O cálculo pela ficha técnica chega numa próxima etapa.' : undefined}
            />
          )}
        />
        <Controller
          control={control}
          name="price"
          render={({ field, fieldState }) => (
            <TextField
              label={sellable ? 'Preço de venda' : 'Preço de venda (opcional)'}
              value={field.value}
              onChangeText={field.onChange}
              error={fieldState.error?.message}
              keyboardType="decimal-pad"
              placeholder="0,00"
            />
          )}
        />
        {margin !== null ? (
          <Text style={[styles.margin, margin < 0.2 && styles.marginLow]}>
            Margem estimada: {Math.round(margin * 100)}% ({formatCents((parseBRLToCents(price) ?? 0) - (parseBRLToCents(cost) ?? 0))} por {isService ? 'serviço' : 'unidade'})
          </Text>
        ) : null}
      </Card>

      {!isService ? (
        <Card>
          <Controller
            control={control}
            name="trackStock"
            render={({ field }) => (
              <View style={styles.switchRow}>
                <Text style={styles.value}>Controlar estoque</Text>
                <Switch value={field.value} onValueChange={field.onChange} trackColor={{ true: colors.primary }} accessibilityLabel="Controlar estoque" />
              </View>
            )}
          />
          <Controller
            control={control}
            name="minStock"
            render={({ field, fieldState }) => (
              <TextField
                label="Estoque mínimo (opcional)"
                value={field.value}
                onChangeText={field.onChange}
                error={fieldState.error?.message}
                keyboardType="decimal-pad"
                hint="Abaixo disso o item aparece como 'repor'."
              />
            )}
          />
          {existing.data ? (
            <Text style={styles.muted}>
              Saldo atual: {formatQuantity(existing.data.stock_qty)} {existing.data.unit}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {id ? (
        <Card>
          <Controller
            control={control}
            name="active"
            render={({ field }) => (
              <View style={styles.switchRow}>
                <View style={styles.flex}>
                  <Text style={styles.value}>Ativo</Text>
                  <Text style={styles.muted}>Itens inativos não aparecem em novos pedidos, mas ficam no histórico.</Text>
                </View>
                <Switch value={field.value} onValueChange={field.onChange} trackColor={{ true: colors.primary }} accessibilityLabel="Item ativo" />
              </View>
            )}
          />
        </Card>
      ) : null}

      <FormError message={error} />
      <Button label="Salvar item" onPress={onSubmit} loading={formState.isSubmitting} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  label: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  value: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  margin: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  marginLow: { color: colors.primaryText },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
});
