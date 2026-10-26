import { useLocalSearchParams } from 'expo-router';
import { CircleCheck, Store } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chips } from '@/components/Chips';
import { EmptyState } from '@/components/EmptyState';
import { FormError } from '@/components/FormError';
import { Skeleton } from '@/components/ListStates';
import { QuantityStepper } from '@/components/QuantityStepper';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { parseDateInput } from '@/features/finance/logic';
import { formatWeight, isWeightUnit, lineTotalCents } from '@/features/orders/logic';
import { PublicOrderError, useSendPublicOrder, useStorefront } from '@/features/public-order/api';
import { newId } from '@/lib/ids';
import { formatCents } from '@/lib/money';
import { colors, fonts, radius } from '@/theme/tokens';

import { orderRequest, type Storefront } from '../../../supabase/functions/_shared/public-order';

/** Página pública de encomenda: o cliente da empresa abre sem login. */
export default function PublicOrderPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const store = useStorefront(String(slug ?? ''));

  return (
    <Screen>
      {store.isPending ? (
        <Skeleton rows={4} />
      ) : store.error || !store.data ? (
        <EmptyState
          icon={Store}
          title={store.error instanceof PublicOrderError && store.error.code === 'not_found' ? 'Link indisponível' : 'Não foi possível abrir'}
          description={store.error instanceof Error ? store.error.message : undefined}
        />
      ) : (
        <OrderForm store={store.data} />
      )}
    </Screen>
  );
}

function OrderForm({ store }: { store: Storefront }) {
  const send = useSendPublicOrder();
  const [key] = useState(newId);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [zoneId, setZoneId] = useState('pickup');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isService = store.business_type === 'services';

  const zones = store.delivery_zones ?? [];
  const zone = zones.find((z) => z.id === zoneId) ?? null;
  const items = store.products.filter((p) => (qty[p.id] ?? 0) > 0).map((p) => ({ product_id: p.id, quantity: qty[p.id]! }));
  const hasWeight = store.products.some((p) => isWeightUnit(p.unit));
  // Só para mostrar no botão; o valor que vale é o calculado no servidor.
  const estimate =
    store.products.reduce((sum, p) => sum + lineTotalCents({ quantity: qty[p.id] ?? 0, unitPriceCents: p.price_cents }), 0) +
    (items.length > 0 ? (zone?.fee_cents ?? 0) : 0);

  if (send.data) {
    return (
      <View style={styles.done}>
        <CircleCheck size={56} color={colors.primary} />
        <Text style={styles.doneTitle} accessibilityRole="header">
          {isService ? 'Pedido enviado' : 'Encomenda enviada'}
        </Text>
        <Text style={styles.doneText}>
          {store.name} recebeu o pedido nº {send.data.number}, no total de {formatCents(send.data.total_cents)}
          {send.data.delivery_fee_cents ? `, já com a entrega de ${formatCents(send.data.delivery_fee_cents)}` : ''}.
          {hasWeight ? ' Nos itens por quilo, o valor final é confirmado na pesagem.' : ''} A confirmação chega pelo WhatsApp informado.
        </Text>
      </View>
    );
  }

  const submit = () => {
    setError(null);
    const dueDate = date.trim() ? parseDateInput(date) : null;
    if (date.trim() && !dueDate) {
      setError('Data inválida. Use o formato dd/mm/aaaa.');
      return;
    }
    const parsed = orderRequest.safeParse({
      action: 'order',
      slug: store.slug,
      idempotency_key: key,
      name,
      phone,
      due_date: dueDate,
      notes: notes.trim() || null,
      items,
      delivery_zone_id: zone?.id ?? null,
      address: zone ? address.trim() : null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Confira os dados.');
      return;
    }
    const { action: _action, ...input } = parsed.data;
    send.mutate(input, { onError: (e) => setError(e instanceof Error ? e.message : 'Não foi possível enviar.') });
  };

  return (
    <>
      <View style={styles.hero}>
        <View style={styles.glow} pointerEvents="none" />
        <Text style={styles.kicker}>{isService ? 'PEDIDO DE SERVIÇO' : 'ENCOMENDA'}</Text>
        <Text style={styles.heroTitle} accessibilityRole="header">
          {store.name}
        </Text>
        <Text style={styles.heroSub}>Escolha os itens e envie. A empresa confirma com você pelo WhatsApp.</Text>
      </View>

      <Card>
        <Text style={styles.cardTitle}>{isService ? 'Serviços' : 'Itens'}</Text>
        {store.products.length === 0 ? (
          <Text style={styles.body}>Nenhum item disponível no momento.</Text>
        ) : (
          store.products.map((p, i) => (
            <View key={p.id} style={[styles.product, i > 0 && styles.divider]}>
              <View style={styles.flex}>
                <Text style={styles.productName}>{p.name}</Text>
                {p.description ? <Text style={styles.muted}>{p.description}</Text> : null}
                <Text style={styles.price}>
                  {formatCents(p.price_cents)}
                  {p.item_type === 'service' ? '' : isWeightUnit(p.unit) ? ' o quilo' : ` / ${p.unit}`}
                </Text>
                {isWeightUnit(p.unit) && (qty[p.id] ?? 0) > 0 ? (
                  <Text style={styles.muted}>
                    {formatWeight(qty[p.id]!)} ≈ {formatCents(lineTotalCents({ quantity: qty[p.id]!, unitPriceCents: p.price_cents }))}
                  </Text>
                ) : null}
              </View>
              {isWeightUnit(p.unit) ? (
                <QuantityStepper
                  label={`${p.name} em quilos`}
                  value={qty[p.id] ?? 0}
                  step={0.5}
                  onChange={(v) => setQty({ ...qty, [p.id]: Math.min(100, v) })}
                />
              ) : (
                <QuantityStepper label={p.name} value={qty[p.id] ?? 0} onChange={(v) => setQty({ ...qty, [p.id]: Math.min(1000, v) })} />
              )}
            </View>
          ))
        )}
        {hasWeight ? (
          <Text style={styles.muted}>Itens por quilo: escolha o peso aproximado. O valor final é confirmado na pesagem.</Text>
        ) : null}
      </Card>

      {zones.length > 0 && !isService ? (
        <Card>
          <Text style={styles.cardTitle}>Entrega</Text>
          <Chips
            accessibilityLabel="Entrega"
            value={zoneId}
            onChange={setZoneId}
            options={[
              { value: 'pickup', label: 'Vou retirar' },
              ...zones.map((z) => ({ value: z.id, label: `${z.name} · ${z.fee_cents ? formatCents(z.fee_cents) : 'grátis'}` })),
            ]}
          />
          {zone ? (
            <TextField
              label="Endereço de entrega"
              value={address}
              onChangeText={setAddress}
              placeholder="Rua, número, complemento"
              autoComplete="street-address"
              maxLength={200}
            />
          ) : (
            <Text style={styles.muted}>Seu bairro não está na lista? Escolha retirar e combine a entrega pelo WhatsApp.</Text>
          )}
        </Card>
      ) : null}

      <Card>
        <Text style={styles.cardTitle}>Seus dados</Text>
        <TextField label="Nome" value={name} onChangeText={setName} autoComplete="name" maxLength={120} />
        <TextField label="WhatsApp com DDD" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" maxLength={30} />
        <TextField
          label={isService ? 'Data desejada (opcional)' : 'Para quando? (opcional)'}
          value={date}
          onChangeText={setDate}
          placeholder="dd/mm/aaaa"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
        <TextField label="Observações (opcional)" value={notes} onChangeText={setNotes} multiline maxLength={1000} />
      </Card>

      <FormError message={error} />
      <Button
        label={items.length > 0 ? `Enviar ${isService ? 'pedido' : 'encomenda'} · ${formatCents(estimate)}` : 'Escolha pelo menos um item'}
        disabled={items.length === 0}
        loading={send.isPending}
        onPress={submit}
      />
      <Text style={styles.note}>Seus dados vão só para {store.name}, para combinar a entrega.</Text>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  hero: { backgroundColor: colors.ink, borderRadius: radius.hero, padding: 20, gap: 6, overflow: 'hidden' },
  glow: { position: 'absolute', top: -120, right: -90, width: 240, height: 240, borderRadius: 120, backgroundColor: colors.primary, opacity: 0.45 },
  kicker: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 2.6, color: colors.primary },
  heroTitle: { fontFamily: fonts.extrabold, fontSize: 26, letterSpacing: -0.5, color: colors.white },
  heroSub: { fontFamily: fonts.medium, fontSize: 13, color: colors.gray300, lineHeight: 19 },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 13, color: colors.gray600 },
  product: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  productName: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  price: { fontFamily: fonts.extrabold, fontSize: 13, color: colors.primaryText },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  note: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500, textAlign: 'center' },
  done: { alignItems: 'center', gap: 12, paddingTop: 80, paddingHorizontal: 8 },
  doneTitle: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.ink },
  doneText: { fontFamily: fonts.medium, fontSize: 15, color: colors.gray600, textAlign: 'center', lineHeight: 22 },
});
