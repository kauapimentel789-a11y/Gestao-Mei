// Atendimento com hora marcada: lembrete pelo WhatsApp e falta.
import { BellRing, UserX } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useToast } from '@/components/Toast';
import { useOrg } from '@/features/organizations/useOrg';
import { formatWhen } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { colors, fonts, radius, shadows } from '@/theme/tokens';

import { useMarkNoShow } from './api';
import { canMarkNoShow, canRemind } from './logic';
import { type ReminderTarget, useReminder } from './useReminder';

interface Props {
  order: ReminderTarget & { number: number; status: string; reminder_sent_at: string | null };
}

export function AppointmentActions({ order: o }: Props) {
  const { orgId, config } = useOrg();
  const reminder = useReminder();
  const noShow = useMarkNoShow(orgId);
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const remind = canRemind(o);
  const absent = canMarkNoShow(o);
  if (!remind && !absent) return null;
  const url = reminder.urlFor(o);

  return (
    <Card>
      {remind ? (
        <>
          <Text style={styles.cardTitle}>Lembrete</Text>
          <Text style={styles.body}>
            {o.reminder_sent_at
              ? `Enviado ${formatWhen(new Date(o.reminder_sent_at)).toLowerCase()}.`
              : url
                ? `Abre o WhatsApp com a mensagem pronta para o ${config.clientNoun} confirmar.`
                : `Cadastre o WhatsApp do ${config.clientNoun} para enviar lembrete.`}
          </Text>
          {url ? (
            <Button
              variant="tint"
              size="medium"
              label={o.reminder_sent_at ? 'Enviar de novo' : 'Enviar lembrete'}
              trailing={<BellRing size={18} color={colors.primaryText} />}
              loading={reminder.sending}
              onPress={() => reminder.send(o)}
            />
          ) : null}
        </>
      ) : null}
      {absent ? (
        <Button
          variant="outline"
          size="medium"
          label="Não compareceu"
          trailing={<UserX size={18} color={colors.ink} />}
          onPress={() => setConfirm(true)}
        />
      ) : null}

      <Modal visible={confirm} transparent animationType="fade" onRequestClose={() => setConfirm(false)}>
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Marcar falta?</Text>
            <Text style={styles.body}>
              O {config.orderNoun} #{o.number} fica no histórico como falta e não pode mais ser atendido. Para remarcar, crie um novo horário.
            </Text>
            <Button variant="ink" size="medium" label="Voltar" onPress={() => setConfirm(false)} />
            <Button
              size="medium"
              label="Marcar falta"
              loading={noShow.isPending}
              onPress={async () => {
                try {
                  await noShow.mutateAsync(o.id);
                  setConfirm(false);
                  toast('Falta registrada');
                } catch (e) {
                  setConfirm(false);
                  toast(friendlyError(e));
                }
              }}
            />
          </View>
        </View>
      </Modal>
    </Card>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,11,15,0.45)', justifyContent: 'center', padding: 20 },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 20, gap: 12, ...shadows.card },
  dialogTitle: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.ink },
});
