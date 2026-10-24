// Materiais usados numa ordem de serviço (além dos itens cobrados).
import { Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { PickerModal } from '@/components/PickerModal';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { formatSigned } from '@/features/inventory/logic';
import { formatQuantity, parseQuantity } from '@/features/orders/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { useProducts } from '@/features/products/api';
import { ITEM_TYPE_LABEL, type Product } from '@/features/products/types';
import { friendlyError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { colors, fonts, radius, shadows } from '@/theme/tokens';

import { useRegisterServiceMaterial, useServiceMaterials } from './api';

export function ServiceMaterials({ orderId, closed }: { orderId: string; closed: boolean }) {
  const { orgId } = useOrg();
  const toast = useToast();
  const materials = useServiceMaterials(orgId, orderId);
  const products = useProducts(orgId, { types: ['component', 'consumable', 'raw_material', 'resale'], activeOnly: true });
  const register = useRegisterServiceMaterial(orgId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chosen, setChosen] = useState<{ product: Product; key: string } | null>(null);

  const byId = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data]);
  const all = materials.data ?? [];
  const usedIds = new Set(all.filter((m) => m.movement_type === 'service_consumption').map((m) => m.id));
  const reversed = new Set(all.filter((m) => m.reverses_movement_id && usedIds.has(m.reverses_movement_id)).map((m) => m.reverses_movement_id));
  const used = all.filter((m) => m.movement_type === 'service_consumption');
  if (closed && used.length === 0) return null;

  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>Materiais usados</Text>
      {used.length === 0 ? <Text style={styles.body}>Registre o material gasto no serviço que não foi cobrado como item. Ele sai do estoque, sem gerar despesa.</Text> : null}
      {used.map((m) => {
        const p = byId.get(m.product_id);
        const isReversed = reversed.has(m.id);
        return (
          <View key={m.id} style={styles.row}>
            <Text style={[styles.name, isReversed && styles.strike]} numberOfLines={1}>
              {p?.name ?? 'Item'}
              {isReversed ? ' · estornado' : ''}
            </Text>
            <Text style={[styles.qty, isReversed && styles.strike]}>
              {formatSigned(m.quantity)} {p?.unit ?? ''}
            </Text>
          </View>
        );
      })}
      {used.length > 0 ? <Text style={styles.muted}>Para corrigir, estorne a movimentação no histórico do item.</Text> : null}
      {!closed ? (
        <Pressable accessibilityRole="button" onPress={() => setPickerOpen(true)} style={styles.add}>
          <Plus size={18} color={colors.primaryText} />
          <Text style={styles.addText}>Registrar material</Text>
        </Pressable>
      ) : null}

      <PickerModal
        visible={pickerOpen}
        title="Material"
        searchPlaceholder="Buscar item"
        options={(products.data ?? [])
          .filter((p) => p.track_stock)
          .map((p) => ({ id: p.id, title: p.name, subtitle: `${ITEM_TYPE_LABEL[p.item_type]} · ${formatQuantity(p.stock_qty)} ${p.unit} em estoque` }))}
        loading={products.isPending}
        selectedId={null}
        emptyText="Nenhum item com controle de estoque."
        onClose={() => setPickerOpen(false)}
        onSelect={(id) => {
          const p = id ? byId.get(id) : undefined;
          setPickerOpen(false);
          if (p) setChosen({ product: p, key: newId() });
        }}
      />

      {chosen ? (
        <QuantityDialog
          product={chosen.product}
          loading={register.isPending}
          onClose={() => setChosen(null)}
          onSave={async (quantity, allowNegative) => {
            await register.mutateAsync({ orderId, productId: chosen.product.id, quantity, idempotencyKey: chosen.key, allowNegative });
            setChosen(null);
            toast('Material registrado');
          }}
        />
      ) : null}
    </Card>
  );
}

function QuantityDialog({
  product,
  loading,
  onClose,
  onSave,
}: {
  product: Product;
  loading: boolean;
  onClose: () => void;
  onSave: (quantity: number, allowNegative: boolean) => Promise<void>;
}) {
  const [text, setText] = useState('1');
  const [allowNegative, setAllowNegative] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const q = parseQuantity(text);
  const short = q !== null && q > Number(product.stock_qty);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.title}>{product.name}</Text>
          <Text style={styles.body}>
            Em estoque: {formatQuantity(product.stock_qty)} {product.unit}
          </Text>
          <TextField label={`Quantidade usada (${product.unit})`} value={text} onChangeText={setText} keyboardType="decimal-pad" error={error} />
          {short ? (
            <View style={styles.switchRow}>
              <Text style={[styles.body, styles.flex]}>Usar mesmo assim (o saldo fica negativo)</Text>
              <Switch value={allowNegative} onValueChange={setAllowNegative} trackColor={{ true: colors.primary }} accessibilityLabel="Usar mesmo assim" />
            </View>
          ) : null}
          <Button variant="ink" size="medium" label="Voltar" onPress={onClose} />
          <Button
            size="medium"
            label="Registrar"
            loading={loading}
            onPress={async () => {
              if (q === null) return setError('Quantidade inválida.');
              if (short && !allowNegative) return setError('Não há saldo suficiente.');
              setError(undefined);
              try {
                await onSave(q, allowNegative);
              } catch (e) {
                setError(friendlyError(e));
              }
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: 6 },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 36 },
  name: { flex: 1, fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  qty: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.primaryText },
  strike: { textDecorationLine: 'line-through', color: colors.gray400 },
  add: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  addText: { fontFamily: fonts.bold, fontSize: 14, color: colors.primaryText },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,11,15,0.45)', justifyContent: 'center', padding: 20 },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 20, gap: 12, ...shadows.card },
  title: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.ink },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
