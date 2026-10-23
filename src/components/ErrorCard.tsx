import { StyleSheet, Text } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

import { Button } from './Button';
import { Card } from './Card';

export function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <Text style={styles.text}>{message}</Text>
      <Button label="Tentar de novo" onPress={onRetry} variant="tint" size="medium" />
    </Card>
  );
}

const styles = StyleSheet.create({
  text: { fontFamily: fonts.semibold, fontSize: 14, color: colors.gray600 },
});
