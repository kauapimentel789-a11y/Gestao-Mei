import { router, useLocalSearchParams } from 'expo-router';
import { Check, MessageCircle, PackageMinus } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DetailBar } from '@/components/DetailBar';
import { ErrorCard } from '@/components/ErrorCard';
import { FormError } from '@/components/FormError';
import { Skeleton } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { TextLink } from '@/components/TextLink';
import { useToast } from '@/components/Toast';
import type { OrderStatus } from '@/config/business';
import { useAccounts, useOrderEntry, useReceiveOrderPayment } from '@/features/finance/api';
import { formatISODate, METHOD_LABEL, statusLabel } from '@/features/finance/logic';
import { PaymentDialog } from '@/features/finance/PaymentDialog';
import { useConsumeOrder } from '@/features/inventory/api';
import { CHANNEL_LABEL, type OrderDetail, useOrder, useSetOrderStatus } from '@/features/orders/api';
import { canTransition, formatQuantity, isLate, STATUS_FLOW } from '@/features/orders/logic';
import { StatusChip } from '@/features/orders/StatusChip';
import { useOrg } from '@/features/organizations/useOrg';
import { formatWhen } from '@/lib/dates';
import { newId } from '@/lib/ids';
import { friendlyError } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { whatsappUrl } from '@/lib/whatsapp';
import { colors, fonts, radius, shadows } from '@/theme/tokens';

function lateText(dueAt: string, now = new Date()) {
  const hours = Math.floor((now.getTime() - new Date(dueAt).getTime()) / 3_600_000);
  if (hours < 24) return `Atrasado há ${Math.max(1, hours)} h`;
  const days = Math.floor(hours / 24);
  return `Atrasado há ${days} ${days > 1 ? 'dias' : 'dia'}`;
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orgId, org, config } = useOrg();
  const order = useOrder(orgId, id);
  const setStatus = useSetOrderStatus(orgId);
  const consume = useConsumeOrder(orgId);
  const toast = useToast();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [negativeOpen, setNegativeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const o = order.data;
  const noun = config.orderNoun;
  const title = o ? `${noun[0]!.toUpperCase()}${noun.slice(1)} #${o.number}` : '';

  const change = async (status: OrderStatus, reason?: string) => {
    if (!o) return;
    setError(null);
    try {
      await setStatus.mutateAsync({ id: o.id, status, reason });
      toast(status === 'cancelled' ? `#${o.number} cancelado` : `#${o.number}: ${config.statusLabels[status]}`);
      return true;
    } catch (e) {
      setError(friendlyError(e));
      return false;
    }
  };

  const consumeStock = async (allowNegative: boolean) => {
    if (!o) return;
    setError(null);
    try {
      await consume.mutateAsync({ orderId: o.id, allowNegative });
      setNegativeOpen(false);
      toast(`Estoque do #${o.number} baixado`);
    } catch (e) {
      const err = e as { message?: string };
      if (!allowNegative && err.message === 'insufficient_stock') {
        setNegativeOpen(true);
      } else {
        setNegativeOpen(false);
        setError(friendlyError(e));
      }
    }
  };

  if (order.isPending) {
    return (
      <Screen>
        <DetailBar title="" />
        <Skeleton rows={4} />
      </Screen>
    );
  }
  if (order.error || !o) {
    return (
      <Screen>
        <DetailBar title="" />
        <ErrorCard message={friendlyError(order.error)} onRetry={() => order.refetch()} />
      </Screen>
    );
  }

  const late = isLate(o);
  const currentIdx = STATUS_FLOW.indexOf(o.status);
  const wa = o.customer?.phone_digits
    ? whatsappUrl(o.customer.phone_digits, `Olá, ${o.customer.name.split(' ')[0]}! Sobre seu ${noun} #${o.number} da ${org.name}:`)
    : null;
  const finalStatus = STATUS_FLOW[STATUS_FLOW.length - 1]!;

  return (
    <Screen>
      <DetailBar title={title} />

      {late && o.due_at ? (
        <View style={styles.lateBanner}>
          <Text style={styles.lateTitle}>{lateText(o.due_at)}</Text>
          <Text style={styles.lateSub}>Prazo: {formatWhen(new Date(o.due_at))}</Text>
        </View>
      ) : null}

      <Card>
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text style={styles.customer}>{o.customer?.name ?? 'Sem cliente'}</Text>
            {o.customer?.phone ? <Text style={styles.muted}>{o.customer.phone}</Text> : null}
            {o.due_at ? <Text style={styles.muted}>Prazo: {formatWhen(new Date(o.due_at))}</Text> : null}
            {o.scheduled_for ? <Text style={styles.muted}>Agendado: {formatWhen(new Date(o.scheduled_for))}</Text> : null}
            <Text style={styles.muted}>Origem: {CHANNEL_LABEL[o.channel]}</Text>
          </View>
          {wa ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Conversar no WhatsApp"
              onPress={() => Linking.openURL(wa)}
              style={styles.waBtn}
            >
              <MessageCircle size={18} color={colors.primaryText} />
              <Text style={styles.waText}>WhatsApp</Text>
            </Pressable>
          ) : null}
        </View>

        {o.status === 'cancelled' ? (
          <View style={styles.cancelled}>
            <StatusChip status="cancelled" label="Cancelado" />
            {o.cancel_reason ? <Text style={styles.muted}>Motivo: {o.cancel_reason}</Text> : null}
          </View>
        ) : (
          <View style={styles.stepper} accessibilityRole="adjustable" accessibilityLabel={`Status: ${config.statusLabels[o.status]}`}>
            {STATUS_FLOW.map((s, i) => {
              const reached = i <= currentIdx;
              const allowed = canTransition(o.status, s);
              return (
                <Pressable
                  key={s}
                  accessibilityRole="button"
                  accessibilityLabel={`Mudar para ${config.statusLabels[s]}`}
                  accessibilityState={{ disabled: !allowed, selected: s === o.status }}
                  disabled={!allowed || setStatus.isPending}
                  onPress={() => change(s)}
                  style={styles.step}
                >
                  <View style={[styles.stepBar, { backgroundColor: reached ? colors.primary : colors.gray200 }]} />
                  <Text style={[styles.stepLabel, { color: reached ? colors.ink : colors.gray400 }]} numberOfLines={2}>
                    {config.statusLabels[s]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </Card>

      {o.problem_description ? (
        <Card>
          <Text style={styles.cardTitle}>Solicitação</Text>
          <Text style={styles.body}>{o.problem_description}</Text>
        </Card>
      ) : null}

      <Card>
        <Text style={styles.cardTitle}>Itens</Text>
        {o.items.map((it) => (
          <View key={it.id} style={styles.itemRow}>
            <View style={styles.flex}>
              <Text style={styles.itemName}>{it.description}</Text>
              <Text style={styles.muted}>
                {formatQuantity(it.quantity)} {it.unit !== 'un' ? it.unit : ''} × {formatCents(it.unit_price_cents)}
              </Text>
            </View>
            <Text style={styles.itemTotal}>{formatCents(it.line_total_cents)}</Text>
          </View>
        ))}
        {o.discount_cents > 0 ? (
          <View style={styles.totalRow}>
            <Text style={styles.muted}>Desconto</Text>
            <Text style={styles.muted}>− {formatCents(o.discount_cents)}</Text>
          </View>
        ) : null}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatCents(o.total_cents)}</Text>
        </View>
      </Card>

      <OrderPayment order={o} />

      {o.tracks_stock && (o.stock_consumed_at || o.status !== 'cancelled') ? (
        <Card>
          <Text style={styles.cardTitle}>Estoque</Text>
          {o.stock_consumed_at ? (
            <Text style={styles.body}>
              Itens baixados do estoque em {formatWhen(new Date(o.stock_consumed_at))}.
              {o.status === 'cancelled' ? ' O cancelamento devolveu os itens ao estoque.' : ' Se cancelar, eles voltam ao estoque.'}
            </Text>
          ) : (
            <>
              <Text style={styles.body}>
                Os itens ainda não saíram do estoque. Baixe quando separar ou entregar; isso é feito uma vez só.
              </Text>
              <Button
                variant="tint"
                size="medium"
                label="Baixar do estoque"
                trailing={<PackageMinus size={18} color={colors.primaryText} />}
                loading={consume.isPending}
                onPress={() => consumeStock(false)}
              />
            </>
          )}
        </Card>
      ) : null}

      {o.notes ? (
        <Card>
          <Text style={styles.cardTitle}>Observações</Text>
          <Text style={styles.body}>{o.notes}</Text>
        </Card>
      ) : null}

      <FormError message={error} />

      {canTransition(o.status, finalStatus) ? (
        <Button
          variant="ink"
          label={`Marcar como ${config.statusLabels[finalStatus].toLowerCase()}`}
          trailing={<Check size={18} color={colors.primary} />}
          loading={setStatus.isPending}
          onPress={() => change(finalStatus)}
        />
      ) : null}

      <Card>
        <Text style={styles.cardTitle}>Histórico</Text>
        {o.history.map((h) => (
          <View key={h.id} style={styles.historyRow}>
            <Text style={styles.body}>
              {h.from_status ? config.statusLabels[h.to_status] : `Criado como ${config.statusLabels[h.to_status]}`}
              {h.reason ? ` · ${h.reason}` : ''}
            </Text>
            <Text style={styles.muted}>{formatWhen(new Date(h.changed_at))}</Text>
          </View>
        ))}
      </Card>

      {canTransition(o.status, 'cancelled') ? (
        <TextLink label={`Cancelar ${noun}`} onPress={() => setCancelOpen(true)} />
      ) : null}

      <Modal visible={negativeOpen} transparent animationType="fade" onRequestClose={() => setNegativeOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Estoque insuficiente</Text>
            <Text style={styles.body}>
              Algum item ficaria com saldo negativo. Baixe assim mesmo só se o estoque estiver desatualizado; a autorização fica registrada.
            </Text>
            <Button variant="ink" size="medium" label="Voltar" onPress={() => setNegativeOpen(false)} />
            <Button size="medium" label="Baixar assim mesmo" loading={consume.isPending} onPress={() => consumeStock(true)} />
          </View>
        </View>
      </Modal>

      <CancelDialog
        visible={cancelOpen}
        noun={noun}
        returnsStock={Boolean(o.stock_consumed_at)}
        loading={setStatus.isPending}
        onClose={() => setCancelOpen(false)}
        onConfirm={async (reason) => {
          if (await change('cancelled', reason)) setCancelOpen(false);
        }}
      />
    </Screen>
  );
}

/** Recebimentos do pedido: o primeiro cria o título a receber; os seguintes abatem o mesmo título. */
function OrderPayment({ order: o }: { order: OrderDetail }) {
  const { orgId } = useOrg();
  const orderEntry = useOrderEntry(orgId, o.id);
  const accounts = useAccounts(orgId);
  const receive = useReceiveOrderPayment(orgId);
  const toast = useToast();
  const [payKey, setPayKey] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const fin = orderEntry.data;
  const received = fin?.entry.paid_cents ?? 0;
  const open = fin ? fin.entry.open_cents : o.status === 'cancelled' ? 0 : o.total_cents;

  return (
    <Card>
      <Text style={styles.cardTitle}>Pagamento</Text>
      <View style={styles.totalRow}>
        <Text style={styles.muted}>{fin ? statusLabel(fin.entry.status, 'receivable') : 'Nada recebido ainda'}</Text>
        <Text style={styles.muted}>
          Recebido {formatCents(received)} · falta {formatCents(open)}
        </Text>
      </View>
      {fin?.payments.map((p) => (
        <View key={p.id} style={styles.payRow}>
          <Text style={styles.body}>
            {p.reverses_payment_id ? 'Estorno' : METHOD_LABEL[p.method]} · {formatISODate(p.paid_on)}
          </Text>
          <Text style={styles.itemTotal}>{formatCents(p.amount_cents)}</Text>
        </View>
      ))}
      {open > 0 && o.status !== 'cancelled' ? (
        <Button
          variant="tint"
          size="medium"
          label="Registrar recebimento"
          onPress={() => {
            setPayError(null);
            setPayKey(newId());
          }}
        />
      ) : null}
      {fin ? (
        <TextLink label="Ver no financeiro" onPress={() => router.push({ pathname: '/financeiro/[id]', params: { id: fin.entry.id } })} />
      ) : null}
      <PaymentDialog
        key={payKey ?? 'closed'}
        visible={payKey !== null}
        receiving
        openCents={open}
        accounts={accounts.data ?? []}
        loading={receive.isPending}
        error={payError}
        onClose={() => setPayKey(null)}
        onConfirm={async (v) => {
          if (!payKey) return;
          try {
            await receive.mutateAsync({ orderId: o.id, ...v, idempotencyKey: payKey });
            setPayKey(null);
            toast(`Recebimento do #${o.number} registrado`);
          } catch (err) {
            setPayError(friendlyError(err));
          }
        }}
      />
    </Card>
  );
}

function CancelDialog({
  visible,
  noun,
  returnsStock,
  loading,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  noun: string;
  returnsStock: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | undefined>();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>Cancelar {noun}?</Text>
          <Text style={styles.body}>
            O {noun} continua no histórico como cancelado.{returnsStock ? ' Os itens baixados voltam ao estoque.' : ''} Essa ação não pode
            ser desfeita.
          </Text>
          <TextField label="Motivo" value={reason} onChangeText={setReason} error={err} placeholder="Ex.: cliente desistiu" />
          <Button variant="ink" size="medium" label={`Manter ${noun}`} onPress={onClose} />
          <Button
            size="medium"
            label={`Cancelar ${noun}`}
            loading={loading}
            onPress={() => {
              if (reason.trim().length < 3) return setErr('Informe o motivo.');
              setErr(undefined);
              onConfirm(reason.trim());
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  lateBanner: { backgroundColor: colors.primary, borderRadius: 20, padding: 16, gap: 2 },
  lateTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.white },
  lateSub: { fontFamily: fonts.medium, fontSize: 12, color: colors.white },
  customer: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  waBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: radius.input,
    backgroundColor: colors.primaryTint,
  },
  waText: { fontFamily: fonts.bold, fontSize: 13, color: colors.primaryText },
  cancelled: { gap: 6, alignItems: 'flex-start' },
  stepper: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, gap: 6, minHeight: 44 },
  stepBar: { height: 6, borderRadius: 3 },
  stepLabel: { fontFamily: fonts.bold, fontSize: 10 },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemName: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  itemTotal: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.ink },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 10,
  },
  totalLabel: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  totalValue: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.ink },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  historyRow: { gap: 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,11,15,0.45)', justifyContent: 'center', padding: 20 },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 20, gap: 12, ...shadows.card },
  dialogTitle: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.ink },
});
