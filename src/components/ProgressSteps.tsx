// Indicador de progresso em segmentos (mesmo estilo do stepper de status do pedido).
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme/tokens';

export function ProgressSteps({ total, current }: { total: number; current: number }) {
  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: current + 1, text: `Passo ${current + 1} de ${total}` }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.bar, { backgroundColor: i <= current ? colors.primary : colors.gray200 }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  bar: { flex: 1, height: 6, borderRadius: 3 },
});
