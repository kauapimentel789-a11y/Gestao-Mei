import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useOrders } from '@/features/orders/api';
import { useOrg } from '@/features/organizations/useOrg';

import { LATE_PREFIX, planLateAlerts } from './logic';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

/** Remove os avisos de atraso agendados por este app. */
export async function clearLateAlerts() {
  if (Platform.OS === 'web') return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled.filter((n) => n.identifier.startsWith(LATE_PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

export async function syncLateAlerts(alerts: ReturnType<typeof planLateAlerts>) {
  const { granted } = await Notifications.getPermissionsAsync();
  await clearLateAlerts();
  if (!granted) return;
  for (const a of alerts) {
    await Notifications.scheduleNotificationAsync({
      identifier: a.identifier,
      content: { title: a.title, body: a.body, data: { orderId: a.orderId } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: a.date },
    });
  }
}

/**
 * Agenda uma notificação local no prazo de cada pedido em aberto da empresa
 * ativa e abre o pedido quando o aviso é tocado. Não desenha nada.
 */
export function LateOrderAlerts() {
  if (Platform.OS === 'web') return null;
  return <NativeLateOrderAlerts />;
}

function NativeLateOrderAlerts() {
  const { orgId, config } = useOrg();
  const open = useOrders(orgId, 'open');
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!open.data) return;
    syncLateAlerts(planLateAlerts(open.data, config.orderNoun)).catch(() => {
      // Sem permissão ou agendamento recusado pelo sistema: o banner da Início continua avisando.
    });
  }, [open.data, config.orderNoun]);

  useEffect(() => {
    const orderId = response?.notification.request.content.data?.orderId;
    if (typeof orderId === 'string' && response?.notification.request.identifier.startsWith(LATE_PREFIX)) {
      router.push({ pathname: '/pedidos/[id]', params: { id: orderId } });
    }
  }, [response]);

  return null;
}
