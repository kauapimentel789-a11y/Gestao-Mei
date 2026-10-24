import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

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
        <Text style={styles.title} accessibilityRole="header">
          {config.tabLabels.estoque}
        </Text>
        <ItemsList />
        <View style={styles.fabSpace} />
      </Screen>
      <Fab label="Novo item" onPress={() => router.push('/itens/form')} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: { fontFamily: fonts.extrabold, fontSize: 26, letterSpacing: -0.5, color: colors.ink },
  fabSpace: { height: 70 },
});
