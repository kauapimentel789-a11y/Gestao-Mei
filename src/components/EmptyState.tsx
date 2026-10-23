import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

import { Button } from './Button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <Icon size={32} color={colors.gray400} strokeWidth={2} />
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {action ? (
        <View style={styles.action}>
          <Button label={action.label} onPress={action.onPress} size="medium" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 12, gap: 8 },
  title: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink, textAlign: 'center' },
  description: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.gray500,
    textAlign: 'center',
    lineHeight: 19,
  },
  action: { alignSelf: 'stretch', marginTop: 8 },
});
