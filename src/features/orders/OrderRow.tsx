import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { BusinessConfig } from '@/config/business';
import { formatWhen } from '@/lib/dates';
import { formatCents } from '@/lib/money';
import { colors, fonts } from '@/theme/tokens';

import type { OrderSummary } from './api';
import { isLate } from './logic';
import { QuickAdvance } from './QuickAdvance';
import { StatusChip } from './StatusChip';

function initials(name: string | null) {
  if (!name) return '#';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export function OrderRow({ order, config }: { order: OrderSummary; config: BusinessConfig }) {
  const late = isLate(order);
  const when = order.due_at ?? order.scheduled_for;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${config.orderNoun} ${order.number}, ${order.customer_name ?? 'sem cliente'}`}
      onPress={() => router.push({ pathname: '/pedidos/[id]', params: { id: order.id } })}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials(order.customer_name)}</Text>
      </View>
      <View style={styles.middle}>
        <Text style={styles.name} numberOfLines={1}>
          {order.customer_name ?? `Sem ${config.clientNoun}`}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          #{order.number}
          {order.items_summary ? ` · ${order.items_summary}` : ''}
        </Text>
        {when ? (
          <Text style={[styles.when, late && styles.whenLate]}>{formatWhen(new Date(when))}</Text>
        ) : null}
      </View>
      <View style={styles.right}>
        <Text style={styles.total}>{formatCents(order.total_cents)}</Text>
        <StatusChip status={order.status} label={order.no_show_at ? 'Faltou' : config.statusLabels[order.status]} late={late} />
        <QuickAdvance order={order} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, minHeight: 64 },
  pressed: { backgroundColor: colors.rowPressed },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.primaryText },
  middle: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  sub: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  when: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  whenLate: { color: colors.primaryText },
  right: { alignItems: 'flex-end', gap: 4 },
  total: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.ink },
});
