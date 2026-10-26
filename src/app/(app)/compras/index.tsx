import { router } from 'expo-router';
import { ShoppingCart, Truck } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { CircleButton, DetailBar } from '@/components/DetailBar';
import { Fab } from '@/components/Fab';
import { QueryStates } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { useOrg } from '@/features/organizations/useOrg';
import { usePurchases } from '@/features/purchases/api';
import { PurchaseRow } from '@/features/purchases/PurchaseRow';
import { colors } from '@/theme/tokens';

export default function PurchasesScreen() {
  const { orgId } = useOrg();
  const list = usePurchases(orgId);

  return (
    <View style={styles.flex}>
      <Screen>
        <DetailBar
          title="Compras"
          right={<CircleButton label="Fornecedores" icon={<Truck size={20} color={colors.ink} />} onPress={() => router.push('/fornecedores')} />}
        />
        <Card style={styles.list}>
          <QueryStates
            query={list}
            isEmpty={list.data?.length === 0}
            empty={{
              icon: ShoppingCart,
              title: 'Nenhuma compra registrada',
              description: 'Registre compras de mercadoria e material: o estoque e as contas a pagar são atualizados juntos.',
              action: { label: 'Registrar compra', onPress: () => router.push('/compras/nova') },
            }}
          />
          {list.data?.map((p, i) => (
            <PurchaseRow key={p.id} purchase={p} first={i === 0} />
          ))}
        </Card>
        <View style={styles.fabSpace} />
      </Screen>
      <Fab label="Registrar compra" onPress={() => router.push('/compras/nova')} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingVertical: 4, gap: 0 },
  fabSpace: { height: 70 },
});
