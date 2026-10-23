import { router } from 'expo-router';
import { Settings } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { getBusinessConfig } from '@/config/business';
import { useAuth } from '@/features/auth/AuthProvider';
import { useActiveOrganization } from '@/features/organizations/ActiveOrganizationProvider';
import { formatLongToday, greeting } from '@/lib/dates';
import { colors, fonts, minTouch } from '@/theme/tokens';

const logo = require('../../../../assets/brand/logo-tile-dark.png');

export default function HomeScreen() {
  const { session } = useAuth();
  const { active } = useActiveOrganization();
  const org = active!.organization;
  const config = getBusinessConfig(org.business_type);
  const firstName = String(session?.user.user_metadata?.display_name ?? '').split(' ')[0];

  return (
    <Screen>
      <View style={styles.header}>
        <Image source={logo} style={styles.logo} accessibilityIgnoresInvertColors />
        <View style={styles.headerText}>
          <Text style={styles.date}>{formatLongToday()}</Text>
          <Text style={styles.greeting} accessibilityRole="header">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Configurações"
          onPress={() => router.push('/configuracoes')}
          style={styles.circle}
        >
          <Settings size={20} color={colors.ink} />
        </Pressable>
      </View>

      <View style={styles.hero}>
        <Text style={styles.kicker}>{config.label.toUpperCase()}</Text>
        <Text style={styles.heroTitle}>{org.name}</Text>
        <Text style={styles.heroText}>
          Sua empresa está criada. O resumo do dia (pedidos, tarefas, estoque baixo e financeiro) aparece aqui conforme
          os módulos forem liberados.
        </Text>
      </View>

      <Card>
        <Text style={styles.cardTitle}>Próximos módulos</Text>
        {config.tabs
          .filter((t) => t !== 'inicio')
          .map((t) => (
            <View key={t} style={styles.row}>
              <View style={styles.dot} />
              <Text style={styles.rowText}>{config.tabLabels[t]}</Text>
              <Text style={styles.rowStatus}>em construção</Text>
            </View>
          ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 44, height: 44, borderRadius: 14 },
  headerText: { flex: 1 },
  date: { fontFamily: fonts.semibold, fontSize: 12, color: colors.gray500 },
  greeting: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.ink },
  circle: {
    width: minTouch,
    height: minTouch,
    borderRadius: minTouch / 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: { backgroundColor: colors.graphite, borderRadius: 26, padding: 20, gap: 6, overflow: 'hidden' },
  kicker: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 2.6, color: colors.primary },
  heroTitle: { fontFamily: fonts.extrabold, fontSize: 26, letterSpacing: -0.5, color: colors.white },
  heroText: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 19, color: colors.gray300 },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primarySoft },
  rowText: { flex: 1, fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  rowStatus: { fontFamily: fonts.semibold, fontSize: 12, color: colors.gray500 },
});
