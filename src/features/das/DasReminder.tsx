import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { useOrg } from '@/features/organizations/useOrg';

import { useDasStatus } from './api';
import { currentDasPeriod, DAS_REMINDER_ID, nextDasReminder } from './logic';

/** Remove o lembrete agendado (ao sair da conta). */
export async function clearDasReminder() {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(DAS_REMINDER_ID);
}

/**
 * Agenda um aviso local no dia 15 para lembrar do DAS (só com a permissão de
 * avisos já dada em Configurações). Refeito a cada abertura. Não desenha nada.
 */
export function DasReminder() {
  if (Platform.OS === 'web') return null;
  return <NativeDasReminder />;
}

function NativeDasReminder() {
  const { orgId } = useOrg();
  const [period] = useState(() => currentDasPeriod());
  const status = useDasStatus(orgId, period);
  const registered = status.data?.registered;

  useEffect(() => {
    if (registered === undefined) return;
    (async () => {
      const { granted } = await Notifications.getPermissionsAsync();
      await Notifications.cancelScheduledNotificationAsync(DAS_REMINDER_ID).catch(() => undefined);
      if (!granted) return;
      await Notifications.scheduleNotificationAsync({
        identifier: DAS_REMINDER_ID,
        content: { title: 'Lembrete do DAS', body: 'A guia do MEI vence dia 20. Toque para ver na Início.' },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: nextDasReminder(registered) },
      });
    })().catch(() => {
      // Sem permissão ou agendamento recusado: o cartão da Início continua lembrando.
    });
  }, [registered]);

  return null;
}
