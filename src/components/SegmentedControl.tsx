import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius } from '@/theme/tokens';

export interface Segment<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Rolável quando há muitas opções (ex.: filtros de pedidos). */
  scrollable?: boolean;
  accessibilityLabel?: string;
}

export function SegmentedControl<T extends string>({ segments, value, onChange, scrollable, accessibilityLabel }: Props<T>) {
  const content = segments.map((s) => {
    const selected = s.value === value;
    return (
      <Pressable
        key={s.value}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        onPress={() => onChange(s.value)}
        style={[styles.option, !scrollable && styles.flex, selected && styles.selected]}
      >
        <Text style={[styles.label, { color: selected ? colors.primary : colors.gray500 }]} numberOfLines={1}>
          {s.label}
        </Text>
      </Pressable>
    );
  });

  return (
    <View style={styles.track} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel}>
      {scrollable ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {content}
        </ScrollView>
      ) : (
        <View style={styles.row}>{content}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { backgroundColor: colors.gray150, borderRadius: radius.segmented, padding: 4 },
  row: { flexDirection: 'row', gap: 4 },
  flex: { flex: 1 },
  option: {
    minHeight: 40,
    borderRadius: radius.segmentedOption,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: {
    backgroundColor: colors.surface,
    shadowColor: colors.ink,
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  label: { fontFamily: fonts.bold, fontSize: 13 },
});
