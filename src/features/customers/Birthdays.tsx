// Aniversários dos clientes: linha da lista e cartão da Início. Em confeitaria
// e salgados a procura sobe nos aniversários, então vale lembrar antes.
import { router } from 'expo-router';
import { Cake, MessageCircle } from 'lucide-react-native';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { birthdayText } from '@/features/messages/templates';
import { useOrg } from '@/features/organizations/useOrg';
import { birthdayWhen, formatBirthdayLong } from '@/lib/birthday';
import { whatsappUrl } from '@/lib/whatsapp';
import { colors, fonts, minTouch } from '@/theme/tokens';

import { type UpcomingBirthday, useUpcomingBirthdays } from './api';

export function BirthdayRow({ item, first }: { item: UpcomingBirthday; first?: boolean }) {
  const { org, config } = useOrg();
  const wa = item.phone_digits
    ? whatsappUrl(item.phone_digits, birthdayText({ profile: config.profile, business: org.name, customerName: item.name, daysUntil: item.days_until }))
    : null;
  const today = item.days_until === 0;
  return (
    <View style={[styles.row, !first && styles.divider]}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/clientes/[id]', params: { id: item.id } })}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
      >
        <View style={[styles.icon, today && styles.iconToday]}>
          <Cake size={18} color={today ? colors.white : colors.primaryText} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {formatBirthdayLong(item.birth_day, item.birth_month)}
            {item.turning !== null ? ` · faz ${item.turning} anos` : ''}
          </Text>
          {item.address ? (
            <Text style={styles.sub} numberOfLines={1}>
              {item.address}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.when, today && styles.whenToday]}>{birthdayWhen(item.days_until)}</Text>
      </Pressable>
      {wa ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Mandar mensagem de aniversário para ${item.name}`}
          onPress={() => Linking.openURL(wa)}
          style={styles.wa}
        >
          <MessageCircle size={20} color={colors.primaryText} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Cartão da Início: aniversários da semana. Some quando não há nenhum. */
export function BirthdaysCard() {
  const { orgId } = useOrg();
  const list = useUpcomingBirthdays(orgId, 7);
  const items = list.data ?? [];
  if (items.length === 0) return null;
  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Aniversários da semana</Text>
      {items.slice(0, 4).map((b, i) => (
        <BirthdayRow key={b.id} item={b} first={i === 0} />
      ))}
      <Pressable accessibilityRole="link" onPress={() => router.push('/clientes/aniversarios')} style={styles.more}>
        <Text style={styles.moreText}>{items.length > 4 ? `Ver todos (${items.length})` : 'Ver próximos aniversários'}</Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 0 },
  title: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8 },
  pressed: { backgroundColor: colors.rowPressed },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  iconToday: { backgroundColor: colors.primary },
  flex: { flex: 1 },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  sub: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  when: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray600 },
  whenToday: { color: colors.primaryText },
  wa: { width: minTouch, height: minTouch, borderRadius: minTouch / 2, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  more: { minHeight: minTouch, justifyContent: 'center', paddingTop: 4 },
  moreText: { fontFamily: fonts.bold, fontSize: 14, color: colors.primaryText },
});
