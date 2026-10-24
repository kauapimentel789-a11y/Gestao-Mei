import { useLocalSearchParams } from 'expo-router';
import { Check, MessageCircle } from 'lucide-react-native';
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
import { CHANNEL_LABEL, useOrder, useSetOrderStatus } from '@/features/orders/api';
import { canTransition, formatQuantity, isLate, STATUS_FLOW } from '@/features/orders/logic';
import { StatusChip } from '@/features/orders/StatusChip';
import { useOrg } from '@/features/organizations/useOrg';
import { formatWhen } from '@/lib/dates';
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
  const toast = useToast();
  const [cancelOpen, setCancelOpen] = useState(false);
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
        <Text style={styles.hint}>Pagamentos e saldo a receber chegam com o módulo financeiro.</Text>
      </Card>

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

      <CancelDialog
        visible={cancelOpen}
        noun={noun}
        loading={setStatus.isPending}
        onClose={() => setCancelOpen(false)}
        onConfirm={async (reason) => {
          if (await change('cancelled', reason)) setCancelOpen(false);
        }}
      />
    </Screen>
  );
}

function CancelDialog({
  visible,
  noun,
  loading,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  noun: string;
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
            O {noun} continua no histórico como cancelado. Essa ação não pode ser desfeita.
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
  hint: { fontFamily: fonts.medium, fontSize: 11, color: colors.gray400 },
  historyRow: { gap: 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,11,15,0.45)', justifyContent: 'center', padding: 20 },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 20, gap: 12, ...shadows.card },
  dialogTitle: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.ink },
});
