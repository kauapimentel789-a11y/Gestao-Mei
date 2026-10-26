import { Scale } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { FormError } from '@/components/FormError';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useOrg } from '@/features/organizations/useOrg';
import { friendlyError } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { colors, fonts, radius, shadows } from '@/theme/tokens';

import { type OrderDetail, useSetOrderWeights } from './api';
import { formatQuantity, formatWeight, isWeightUnit, lineTotalCents, parseWeightKg } from './logic';

/**
 * Itens vendidos por quilo: o pedido entra com o peso pedido (ou aproximado,
 * no link) e aqui vai o peso conferido na balança. O preço por quilo é o que
 * ficou gravado no pedido. Só antes da baixa do estoque e com o pedido aberto.
 */
export function WeightCheck({ order }: { order: OrderDetail }) {
  const { orgId } = useOrg();
  const save = useSetOrderWeights(orgId);
  const toast = useToast();
  const items = order.items.filter((i) => isWeightUnit(i.unit));
  const [open, setOpen] = useState(false);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const editable = !order.stock_consumed_at && ['received', 'confirmed', 'in_progress'].includes(order.status);
  if (items.length === 0 || !editable) return null;

  const start = () => {
    setTexts(Object.fromEntries(items.map((i) => [i.id, formatQuantity(i.quantity)])));
    setError(null);
    setOpen(true);
  };

  const parsed = items.map((i) => ({ item: i, kg: parseWeightKg(texts[i.id] ?? '') }));
  const preview = parsed.reduce(
    (sum, p) => sum + (p.kg ? lineTotalCents({ quantity: p.kg, unitPriceCents: p.item.unit_price_cents, discountCents: p.item.discount_cents }) : p.item.line_total_cents),
    0,
  );
  const otherItems = order.items.filter((i) => !isWeightUnit(i.unit)).reduce((sum, i) => sum + i.line_total_cents, 0);
  const newTotal = preview + otherItems - order.discount_cents + order.delivery_fee_cents;

  const submit = async () => {
    if (parsed.some((p) => p.kg === null)) return setError('Confira os pesos. Ex.: 1,250 (kg) ou 850 g.');
    setError(null);
    try {
      await save.mutateAsync({ orderId: order.id, weights: parsed.map((p) => ({ item_id: p.item.id, quantity: p.kg! })) });
      setOpen(false);
      toast('Peso atualizado');
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Card>
      <Text style={styles.title}>Peso na balança</Text>
      <Text style={styles.body}>
        {items.length === 1 ? 'Este item é vendido por quilo.' : 'Estes itens são vendidos por quilo.'} Depois de pesar, ajuste aqui e o
        total {order.delivery_fee_cents ? '(com a entrega) ' : ''}é recalculado. Faça isso antes de baixar o estoque.
      </Text>
      <Button variant="tint" size="medium" label="Conferir peso" trailing={<Scale size={18} color={colors.primaryText} />} onPress={start} />

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Peso conferido</Text>
            {parsed.map(({ item, kg }) => (
              <TextField
                key={item.id}
                label={`${item.description} · ${formatCents(item.unit_price_cents)} o quilo`}
                value={texts[item.id] ?? ''}
                onChangeText={(t) => setTexts((s) => ({ ...s, [item.id]: t }))}
                keyboardType="decimal-pad"
                placeholder="0,000"
                hint={
                  kg
                    ? `${formatWeight(kg)} = ${formatCents(lineTotalCents({ quantity: kg, unitPriceCents: item.unit_price_cents, discountCents: item.discount_cents }))}`
                    : 'Em quilos (1,250) ou gramas (850 g)'
                }
              />
            ))}
            <View style={styles.totalRow}>
              <Text style={styles.body}>Novo total</Text>
              <Text style={styles.total}>{formatCents(Math.max(0, newTotal))}</Text>
            </View>
            <FormError message={error} />
            <Button variant="ink" size="medium" label="Voltar" onPress={() => setOpen(false)} />
            <Button size="medium" label="Salvar peso" loading={save.isPending} onPress={submit} />
          </View>
        </View>
      </Modal>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  total: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.ink },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,11,15,0.45)', justifyContent: 'center', padding: 20 },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 20, gap: 12, ...shadows.card },
  dialogTitle: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.ink },
});
