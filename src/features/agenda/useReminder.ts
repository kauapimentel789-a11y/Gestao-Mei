// Lembrete pelo WhatsApp: abre a conversa com a mensagem pronta e registra o envio.
import { Linking } from 'react-native';

import { useToast } from '@/components/Toast';
import { useOrg } from '@/features/organizations/useOrg';
import { friendlyError } from '@/lib/errors';
import { whatsappUrl } from '@/lib/whatsapp';

import { useMarkReminderSent } from './api';
import { reminderText } from './logic';

export interface ReminderTarget {
  id: string;
  scheduled_for: string | null;
  customer_name: string | null;
  customer_phone_digits: string | null;
}

export function useReminder() {
  const { org, orgId } = useOrg();
  const mark = useMarkReminderSent(orgId);
  const toast = useToast();

  const urlFor = (t: ReminderTarget) =>
    t.customer_phone_digits && t.scheduled_for
      ? whatsappUrl(t.customer_phone_digits, reminderText({ name: t.customer_name, at: new Date(t.scheduled_for), business: org.name }))
      : null;

  const send = async (t: ReminderTarget) => {
    const url = urlFor(t);
    if (!url) return;
    try {
      await Linking.openURL(url);
      await mark.mutateAsync(t.id);
    } catch (e) {
      toast(friendlyError(e));
    }
  };

  return { urlFor, send, sending: mark.isPending };
}
