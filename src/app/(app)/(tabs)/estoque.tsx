import { router } from 'expo-router';
import { ShoppingCart } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { CircleButton } from '@/components/DetailBar';
import { Fab } from '@/components/Fab';
import { Screen } from '@/components/Screen';
import { useOrg } from '@/features/organizations/useOrg';
import { ItemsList } from '@/features/products/ItemsList';
import { colors, fonts } from '@/theme/tokens';

export default function StockScreen() {
  const { config } = useOrg();
  return (
    <View style={styles.flex}>
      <Screen>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {config.tabLabels.estoque}
          </Text>
          <CircleButton label="Compras" icon={<ShoppingCart size={20} color={colors.ink} />} onPress={() => router.push('/compras')} />
        </View>
        <ItemsList />
        <View style={styles.fabSpace} />
      </Screen>
      <Fab label="Novo item" onPress={() => router.push('/itens/form')} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.extrabold, fontSize: 26, letterSpacing: -0.5, color: colors.ink },
  fabSpace: { height: 70 },
});
