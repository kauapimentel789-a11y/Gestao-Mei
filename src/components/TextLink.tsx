import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts, minTouch } from '@/theme/tokens';

export function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.hit} hitSlop={8}>
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: { minHeight: minTouch, justifyContent: 'center', alignSelf: 'center' },
  text: { fontFamily: fonts.bold, fontSize: 14, color: colors.primaryText },
});
