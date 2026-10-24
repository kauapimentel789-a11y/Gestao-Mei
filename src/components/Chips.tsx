// Seleção única em chips (ex.: canal de origem, tipo de item).
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius } from '@/theme/tokens';

interface Props<T extends string> {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
}

export function Chips<T extends string>({ options, value, onChange, accessibilityLabel }: Props<T>) {
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(o.value)}
            style={[styles.chip, selected && styles.selected]}
            hitSlop={4}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { backgroundColor: colors.primaryTint },
  label: { fontFamily: fonts.bold, fontSize: 13, color: colors.gray600 },
  labelSelected: { color: colors.primaryText },
});
