import { router } from 'expo-router';
import { FileText, ReceiptText } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { CircleButton } from '@/components/DetailBar';
import { Fab } from '@/components/Fab';
import { QueryStates } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { SearchField } from '@/components/SearchField';
import { SegmentedControl } from '@/components/SegmentedControl';
import { type OrderFilter, useOrderCounts, useOrders } from '@/features/orders/api';
import { OrderRow } from '@/features/orders/OrderRow';
import { useOrg } from '@/features/organizations/useOrg';
import { useDebounced } from '@/lib/useDebounced';
import { colors, fonts } from '@/theme/tokens';

export default function OrdersScreen() {
  const { orgId, config } = useOrg();
  const [filter, setFilter] = useState<OrderFilter>('open');
  const [search, setSearch] = useState('');
  const term = useDebounced(search, 300);
  const orders = useOrders(orgId, filter, term);
  const counts = useOrderCounts(orgId);
  const c = counts.data;
  const plural = config.tabLabels.pedidos.toLowerCase();

  return (
    <View style={styles.flex}>
      <Screen>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {config.tabLabels.pedidos}
          </Text>
          <CircleButton label="Orçamentos" icon={<FileText size={20} color={colors.ink} />} onPress={() => router.push('/orcamentos')} />
        </View>
        <SearchField value={search} onChangeText={setSearch} placeholder="Buscar por nº ou cliente" />
        <SegmentedControl
          scrollable
          accessibilityLabel="Filtro"
          value={filter}
          onChange={setFilter}
          segments={[
            { value: 'open', label: c ? `Abertos ${c.open}` : 'Abertos' },
            { value: 'late', label: c ? `Atrasados ${c.late}` : 'Atrasados' },
            { value: 'today', label: c ? `Hoje ${c.today}` : 'Hoje' },
            { value: 'done', label: 'Finalizados' },
          ]}
        />
        <Card style={styles.list}>
          <QueryStates
            query={orders}
            isEmpty={orders.data?.length === 0}
            empty={
              term || filter !== 'open'
                ? { icon: ReceiptText, title: 'Nada por aqui.' }
                : {
                    icon: ReceiptText,
                    title: `Nenhum ${config.orderNoun} ainda`,
                    description: `Registre seus ${plural} para acompanhar prazos e status.`,
                    action: { label: `Criar primeiro ${config.orderNoun}`, onPress: () => router.push('/pedidos/novo') },
                  }
            }
          />
          {orders.data?.map((o, i) => (
            <View key={o.id} style={i > 0 && styles.divider}>
              <OrderRow order={o} config={config} />
            </View>
          ))}
        </Card>
        <View style={styles.fabSpace} />
      </Screen>
      <Fab label={`Novo ${config.orderNoun}`} onPress={() => router.push('/pedidos/novo')} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flex: { flex: 1 },
  title: { fontFamily: fonts.extrabold, fontSize: 26, letterSpacing: -0.5, color: colors.ink },
  list: { paddingVertical: 4, gap: 0 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  fabSpace: { height: 70 },
});
