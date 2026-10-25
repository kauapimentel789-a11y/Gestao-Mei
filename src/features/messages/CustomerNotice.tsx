// Depois de cada etapa (agendou, ficou pronto, recebeu…), o app já oferece a
// mensagem para o cliente: o texto aparece pronto, dá para ajustar, e um toque
// abre o WhatsApp. Pode ser desligado em Configurações.
import { MessageCircle } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useToast } from '@/components/Toast';
import { useOrderEntry } from '@/features/finance/api';
import type { OrderDetail } from '@/features/orders/api';
import { usePixSettings } from '@/features/organizations/pix';
import { useOrg } from '@/features/organizations/useOrg';
import { PIX_KEY_LABEL, pixCopyPaste } from '@/lib/pix';
import { useDeviceFlag } from '@/lib/useDeviceFlag';
import { whatsappUrl } from '@/lib/whatsapp';
import { colors, fonts, radius, shadows } from '@/theme/tokens';

import { type NoticeContext, type NoticeEvent, noticeText, noticeTitle } from './templates';

/** Guardado no aparelho: "1" quando a pessoa desligou as mensagens prontas. */
export const NOTICES_OFF_KEY = 'customer_notices_off';

export interface NoticeExtra {
  paidCents?: number;
  /** Data nova, ao reagendar (o pedido em cache ainda tem a antiga). */
  scheduledFor?: Date | null;
}

interface Pending {
  event: NoticeEvent;
  text: string;
}

/**
 * `offer(evento)` monta a mensagem a partir do pedido e abre o cartão; `element`
 * vai no fim da tela. Sem texto para a etapa, ou com as mensagens desligadas,
 * não aparece nada.
 */
export function useCustomerNotice(order: OrderDetail | undefined) {
  const { org, orgId, config } = useOrg();
  const entry = useOrderEntry(orgId, order?.id ?? '');
  const pix = usePixSettings(orgId);
  const [off] = useDeviceFlag(NOTICES_OFF_KEY);
  const [pending, setPending] = useState<Pending | null>(null);

  const offer = (event: NoticeEvent, extra: NoticeExtra = {}) => {
    if (!order || off) return;
    const open = entry.data ? entry.data.entry.open_cents : event === 'cancelled' ? 0 : order.total_cents;
    const scheduled = extra.scheduledFor !== undefined ? extra.scheduledFor : order.scheduled_for ? new Date(order.scheduled_for) : null;
    const settings = pix.data ?? null;
    const ctx: NoticeContext = {
      profile: config.profile,
      business: org.name,
      noun: config.orderNoun,
      number: order.number,
      customerName: order.customer?.name ?? null,
      totalCents: order.total_cents,
      items: order.items.map((i) => i.description),
      dueAt: order.due_at ? new Date(order.due_at) : null,
      scheduledFor: scheduled,
      openCents: event === 'payment' ? 0 : open,
      paidCents: extra.paidCents,
      pix: settings && open > 0 ? { keyLabel: PIX_KEY_LABEL[settings.keyType], key: settings.key, code: pixCopyPaste(settings, open) } : null,
    };
    const text = noticeText(event, ctx);
    // Espera o diálogo anterior fechar: no iOS, um Modal aberto enquanto outro fecha pode não aparecer.
    if (text) setTimeout(() => setPending({ event, text }), 400);
  };

  const element = pending ? (
    <NoticeSheet
      key={pending.text}
      title={noticeTitle(pending.event, config.profile)}
      initialText={pending.text}
      customerName={order?.customer?.name ?? null}
      phoneDigits={order?.customer?.phone_digits ?? null}
      clientNoun={config.clientNoun}
      onClose={() => setPending(null)}
    />
  ) : null;

  return { offer, element };
}

function NoticeSheet({
  title,
  initialText,
  customerName,
  phoneDigits,
  clientNoun,
  onClose,
}: {
  title: string;
  initialText: string;
  customerName: string | null;
  phoneDigits: string | null;
  clientNoun: string;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialText);
  const toast = useToast();
  const direct = phoneDigits ? whatsappUrl(phoneDigits, text) : null;

  const send = async () => {
    const url = direct ?? `https://wa.me/?text=${encodeURIComponent(text)}`;
    try {
      await Linking.openURL(url);
      onClose();
    } catch {
      toast('Não foi possível abrir o WhatsApp.');
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Fechar" style={styles.flex} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.head}>
            <View style={styles.icon}>
              <MessageCircle size={20} color={colors.primaryText} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.sub}>
                {direct
                  ? `Para ${customerName ?? `o ${clientNoun}`} pelo WhatsApp`
                  : `Sem WhatsApp cadastrado: você escolhe o contato depois`}
              </Text>
            </View>
          </View>
          <TextInput
            accessibilityLabel="Mensagem"
            value={text}
            onChangeText={setText}
            multiline
            style={styles.input}
            textAlignVertical="top"
          />
          <Button label="Enviar no WhatsApp" onPress={send} disabled={!text.trim()} trailing={<MessageCircle size={18} color={colors.white} />} />
          <Button variant="outline" size="medium" label="Agora não" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

/** Ajuste em Configurações para ligar ou desligar as mensagens prontas. */
export function NoticesCard() {
  const [off, setOff] = useDeviceFlag(NOTICES_OFF_KEY);
  return (
    <Card>
      <Text style={styles.cardTitle}>Mensagens para clientes</Text>
      <Text style={styles.body}>
        {off
          ? 'Desligadas. O app não oferece mais a mensagem pronta depois de cada etapa.'
          : 'Ligadas. Ao agendar, confirmar, terminar, entregar ou receber, o app já mostra a mensagem pronta para mandar no WhatsApp.'}
      </Text>
      {off !== null ? (
        <Button size="medium" variant={off ? 'primary' : 'tint'} label={off ? 'Ligar mensagens' : 'Desligar'} onPress={() => setOff(!off)} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,11,15,0.45)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: 20,
    paddingBottom: 32,
    gap: 12,
    ...shadows.card,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.extrabold, fontSize: 17, color: colors.ink },
  sub: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  input: {
    minHeight: 140,
    maxHeight: 260,
    borderRadius: radius.input,
    borderWidth: 1.5,
    borderColor: colors.gray200,
    padding: 12,
    fontFamily: fonts.medium,
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
  },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
});
