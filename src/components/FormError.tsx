import { StyleSheet, Text } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <Text style={styles.text} accessibilityLiveRegion="assertive" accessibilityRole="alert">
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { fontFamily: fonts.bold, fontSize: 13, color: colors.primaryText },
});
