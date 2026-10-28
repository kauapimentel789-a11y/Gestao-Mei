// Atalho das listas (pedidos, agenda, início): avança o pedido para a próxima
// etapa sem abrir o detalhe. A mensagem pronta para o cliente aparece ali
// mesmo; em atendimentos com valor em aberto, "Atendido" abre o recebimento.
import { router } from 'expo-router';
import { Check, ChevronRight } from 'lucide-react-native';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { useToast } from '@/components/Toast';
import { useOrderEntry } from '@/features/finance/api';
import { useCustomerNotice } from '@/features/messages/CustomerNotice';
import { type NoticeEvent, statusEvent } from '@/features/messages/templates';
import { useOrg } from '@/features/organizations/useOrg';
import { friendlyError } from '@/lib/errors';
import { colors, fonts, radius } from '@/theme/tokens';

import { type OrderSummary, useOrder, useSetOrderStatus } from './api';
import { nextQuickStatus } from './logic';

interface Pending {
  key: number;
  orderId: string;
  event: NoticeEvent;
}

const NoticeCtx = createContext<(orderId: string, event: NoticeEvent) => void>(() => {});

/**
 * Fica acima das telas: depois do avanço a linha pode sair da lista (ex.: pedido
 * entregue some de "Abertos"), então a mensagem não pode depender dela.
 */
export function QuickNoticeProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const offer = useCallback((orderId: string, event: NoticeEvent) => setPending({ key: Date.now(), orderId, event }), []);
  return (
    <NoticeCtx.Provider value={offer}>
      {children}
      {pending ? <PendingNotice key={pending.key} orderId={pending.orderId} event={pending.event} /> : null}
    </NoticeCtx.Provider>
  );
}

function PendingNotice({ orderId, event }: { orderId: string; event: NoticeEvent }) {
  const { orgId } = useOrg();
  const order = useOrder(orgId, orderId);
  const entry = useOrderEntry(orgId, orderId);
  const notice = useCustomerNotice(order.data);
  const offered = useRef(false);
  const ready = Boolean(order.data) && !entry.isPending;

  useEffect(() => {
    if (!ready || offered.current) return;
    offered.current = true;
    notice.offer(event);
  }, [ready, event, notice]);

  return notice.element;
}

export function QuickAdvance({ order: o }: { order: Pick<OrderSummary, 'id' | 'number' | 'status' | 'total_cents'> }) {
  const { orgId, config } = useOrg();
  const setStatus = useSetOrderStatus(orgId);
  const offerNotice = useContext(NoticeCtx);
  const toast = useToast();
  const next = nextQuickStatus(o.status, config.statusFlow);
  if (!next) return null;

  const label = config.statusLabels[next];
  const final = next === config.statusFlow[config.statusFlow.length - 1];
  const Icon = final || next === 'completed' ? Check : ChevronRight;

  const onPress = async () => {
    try {
      await setStatus.mutateAsync({ id: o.id, status: next });
      toast(`#${o.number}: ${label}`);
      // Atendimento concluído com valor: o próximo passo é receber, que fica no detalhe.
      if (config.profile === 'appointments' && final && o.total_cents > 0) {
        router.push({ pathname: '/pedidos/[id]', params: { id: o.id, aviso: 'receber' } });
        return;
      }
      const event = statusEvent(next);
      if (event) offerNotice(o.id, event);
    } catch (e) {
      toast(friendlyError(e));
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Marcar #${o.number} como ${label.toLowerCase()}`}
      disabled={setStatus.isPending}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.pill, final && styles.pillFinal, pressed && styles.pressed]}
    >
      {setStatus.isPending ? (
        <ActivityIndicator size="small" color={final ? colors.white : colors.primaryText} />
      ) : (
        <>
          <Text style={[styles.text, final && styles.textFinal]} numberOfLines={1}>
            {label}
          </Text>
          <Icon size={14} color={final ? colors.primary : colors.primaryText} />
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 32,
    minWidth: 72,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
  },
  pillFinal: { backgroundColor: colors.ink },
  pressed: { opacity: 0.7 },
  text: { fontFamily: fonts.bold, fontSize: 11, color: colors.primaryText },
  textFinal: { color: colors.white },
});
