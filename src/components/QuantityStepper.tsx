import { Minus, Plus } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

interface Props {
  value: number;
  onChange: (value: number) => void;
  label: string;
  step?: number;
  min?: number;
}

export function QuantityStepper({ value, onChange, label, step = 1, min = 0 }: Props) {
  const dec = () => onChange(Math.max(min, Math.round((value - step) * 1000) / 1000));
  const inc = () => onChange(Math.round((value + step) * 1000) / 1000);
  return (
    <View style={styles.row} accessibilityLabel={`${label}: ${value}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Diminuir ${label}`}
        onPress={dec}
        disabled={value <= min}
        style={[styles.btn, styles.minus, value <= min && styles.disabled]}
        hitSlop={4}
      >
        <Minus size={16} color={colors.ink} />
      </Pressable>
      <Text style={styles.value}>{String(value).replace('.', ',')}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Aumentar ${label}`} onPress={inc} style={[styles.btn, styles.plus]} hitSlop={4}>
        <Plus size={16} color={colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  btn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  minus: { backgroundColor: colors.gray100 },
  plus: { backgroundColor: colors.primary },
  disabled: { opacity: 0.4 },
  value: { minWidth: 28, textAlign: 'center', fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
});
