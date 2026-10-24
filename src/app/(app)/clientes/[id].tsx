import { router, useLocalSearchParams } from 'expo-router';
import { MessageCircle, Pencil, ReceiptText } from 'lucide-react-native';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CircleButton, DetailBar } from '@/components/DetailBar';
import { ErrorCard } from '@/components/ErrorCard';
import { QueryStates, Skeleton } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { useCustomer } from '@/features/customers/api';
import { useCustomerOrders } from '@/features/orders/api';
import { OrderRow } from '@/features/orders/OrderRow';
import { useOrg } from '@/features/organizations/useOrg';
import { friendlyError } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { whatsappUrl } from '@/lib/whatsapp';
import { colors, fonts } from '@/theme/tokens';

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orgId, config } = useOrg();
  const customer = useCustomer(orgId, id);
  const orders = useCustomerOrders(orgId, id);

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
            label="Editar cliente"
            icon={<Pencil size={18} color={colors.ink} />}
            onPress={() => router.push({ pathname: '/clientes/form', params: { id: c.id } })}
          />
        }
      />
      <Card>
        {c.phone ? <Text style={styles.body}>{c.phone}</Text> : <Text style={styles.muted}>Sem telefone</Text>}
        {c.notes ? <Text style={styles.body}>{c.notes}</Text> : null}
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
        <Button
          size="medium"
          label={`Novo ${config.orderNoun}`}
          onPress={() => router.push({ pathname: '/pedidos/novo', params: { clienteId: c.id } })}
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

const styles = StyleSheet.create({
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600 },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  metrics: { flexDirection: 'row', gap: 12 },
  metric: { flex: 1, backgroundColor: colors.bg, borderRadius: 16, padding: 12, gap: 2 },
  metricValue: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  list: { gap: 0 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
});
