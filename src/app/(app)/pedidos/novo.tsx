import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight, Package, Plus, Trash2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chips } from '@/components/Chips';
import { DetailBar } from '@/components/DetailBar';
import { FormError } from '@/components/FormError';
import { QueryStates } from '@/components/ListStates';
import { QuantityStepper } from '@/components/QuantityStepper';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { type Customer, useCustomer } from '@/features/customers/api';
import { CustomerPicker } from '@/features/customers/CustomerPicker';
import { CHANNEL_LABEL, type OrderChannel, type OrderItemInput, useCreateOrder } from '@/features/orders/api';
import { draftTotals, parseQuantity } from '@/features/orders/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { useProducts } from '@/features/products/api';
import { SELLABLE_TYPES } from '@/features/products/types';
import { parseDateTimeBR } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { formatCents, parseBRLToCents } from '@/lib/money';
import { colors, fonts, radius } from '@/theme/tokens';

interface CustomLine {
  key: string;
  description: string;
  quantity: string;
  price: string;
}

const CHANNELS = (Object.keys(CHANNEL_LABEL) as OrderChannel[]).filter((c) => c !== 'link');

export default function NewOrderScreen() {
  const { clienteId } = useLocalSearchParams<{ clienteId?: string }>();
  const { orgId, config } = useOrg();
  const toast = useToast();
  const preselected = useCustomer(orgId, clienteId ?? '');
  const products = useProducts(orgId, { types: SELLABLE_TYPES, activeOnly: true });
  const create = useCreateOrder(orgId);
  const isService = config.orderKind === 'service_order';

  // Uma chave por tela: tocar duas vezes em salvar não cria dois pedidos.
  const [idempotencyKey] = useState(newId);
  // undefined = ainda não escolhido; vindo do detalhe do cliente, começa com ele.
  const [chosen, setCustomer] = useState<Customer | null | undefined>(undefined);
  const customer = chosen !== undefined ? chosen : (preselected.data ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [custom, setCustom] = useState<CustomLine[]>([]);
  const [channel, setChannel] = useState<OrderChannel>('whatsapp');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [discount, setDiscount] = useState('');
  const [notes, setNotes] = useState('');
  const [problem, setProblem] = useState('');
  const [error, setError] = useState<string | null>(null);

  const productById = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data]);

  const draft = useMemo(() => {
    const items: (OrderItemInput & { unitPriceCents: number })[] = [];
    let invalid: string | null = null;
    for (const [id, q] of Object.entries(qty)) {
      const p = productById.get(id);
      if (q > 0 && p) items.push({ product_id: id, quantity: q, unitPriceCents: p.price_cents ?? 0 });
    }
    for (const line of custom) {
      const q = parseQuantity(line.quantity);
      const price = parseBRLToCents(line.price);
      if (!line.description.trim() || q === null || price === null) {
        invalid = 'Preencha descrição, quantidade e preço dos itens avulsos.';
        continue;
      }
      items.push({ description: line.description.trim(), quantity: q, unit_price_cents: price, unitPriceCents: price });
    }
    const discountCents = discount.trim() ? parseBRLToCents(discount) : 0;
    const totals = draftTotals(
      items.map((i) => ({ quantity: i.quantity, unitPriceCents: i.unitPriceCents })),
      discountCents ?? 0,
    );
    return { items, invalid, discountCents, totals };
  }, [qty, custom, discount, productById]);

  const save = async () => {
    setError(null);
    if (draft.invalid) return setError(draft.invalid);
    if (draft.items.length === 0) return setError('Adicione pelo menos um item.');
    if (draft.discountCents === null) return setError('Desconto inválido. Ex.: 5,00');
    if (draft.totals.total < 0) return setError('O desconto não pode ser maior que o valor dos itens.');
    let when: Date | null = null;
    if (date.trim()) {
      when = parseDateTimeBR(date, time);
      if (!when) return setError('Data ou horário inválido. Use DD/MM/AAAA e HH:MM.');
    }
    try {
      const order = await create.mutateAsync({
        idempotencyKey,
        kind: config.orderKind,
        customerId: customer?.id ?? null,
        channel,
        dueAt: isService ? null : when,
        scheduledFor: isService ? when : null,
        notes,
        problemDescription: isService ? problem : undefined,
        discountCents: draft.discountCents,
        items: draft.items.map(({ unitPriceCents: _p, ...i }) => i),
      });
      toast(`${config.orderNoun[0]!.toUpperCase()}${config.orderNoun.slice(1)} #${order.number} salvo`);
      router.replace({ pathname: '/pedidos/[id]', params: { id: order.id } });
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Screen>
      <DetailBar title={`Novo ${config.orderNoun}`} />

      <Card>
        <Text style={styles.label}>Cliente</Text>
        <Pressable accessibilityRole="button" onPress={() => setPickerOpen(true)} style={styles.select}>
          <Text style={[styles.selectText, !customer && styles.placeholder]}>{customer?.name ?? 'Sem cliente'}</Text>
          <ChevronRight size={18} color={colors.gray500} />
        </Pressable>
      </Card>

      {isService ? (
        <Card>
          <TextField
            label="O que o cliente pediu"
            value={problem}
            onChangeText={setProblem}
            placeholder="Ex.: tomada da cozinha não funciona"
            multiline
            style={styles.multiline}
          />
        </Card>
      ) : null}

      <Card style={styles.itemsCard}>
        <Text style={[styles.label, styles.padH]}>Itens</Text>
        <QueryStates
          query={products}
          isEmpty={products.data?.length === 0}
          empty={{
            icon: Package,
            title: 'Nenhum item à venda cadastrado',
            description: 'Cadastre seus produtos ou serviços, ou adicione um item avulso abaixo.',
            action: { label: 'Cadastrar item', onPress: () => router.push('/itens/form') },
          }}
        />
        {products.data?.map((p) => {
          const q = qty[p.id] ?? 0;
          return (
            <View key={p.id} style={[styles.itemRow, q > 0 && styles.itemRowActive]}>
              <View style={styles.flex}>
                <Text style={styles.itemName}>{p.name}</Text>
                <Text style={styles.muted}>{p.price_cents != null ? formatCents(p.price_cents) : 'Sem preço'}</Text>
              </View>
              <QuantityStepper
                label={p.name}
                value={q}
                step={p.unit === 'un' || p.unit === 'h' ? 1 : 0.5}
                onChange={(v) => setQty((s) => ({ ...s, [p.id]: v }))}
              />
            </View>
          );
        })}

        {custom.map((line, i) => (
          <View key={line.key} style={styles.customRow}>
            <View style={styles.customHeader}>
              <Text style={styles.itemName}>Item avulso {i + 1}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remover item avulso"
                onPress={() => setCustom((s) => s.filter((l) => l.key !== line.key))}
                hitSlop={10}
              >
                <Trash2 size={18} color={colors.gray500} />
              </Pressable>
            </View>
            <TextField
              label="Descrição"
              value={line.description}
              onChangeText={(t) => setCustom((s) => s.map((l) => (l.key === line.key ? { ...l, description: t } : l)))}
            />
            <View style={styles.twoCols}>
              <View style={styles.flex}>
                <TextField
                  label="Quantidade"
                  value={line.quantity}
                  keyboardType="decimal-pad"
                  onChangeText={(t) => setCustom((s) => s.map((l) => (l.key === line.key ? { ...l, quantity: t } : l)))}
                />
              </View>
              <View style={styles.flex}>
                <TextField
                  label="Preço unitário"
                  value={line.price}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  onChangeText={(t) => setCustom((s) => s.map((l) => (l.key === line.key ? { ...l, price: t } : l)))}
                />
              </View>
            </View>
          </View>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => setCustom((s) => [...s, { key: newId(), description: '', quantity: '1', price: '' }])}
          style={styles.addLine}
        >
          <Plus size={18} color={colors.primaryText} />
          <Text style={styles.addLineText}>Adicionar item avulso</Text>
        </Pressable>
      </Card>

      <Card>
        <Text style={styles.label}>{isService ? 'Agendamento' : 'Prazo de entrega'} (opcional)</Text>
        <View style={styles.twoCols}>
          <View style={styles.flex}>
            <TextField label="Data" value={date} onChangeText={setDate} placeholder="DD/MM/AAAA" keyboardType="numbers-and-punctuation" />
          </View>
          <View style={styles.flex}>
            <TextField label="Horário" value={time} onChangeText={setTime} placeholder="HH:MM" keyboardType="numbers-and-punctuation" />
          </View>
        </View>
        <Text style={styles.label}>Origem</Text>
        <Chips
          accessibilityLabel="Origem"
          value={channel}
          onChange={setChannel}
          options={CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))}
        />
        <TextField label="Desconto (opcional)" value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" placeholder="0,00" />
        <TextField label="Observações (opcional)" value={notes} onChangeText={setNotes} multiline style={styles.multiline} />
      </Card>

      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Itens</Text>
          <Text style={styles.summaryValue}>{formatCents(draft.totals.subtotal)}</Text>
        </View>
        {draft.discountCents ? (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Desconto</Text>
            <Text style={styles.summaryValue}>− {formatCents(draft.discountCents)}</Text>
          </View>
        ) : null}
        <Text style={styles.summaryHint}>O total final é calculado pelo sistema ao salvar.</Text>
      </View>

      <FormError message={error} />
      <Button
        label={`Salvar ${config.orderNoun}`}
        trailing={<Text style={styles.btnValue}>{formatCents(Math.max(0, draft.totals.total))}</Text>}
        onPress={save}
        loading={create.isPending}
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
  flex: { flex: 1 },
  padH: { paddingHorizontal: 14 },
  label: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
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
  selectText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  placeholder: { color: colors.gray500 },
  itemsCard: { paddingHorizontal: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, minHeight: 56 },
  itemRowActive: { backgroundColor: colors.primaryTint },
  itemName: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  customRow: { gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: colors.divider },
  customHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  twoCols: { flexDirection: 'row', gap: 10 },
  addLine: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 14 },
  addLineText: { fontFamily: fonts.bold, fontSize: 14, color: colors.primaryText },
  multiline: { minHeight: 80, textAlignVertical: 'top', paddingTop: 12 },
  summary: { backgroundColor: colors.graphite, borderRadius: radius.card, padding: 18, gap: 6 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gray400 },
  summaryValue: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.white },
  summaryHint: { fontFamily: fonts.medium, fontSize: 11, color: colors.gray400 },
  btnValue: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.white },
});
