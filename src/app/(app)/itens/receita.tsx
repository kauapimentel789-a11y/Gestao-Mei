import { router, useLocalSearchParams } from 'expo-router';
import { Plus, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DetailBar } from '@/components/DetailBar';
import { ErrorCard } from '@/components/ErrorCard';
import { FormError } from '@/components/FormError';
import { Skeleton } from '@/components/ListStates';
import { PickerModal } from '@/components/PickerModal';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { formatQuantity, parseQuantity } from '@/features/orders/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { type Recipe, useRecipe, useSaveRecipe } from '@/features/production/api';
import { formatMinutes, parseMinutes, recipeCost } from '@/features/production/logic';
import { useProduct, useProducts } from '@/features/products/api';
import { ITEM_TYPE_LABEL, type Product } from '@/features/products/types';
import { friendlyError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { formatCents } from '@/lib/money';
import { colors, fonts, radius } from '@/theme/tokens';

const MAX_INPUTS = 50;

interface Line {
  key: string;
  productId: string;
  quantity: string;
}

export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orgId } = useOrg();
  const product = useProduct(orgId, id);
  const recipe = useRecipe(orgId, id);

  if (product.isPending || recipe.isPending) {
    return (
      <Screen>
        <DetailBar title="Ficha técnica" />
        <Skeleton rows={4} />
      </Screen>
    );
  }
  if (product.error || recipe.error || !product.data) {
    return (
      <Screen>
        <DetailBar title="Ficha técnica" />
        <ErrorCard
          message={friendlyError(product.error ?? recipe.error)}
          onRetry={() => {
            product.refetch();
            recipe.refetch();
          }}
        />
      </Screen>
    );
  }
  return <RecipeForm product={product.data} recipe={recipe.data} />;
}

function RecipeForm({ product: p, recipe }: { product: Product; recipe: Recipe | null }) {
  const { orgId, org } = useOrg();
  const toast = useToast();
  const inputs = useProducts(orgId, { types: ['raw_material', 'consumable', 'component', 'resale', 'finished'], activeOnly: true });
  const save = useSaveRecipe(orgId);

  const [lines, setLines] = useState<Line[]>(
    () => recipe?.items.map((i) => ({ key: i.id, productId: i.input_product_id, quantity: formatQuantity(i.quantity) })) ?? [],
  );
  const [yieldText, setYieldText] = useState(recipe ? formatQuantity(recipe.yield_qty) : '1');
  const [minutesText, setMinutesText] = useState(recipe && recipe.labor_minutes > 0 ? String(recipe.labor_minutes) : '');
  const [notes, setNotes] = useState(recipe?.notes ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => new Map((inputs.data ?? []).map((x) => [x.id, x])), [inputs.data]);
  const yieldQty = parseQuantity(yieldText);
  const minutes = parseMinutes(minutesText);
  const parsed = lines.map((l) => ({ ...l, q: parseQuantity(l.quantity) }));
  const preview = recipeCost(
    parsed.filter((l) => l.q !== null).map((l) => ({ quantity: l.q!, costCents: byId.get(l.productId)?.cost_cents ?? null })),
    yieldQty ?? 0,
    minutes ?? 0,
    org.hourly_rate_cents,
  );

  const used = new Set(lines.map((l) => l.productId));

  const submit = async () => {
    setError(null);
    if (lines.length === 0) return setError('Adicione pelo menos um insumo.');
    if (parsed.some((l) => l.q === null)) return setError('Confira a quantidade de todos os insumos.');
    if (yieldQty === null) return setError('Informe quanto um lote rende.');
    if (minutes === null) return setError('Tempo de mão de obra inválido. Use minutos (ex.: 90) ou horas (ex.: 1h30).');
    try {
      await save.mutateAsync({
        productId: p.id,
        items: parsed.map((l) => ({ product_id: l.productId, quantity: l.q! })),
        yieldQty,
        laborMinutes: minutes,
        notes: notes.trim(),
      });
      toast('Ficha técnica salva');
      router.back();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Screen>
      <DetailBar title="Ficha técnica" />

      <Card>
        <Text style={styles.title}>{p.name}</Text>
        <Text style={styles.muted}>Informe o que vai em um lote e quanto ele rende. O custo e a baixa dos insumos saem daqui.</Text>
        <View style={styles.twoCols}>
          <View style={styles.flex}>
            <TextField label={`Um lote rende (${p.unit})`} value={yieldText} onChangeText={setYieldText} keyboardType="decimal-pad" />
          </View>
          <View style={styles.flex}>
            <TextField label="Mão de obra por lote" value={minutesText} onChangeText={setMinutesText} placeholder="Ex.: 90 ou 1h30" />
          </View>
        </View>
        <Text style={styles.muted}>
          {minutes !== null && minutes > 0 ? `${formatMinutes(minutes)} · ` : ''}
          {org.hourly_rate_cents > 0
            ? `valor da hora ${formatCents(org.hourly_rate_cents)}`
            : 'Valor da hora não definido em Configurações: a mão de obra entra como zero.'}
        </Text>
      </Card>

      <Card style={styles.itemsCard}>
        <Text style={styles.label}>Insumos por lote</Text>
        {lines.map((l) => {
          const input = byId.get(l.productId);
          return (
            <View key={l.key} style={styles.line}>
              <View style={styles.flex}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {input?.name ?? 'Item inativo'}
                </Text>
                <Text style={styles.muted}>{input?.cost_cents != null ? `${formatCents(input.cost_cents)} / ${input.unit}` : 'Sem custo cadastrado'}</Text>
              </View>
              <View style={styles.qty}>
                <TextField
                  label={input?.unit ?? 'Qtd.'}
                  value={l.quantity}
                  onChangeText={(t) => setLines((s) => s.map((x) => (x.key === l.key ? { ...x, quantity: t } : x)))}
                  keyboardType="decimal-pad"
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remover ${input?.name ?? 'insumo'}`}
                hitSlop={10}
                onPress={() => setLines((s) => s.filter((x) => x.key !== l.key))}
              >
                <Trash2 size={18} color={colors.gray500} />
              </Pressable>
            </View>
          );
        })}
        {lines.length < MAX_INPUTS ? (
          <Pressable accessibilityRole="button" onPress={() => setPickerOpen(true)} style={styles.addLine}>
            <Plus size={18} color={colors.primaryText} />
            <Text style={styles.addLineText}>Adicionar insumo</Text>
          </Pressable>
        ) : null}
      </Card>

      <Card>
        <TextField label="Modo de preparo ou observações (opcional)" value={notes} onChangeText={setNotes} multiline />
      </Card>

      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Insumos por lote</Text>
          <Text style={styles.summaryValue}>{formatCents(preview.materialsCents)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Mão de obra por lote</Text>
          <Text style={styles.summaryValue}>{formatCents(preview.laborCents)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Custo estimado por {p.unit}</Text>
          <Text style={styles.summaryValue}>{formatCents(preview.unitCents)}</Text>
        </View>
        {p.price_cents != null && preview.unitCents > 0 ? (
          <Text style={styles.summaryHint}>
            Preço de venda {formatCents(p.price_cents)} · margem {formatCents(p.price_cents - preview.unitCents)} por {p.unit}
          </Text>
        ) : null}
        {preview.missing > 0 ? (
          <Text style={styles.summaryHint}>
            {preview.missing === 1 ? '1 insumo está' : `${preview.missing} insumos estão`} sem custo cadastrado: o custo estimado fica incompleto.
          </Text>
        ) : null}
      </View>

      <FormError message={error} />
      <Button label="Salvar ficha técnica" onPress={submit} loading={save.isPending} />

      <PickerModal
        visible={pickerOpen}
        title="Insumo"
        searchPlaceholder="Buscar item"
        options={(inputs.data ?? [])
          .filter((x) => x.id !== p.id && !used.has(x.id))
          .map((x) => ({ id: x.id, title: x.name, subtitle: `${ITEM_TYPE_LABEL[x.item_type]} · ${x.unit}` }))}
        loading={inputs.isPending}
        selectedId={null}
        emptyText="Nenhum item encontrado. Cadastre matérias-primas em Itens."
        onClose={() => setPickerOpen(false)}
        onSelect={(inputId) => {
          if (inputId) setLines((s) => [...s, { key: newId(), productId: inputId, quantity: '1' }]);
          setPickerOpen(false);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  label: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  twoCols: { flexDirection: 'row', gap: 10 },
  itemsCard: { gap: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.divider },
  itemName: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  qty: { width: 96 },
  addLine: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  addLineText: { fontFamily: fonts.bold, fontSize: 14, color: colors.primaryText },
  summary: { backgroundColor: colors.graphite, borderRadius: radius.card, padding: 18, gap: 6 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gray400 },
  summaryValue: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.white },
  summaryHint: { fontFamily: fonts.medium, fontSize: 11, color: colors.gray400, lineHeight: 16 },
});
