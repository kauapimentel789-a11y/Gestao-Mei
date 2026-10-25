// Barra das telas de detalhe: voltar, título centralizado e ação opcional.
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, minTouch } from '@/theme/tokens';
import { goBack } from '@/lib/navigation';

export function DetailBar({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.bar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => goBack()} style={styles.circle}>
        <ChevronLeft size={20} color={colors.ink} />
      </Pressable>
      <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.side}>{right}</View>
    </View>
  );
}

export function CircleButton({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.circle}>
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, textAlign: 'center', fontFamily: fonts.extrabold, fontSize: 17, color: colors.ink },
  side: { width: minTouch, alignItems: 'flex-end' },
  circle: {
    width: minTouch,
    height: minTouch,
    borderRadius: minTouch / 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.ink,
    shadowOpacity: 0.06,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
});
