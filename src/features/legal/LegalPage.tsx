import { ChevronLeft } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { goBack } from '@/lib/navigation';
import { colors, fonts, minTouch } from '@/theme/tokens';

import type { LegalDocument } from './texts';

/** Termos e política: abrem com ou sem login (links no cadastro e em Configurações). */
export function LegalPage({ doc }: { doc: LegalDocument }) {
  return (
    <Screen>
      <View style={styles.bar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => goBack()} style={styles.circle}>
          <ChevronLeft size={20} color={colors.ink} />
        </Pressable>
      </View>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">
          {doc.title}
        </Text>
        <Text style={styles.updated}>Atualizada em {doc.updatedAt}</Text>
        <Text style={styles.body}>{doc.intro}</Text>
      </View>
      {doc.sections.map((s) => (
        <Card key={s.title}>
          <Text style={styles.section} accessibilityRole="header">
            {s.title}
          </Text>
          {s.paragraphs.map((p) => (
            <Text key={p} style={styles.body}>
              {p}
            </Text>
          ))}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row' },
  circle: {
    width: minTouch,
    height: minTouch,
    borderRadius: minTouch / 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  head: { gap: 6 },
  title: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.ink, letterSpacing: -0.4 },
  updated: { fontFamily: fonts.semibold, fontSize: 12, color: colors.gray500 },
  section: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 21 },
});
