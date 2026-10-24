import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

export function NavRow({ label, onPress, first }: { label: string; onPress: () => void; first?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, !first && styles.divider, pressed && styles.pressed]}>
      <Text style={styles.label}>{label}</Text>
      <ChevronRight size={18} color={colors.gray400} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  pressed: { backgroundColor: colors.rowPressed },
  label: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
});
