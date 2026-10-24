import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DetailBar } from '@/components/DetailBar';
import { FormError } from '@/components/FormError';
import { Skeleton } from '@/components/ListStates';
import { PickerModal } from '@/components/PickerModal';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { TextLink } from '@/components/TextLink';
import { useToast } from '@/components/Toast';
import { formatQuantity, parseQuantity } from '@/features/orders/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { useRecipe, useRecipeProductIds, useRegisterProduction } from '@/features/production/api';
import { productionCost, productionFactor, scaledQuantity } from '@/features/production/logic';
import { useProducts } from '@/features/products/api';
import { friendlyError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { formatCents } from '@/lib/money';
import { colors, fonts, radius } from '@/theme/tokens';

export default function NewProductionScreen() {
  const params = useLocalSearchParams<{ produto?: string; qtd?: string; pedido?: string }>();
  const { orgId, org } = useOrg();
  const toast = useToast();
  const products = useProducts(orgId, { activeOnly: true });
  const withRecipe = useRecipeProductIds(orgId);
  const register = useRegisterProduction(orgId);

  const [key] = useState(newId);
  const [productId, setProductId] = useState<string | null>(params.produto ?? null);
  const [quantity, setQuantity] = useState(params.qtd ?? '');
  const [allowNegative, setAllowNegative] = useState(false);
  const [notes, setNotes] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recipe = useRecipe(orgId, productId ?? undefined);

  const byId = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data]);
  const product = productId ? byId.get(productId) : undefined;
  const qty = parseQuantity(quantity);
  const r = recipe.data;
  const yieldQty = r ? Number(r.yield_qty) : 0;
  const factor = qty !== null && r ? productionFactor(qty, yieldQty) : 0;

  const lines = (r?.items ?? []).map((i) => {
    const input = byId.get(i.input_product_id);
    const need = scaledQuantity(i.quantity, factor);
    const stock = input ? Number(input.stock_qty) : 0;
    return { id: i.id, input, need, short: Boolean(input?.track_stock) && need > stock };
  });
  const shortages = lines.filter((l) => l.short);
  const cost =
    qty !== null && r
      ? productionCost(
          lines.map((l) => ({ quantity: l.need, costCents: l.input?.cost_cents ?? null })),
          qty,
          r.labor_minutes,
          yieldQty,
          org.hourly_rate_cents,
        )
      : null;

  const candidates = (products.data ?? []).filter((p) => (p.item_type === 'finished' || p.item_type === 'component') && withRecipe.data?.has(p.id));

  const submit = async () => {
    setError(null);
    if (!product) return setError('Escolha o que foi produzido.');
    if (!r) return setError('Esse produto ainda não tem ficha técnica.');
    if (qty === null) return setError('Informe a quantidade produzida.');
    if (shortages.length > 0 && !allowNegative) return setError('Falta insumo no estoque. Confira o saldo ou autorize a produção mesmo assim.');
    try {
      const run = await register.mutateAsync({
        productId: product.id,
        quantity: qty,
        idempotencyKey: key,
        orderId: params.pedido ?? null,
        allowNegative,
        notes: notes.trim(),
      });
      toast(`Produção #${run.number} registrada`);
      router.replace({ pathname: '/producao/[id]', params: { id: run.id } });
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Screen>
      <DetailBar title="Registrar produção" />

      <Card>
        <Text style={styles.label}>Produto</Text>
        <Pressable accessibilityRole="button" onPress={() => setPickerOpen(true)} style={styles.select}>
          <Text style={[styles.selectText, !product && styles.placeholder]} numberOfLines={1}>
            {product?.name ?? 'Escolher produto'}
          </Text>
          <ChevronRight size={18} color={colors.gray500} />
        </Pressable>
        {product ? (
          <Text style={styles.muted}>
            {product.track_stock ? `Em estoque: ${formatQuantity(product.stock_qty)} ${product.unit}` : 'Não controla estoque: só registra o custo'}
          </Text>
        ) : null}
        <TextField label={`Quantidade produzida${product ? ` (${product.unit})` : ''}`} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" />
      </Card>

      {productId && recipe.isPending ? <Skeleton rows={2} /> : null}
      {productId && !recipe.isPending && !r ? (
        <Card>
          <Text style={styles.body}>Esse produto ainda não tem ficha técnica.</Text>
          <TextLink label="Cadastrar ficha técnica" onPress={() => router.push({ pathname: '/itens/receita', params: { id: productId } })} />
        </Card>
      ) : null}

      {r ? (
        <Card style={styles.itemsCard}>
          <Text style={styles.label}>
            Insumos usados{qty !== null ? ` (${formatQuantity(factor)} ${factor === 1 ? 'lote' : 'lotes'})` : ''}
          </Text>
          {lines.map((l) => (
            <View key={l.id} style={styles.line}>
              <View style={styles.flex}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {l.input?.name ?? 'Item inativo'}
                </Text>
                <Text style={[styles.muted, l.short && styles.short]}>
                  {l.input?.track_stock
                    ? `Em estoque: ${formatQuantity(l.input.stock_qty)} ${l.input.unit}${l.short ? ' · falta' : ''}`
                    : 'Não controla estoque'}
                </Text>
              </View>
              <Text style={styles.need}>
                {qty !== null ? `${formatQuantity(l.need)} ${l.input?.unit ?? ''}` : '—'}
              </Text>
            </View>
          ))}
          {shortages.length > 0 ? (
            <View style={styles.switchRow}>
              <View style={styles.flex}>
                <Text style={styles.value}>Produzir mesmo assim</Text>
                <Text style={styles.muted}>O saldo do insumo fica negativo até você registrar a entrada.</Text>
              </View>
              <Switch value={allowNegative} onValueChange={setAllowNegative} trackColor={{ true: colors.primary }} accessibilityLabel="Produzir mesmo assim" />
            </View>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <TextField label="Observações (opcional)" value={notes} onChangeText={setNotes} multiline />
      </Card>

      {cost ? (
        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Insumos</Text>
            <Text style={styles.summaryValue}>{formatCents(cost.materialsCents)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Mão de obra</Text>
            <Text style={styles.summaryValue}>{formatCents(cost.laborCents)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Custo por {product?.unit ?? 'un'}</Text>
            <Text style={styles.summaryValue}>{formatCents(cost.unitCents)}</Text>
          </View>
          <Text style={styles.summaryHint}>
            Ao salvar: os insumos saem do estoque, o produto entra e o custo dele vira o custo médio. Não gera despesa: o dinheiro saiu na compra dos
            insumos.
            {cost.missing > 0 ? ' Há insumos sem custo cadastrado, então o custo fica incompleto.' : ''}
          </Text>
        </View>
      ) : null}

      <FormError message={error} />
      <Button label="Registrar produção" onPress={submit} loading={register.isPending} disabled={!r} />

      <PickerModal
        visible={pickerOpen}
        title="Produto"
        searchPlaceholder="Buscar produto"
        options={candidates.map((p) => ({ id: p.id, title: p.name, subtitle: p.track_stock ? `${formatQuantity(p.stock_qty)} ${p.unit} em estoque` : p.unit }))}
        loading={products.isPending || withRecipe.isPending}
        selectedId={productId}
        emptyText="Nenhum produto com ficha técnica. Abra o produto em Itens e cadastre a ficha técnica."
        onClose={() => setPickerOpen(false)}
        onSelect={(id) => {
          setProductId(id);
          setAllowNegative(false);
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
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
  short: { color: colors.primaryText },
  select: {
    minHeight: 50,
    borderRadius: radius.input,
    borderWidth: 1.5,
    borderColor: colors.gray200,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectText: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  placeholder: { color: colors.gray500 },
  itemsCard: { gap: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.divider },
  itemName: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  need: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.ink },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  summary: { backgroundColor: colors.graphite, borderRadius: radius.card, padding: 18, gap: 6 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gray400 },
  summaryValue: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.white },
  summaryHint: { fontFamily: fonts.medium, fontSize: 11, color: colors.gray400, lineHeight: 16 },
});
