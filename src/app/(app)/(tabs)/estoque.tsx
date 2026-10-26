import { router } from 'expo-router';
import { ShoppingCart } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CircleButton } from '@/components/DetailBar';
import { Fab } from '@/components/Fab';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useOrg } from '@/features/organizations/useOrg';
import { ItemsList } from '@/features/products/ItemsList';
import { SupplierList } from '@/features/suppliers/SupplierList';
import { colors, fonts } from '@/theme/tokens';

type Section = 'itens' | 'fornecedores';

export default function StockScreen() {
  const { config } = useOrg();
  const [section, setSection] = useState<Section>('itens');
  return (
    <View style={styles.flex}>
      <Screen>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {config.tabLabels.estoque}
          </Text>
          <CircleButton label="Compras" icon={<ShoppingCart size={20} color={colors.ink} />} onPress={() => router.push('/compras')} />
        </View>
        <SegmentedControl
          accessibilityLabel="Seção do estoque"
          segments={[
            { value: 'itens', label: 'Itens' },
            { value: 'fornecedores', label: 'Fornecedores' },
          ]}
          value={section}
          onChange={setSection}
        />
        {section === 'itens' ? <ItemsList /> : <SupplierList />}
        <View style={styles.fabSpace} />
      </Screen>
      {section === 'itens' ? (
        <Fab label="Novo item" onPress={() => router.push('/itens/form')} />
      ) : (
        <Fab label="Novo fornecedor" onPress={() => router.push('/fornecedores/form')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.extrabold, fontSize: 26, letterSpacing: -0.5, color: colors.ink },
  fabSpace: { height: 70 },
});
