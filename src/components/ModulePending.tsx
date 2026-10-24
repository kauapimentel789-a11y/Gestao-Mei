// Tela de módulo que ainda não foi construído. Deixa claro que não funciona
// ainda, em vez de mostrar botões sem ação ou números de exemplo.
import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

import { Card } from './Card';
import { EmptyState } from './EmptyState';
import { Screen } from './Screen';

export function ModulePending({ title, icon, description }: { title: string; icon: LucideIcon; description: string }) {
  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      <Card>
        <EmptyState icon={icon} title="Em construção" description={description} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.extrabold, fontSize: 26, letterSpacing: -0.5, color: colors.ink },
});
