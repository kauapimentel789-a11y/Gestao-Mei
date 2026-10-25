// Linha da agenda: horário, cliente, serviço e situação. Em atendimentos,
// mostra o atalho de lembrete pelo WhatsApp.
import { router } from 'expo-router';
import { AlertTriangle, BellRing, Check } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StatusChip } from '@/features/orders/StatusChip';
import { useOrg } from '@/features/organizations/useOrg';
import { formatTimeBR } from '@/lib/dates';
import { colors, fonts, radius } from '@/theme/tokens';

import type { AgendaItem } from './api';
import { canRemind, durationLabel } from './logic';
import { useReminder } from './useReminder';

export function AgendaRow({ item: o, first, conflict }: { item: AgendaItem; first: boolean; conflict?: boolean }) {
  const { config } = useOrg();
  const reminder = useReminder();
  const start = o.scheduled_for ? new Date(o.scheduled_for) : null;
  const appointments = config.profile === 'appointments';
  const showReminder = appointments && canRemind(o) && reminder.urlFor(o) !== null;
  const label = o.no_show_at ? 'Faltou' : config.statusLabels[o.status];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/pedidos/[id]', params: { id: o.id } })}
      style={({ pressed }) => [styles.row, !first && styles.divider, pressed && styles.pressed]}
    >
      <View style={styles.time}>
        <Text style={styles.timeText}>{start ? formatTimeBR(start) : `#${o.number}`}</Text>
        {start ? <Text style={styles.muted}>{durationLabel(o.scheduled_minutes)}</Text> : null}
      </View>
      <View style={styles.flex}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {o.customer_name ?? `Sem ${config.clientNoun}`}
          {start && !appointments ? ` · #${o.number}` : ''}
        </Text>
        <Text style={styles.muted} numberOfLines={1}>
          {[o.problem_description || o.items_summary?.replace(/^1× /, ''), o.professional_name ? `com ${o.professional_name}` : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {conflict ? (
          <View style={styles.inline}>
            <AlertTriangle size={12} color={colors.primaryText} />
            <Text style={styles.conflictText}>Horário em conflito com outro {config.orderNoun}</Text>
          </View>
        ) : null}
        {appointments && o.reminder_sent_at && o.status !== 'cancelled' && o.status !== 'delivered' ? (
          <View style={styles.inline}>
            <Check size={12} color={colors.gray500} />
            <Text style={styles.muted}>Lembrete enviado</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.right}>
        <StatusChip status={o.status} label={label} />
        {showReminder && !o.reminder_sent_at ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Enviar lembrete para ${o.customer_name ?? config.clientNoun}`}
            onPress={() => reminder.send(o)}
            hitSlop={6}
            style={styles.remind}
          >
            <BellRing size={14} color={colors.primaryText} />
            <Text style={styles.remindText}>Lembrar</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  pressed: { backgroundColor: colors.rowPressed },
  time: { width: 52 },
  timeText: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.ink },
  rowTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  conflictText: { fontFamily: fonts.bold, fontSize: 11, color: colors.primaryText },
  right: { alignItems: 'flex-end', gap: 6 },
  remind: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
  },
  remindText: { fontFamily: fonts.bold, fontSize: 11, color: colors.primaryText },
});
