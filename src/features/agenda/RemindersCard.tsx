// Lembretes de amanhã em sequência: um toque abre o WhatsApp do próximo
// cliente com a mensagem pronta e marca como enviado. Sem custo: o envio é
// feito pelo WhatsApp do próprio aparelho.
import { BellRing, CheckCircle2 } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useOrg } from '@/features/organizations/useOrg';
import { formatTimeBR } from '@/lib/dates';
import { colors, fonts } from '@/theme/tokens';

import { useAgenda } from './api';
import { pendingReminders } from './logic';
import { useReminder } from './useReminder';

export function RemindersCard() {
  const { orgId, config } = useOrg();
  const reminder = useReminder();
  const [range] = useState(() => {
    const n = new Date();
    const start = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1);
    return { from: start.toISOString(), to: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1).toISOString() };
  });
  const tomorrow = useAgenda(orgId, range.from, range.to, config.profile === 'appointments');
  const items = tomorrow.data ?? [];
  if (config.profile !== 'appointments' || items.length === 0) return null;

  const pending = pendingReminders(items, (i) => reminder.urlFor(i) !== null);
  const next = pending[0];
  const done = items.length - pending.length;

  return (
    <Card>
      <View style={styles.head}>
        <BellRing size={18} color={colors.primaryText} />
        <Text style={styles.title}>Lembretes de amanhã</Text>
        <Text style={styles.count}>
          {done} de {items.length}
        </Text>
      </View>
      {next ? (
        <>
          <Text style={styles.body}>
            Próximo: {next.customer_name ?? config.clientNoun} às {formatTimeBR(new Date(next.scheduled_for!))}. O WhatsApp abre com a mensagem
            pronta; é só tocar em enviar e voltar aqui para o próximo.
          </Text>
          <Button
            size="medium"
            label={`Lembrar ${next.customer_name?.split(' ')[0] ?? config.clientNoun}${pending.length > 1 ? ` (faltam ${pending.length})` : ''}`}
            loading={reminder.sending}
            onPress={() => reminder.send(next)}
          />
        </>
      ) : (
        <View style={styles.done}>
          <CheckCircle2 size={16} color={colors.success} />
          <Text style={styles.body}>
            {done === items.length ? 'Todos os lembretes de amanhã foram enviados.' : `Lembretes enviados. Quem não tem WhatsApp no cadastro ficou de fora.`}
          </Text>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  count: { fontFamily: fonts.bold, fontSize: 13, color: colors.gray500 },
  body: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.gray600, lineHeight: 19 },
  done: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
