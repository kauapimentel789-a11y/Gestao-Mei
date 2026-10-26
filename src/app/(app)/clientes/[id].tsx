import { router, useLocalSearchParams } from 'expo-router';
import { Cake, MapPin, MessageCircle, NotebookPen, Pencil, ReceiptText } from 'lucide-react-native';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CircleButton, DetailBar } from '@/components/DetailBar';
import { ErrorCard } from '@/components/ErrorCard';
import { QueryStates, Skeleton } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { useCustomerAttendance, useCustomerNotes } from '@/features/agenda/api';
import { NoteItem } from '@/features/agenda/ServiceNotes';
import { type Customer, useCustomer } from '@/features/customers/api';
import { birthdayText } from '@/features/messages/templates';
import { useCustomerOrders } from '@/features/orders/api';
import { OrderRow } from '@/features/orders/OrderRow';
import { useOrg } from '@/features/organizations/useOrg';
import { ageOn, birthdayWhen, daysUntilBirthday, formatBirthdayLong } from '@/lib/birthday';
import { friendlyError } from '@/lib/errors';
import { mapsLink } from '@/lib/maps';
import { formatCents } from '@/lib/money';
import { whatsappUrl } from '@/lib/whatsapp';
import { colors, fonts } from '@/theme/tokens';

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orgId, config } = useOrg();
  const customer = useCustomer(orgId, id);
  const orders = useCustomerOrders(orgId, id);
  const appointments = config.profile === 'appointments';

  if (customer.isPending) {
    return (
      <Screen>
        <DetailBar title="" />
        <Skeleton />
      </Screen>
    );
  }
  if (customer.error || !customer.data) {
    return (
      <Screen>
        <DetailBar title="" />
        <ErrorCard message={friendlyError(customer.error)} onRetry={() => customer.refetch()} />
      </Screen>
    );
  }

  const c = customer.data;
  const wa = c.phone_digits ? whatsappUrl(c.phone_digits) : null;
  const valid = (orders.data ?? []).filter((o) => o.status !== 'cancelled');
  const total = valid.reduce((s, o) => s + o.total_cents, 0);

  return (
    <Screen>
      <DetailBar
        title={c.name}
        right={
          <CircleButton
            label={`Editar ${config.clientNoun}`}
            icon={<Pencil size={18} color={colors.ink} />}
            onPress={() => router.push({ pathname: '/clientes/form', params: { id: c.id } })}
          />
        }
      />
      <Card>
        {c.phone ? <Text style={styles.body}>{c.phone}</Text> : <Text style={styles.muted}>Sem telefone</Text>}
        {c.birth_day && c.birth_month ? <BirthdayLine customer={c} /> : null}
        {c.address ? (
          <Pressable accessibilityRole="link" accessibilityHint="Abre o mapa" onPress={() => Linking.openURL(mapsLink(c.address!))} style={styles.infoRow}>
            <MapPin size={16} color={colors.gray500} />
            <Text style={[styles.body, styles.flex]}>{c.address}</Text>
            <Text style={styles.link}>Mapa</Text>
          </Pressable>
        ) : null}
        {c.notes ? <Text style={styles.body}>{c.notes}</Text> : null}
        {appointments ? (
          <Attendance customerId={c.id} total={total} />
        ) : (
          <View style={styles.metrics}>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{valid.length}</Text>
              <Text style={styles.muted}>{config.tabLabels.pedidos.toLowerCase()}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{formatCents(total)}</Text>
              <Text style={styles.muted}>em {config.tabLabels.pedidos.toLowerCase()}</Text>
            </View>
          </View>
        )}
        <Button
          size="medium"
          label={`Novo ${config.orderNoun}`}
          onPress={() =>
            router.push(appointments ? { pathname: '/horarios/novo', params: { clienteId: c.id } } : { pathname: '/pedidos/novo', params: { clienteId: c.id } })
          }
        />
        {wa ? (
          <Button
            size="medium"
            variant="tint"
            label="WhatsApp"
            trailing={<MessageCircle size={18} color={colors.primaryText} />}
            onPress={() => Linking.openURL(wa)}
          />
        ) : null}
      </Card>
      {appointments ? <CustomerNotes customerId={c.id} numbers={new Map((orders.data ?? []).map((o) => [o.id, o.number]))} /> : null}
      <Card style={styles.list}>
        <Text style={styles.cardTitle}>Histórico</Text>
        <QueryStates query={orders} isEmpty={orders.data?.length === 0} empty={{ icon: ReceiptText, title: 'Nenhum registro ainda.' }} />
        {orders.data?.map((o, i) => (
          <View key={o.id} style={i > 0 && styles.divider}>
            <OrderRow order={o} config={config} />
          </View>
        ))}
      </Card>
    </Screen>
  );
}

/** Aniversário: data, idade e, quando está perto, a mensagem pronta no WhatsApp. */
function BirthdayLine({ customer: c }: { customer: Customer }) {
  const { org, config } = useOrg();
  const days = daysUntilBirthday(c.birth_day!, c.birth_month!);
  const age = c.birth_year ? ageOn({ day: c.birth_day!, month: c.birth_month!, year: c.birth_year }) : null;
  const soon = days <= 7;
  const wa = soon && c.phone_digits
    ? whatsappUrl(c.phone_digits, birthdayText({ profile: config.profile, business: org.name, customerName: c.name, daysUntil: days }))
    : null;
  return (
    <View style={[styles.birthday, soon && styles.birthdaySoon]}>
      <View style={styles.infoRow}>
        <Cake size={16} color={soon ? colors.primaryText : colors.gray500} />
        <Text style={[styles.body, styles.flex, soon && styles.birthdayText]}>
          Aniversário: {formatBirthdayLong(c.birth_day!, c.birth_month!)}
          {age !== null ? ` · ${age} anos` : ''}
        </Text>
        {days <= 30 ? <Text style={styles.link}>{birthdayWhen(days)}</Text> : null}
      </View>
      {wa ? (
        <Button
          size="medium"
          variant="tint"
          label={days === 0 ? 'Mandar parabéns' : 'Mandar mensagem de aniversário'}
          trailing={<MessageCircle size={18} color={colors.primaryText} />}
          onPress={() => Linking.openURL(wa)}
        />
      ) : null}
    </View>
  );
}

function Attendance({ customerId, total }: { customerId: string; total: number }) {
  const { orgId } = useOrg();
  const stats = useCustomerAttendance(orgId, customerId);
  const s = stats.data;
  return (
    <View style={styles.metrics}>
      <View style={styles.metric}>
        <Text style={styles.metricValue}>{s ? s.attended : '–'}</Text>
        <Text style={styles.muted}>atendidos</Text>
      </View>
      <View style={styles.metric}>
        <Text style={styles.metricValue}>{s ? s.noShows : '–'}</Text>
        <Text style={styles.muted}>{s?.noShows === 1 ? 'falta' : 'faltas'}</Text>
      </View>
      <View style={styles.metric}>
        <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>
          {formatCents(total)}
        </Text>
        <Text style={styles.muted}>no total</Text>
      </View>
    </View>
  );
}

/** Ficha: anotações de todos os atendimentos, da mais nova para a mais antiga. */
function CustomerNotes({ customerId, numbers }: { customerId: string; numbers: Map<string, number> }) {
  const { orgId, config } = useOrg();
  const notes = useCustomerNotes(orgId, customerId);
  return (
    <Card style={styles.list}>
      <Text style={styles.cardTitle}>Ficha</Text>
      <QueryStates
        query={notes}
        isEmpty={notes.data?.length === 0}
        empty={{ icon: NotebookPen, title: 'Nenhuma anotação ainda.', description: `As anotações feitas em cada ${config.orderNoun} aparecem aqui.` }}
      />
      {notes.data?.map((n) => (
        <NoteItem key={n.id} note={n} label={numbers.has(n.order_id) ? `${config.orderNoun} #${numbers.get(n.order_id)}` : undefined} />
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600 },
  flex: { flex: 1 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  link: { fontFamily: fonts.bold, fontSize: 13, color: colors.primaryText },
  birthday: { gap: 8 },
  birthdaySoon: { backgroundColor: colors.primaryTint, borderRadius: 14, padding: 10 },
  birthdayText: { fontFamily: fonts.bold, color: colors.primaryText },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  metrics: { flexDirection: 'row', gap: 12 },
  metric: { flex: 1, backgroundColor: colors.bg, borderRadius: 16, padding: 12, gap: 2 },
  metricValue: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  list: { gap: 0 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
});
