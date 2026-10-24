import { router } from 'expo-router';
import { Check, ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { TextLink } from '@/components/TextLink';
import type { BusinessConfig } from '@/config/business';
import { colors, fonts } from '@/theme/tokens';

import { setupSteps, type SetupStatus } from './logic';

/** "Primeiros passos": o próximo passo em destaque e os outros embaixo. */
export function SetupCard({ config, status, onHide }: { config: BusinessConfig; status: SetupStatus; onHide: () => void }) {
  const steps = setupSteps(config, status);
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const next = steps.find((s) => !s.done)!;

  return (
    <Card>
      <View style={styles.head}>
        <Text style={styles.title}>Primeiros passos</Text>
        <Text style={styles.count}>
          {done} de {steps.length}
        </Text>
      </View>
      <View style={styles.bar} accessibilityLabel={`${done} de ${steps.length} passos feitos`}>
        <View style={[styles.fill, { width: `${(done / steps.length) * 100}%` }]} />
      </View>
      {steps.map((s) => {
        const isNext = s.key === next.key;
        return (
          <Pressable
            key={s.key}
            accessibilityRole="button"
            accessibilityState={{ checked: s.done }}
            accessibilityLabel={`${s.title}${s.done ? ', feito' : ''}`}
            onPress={() => router.push(s.route as never)}
            style={({ pressed }) => [styles.row, isNext && styles.rowNext, pressed && styles.pressed]}
          >
            <View style={[styles.dot, s.done && styles.dotDone, isNext && styles.dotNext]}>
              {s.done ? <Check size={14} color={colors.white} strokeWidth={3} /> : null}
            </View>
            <View style={styles.text}>
              <Text style={[styles.stepTitle, s.done && styles.stepDone]}>{s.title}</Text>
              {isNext ? <Text style={styles.stepBody}>{s.description}</Text> : null}
            </View>
            {!s.done ? <ChevronRight size={18} color={isNext ? colors.primaryText : colors.gray400} /> : null}
          </Pressable>
        );
      })}
      <TextLink label="Esconder primeiros passos" onPress={onHide} />
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  count: { fontFamily: fonts.bold, fontSize: 13, color: colors.gray500 },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.primaryTint, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 14 },
  rowNext: { backgroundColor: colors.primaryTint, paddingVertical: 12 },
  pressed: { backgroundColor: colors.rowPressed },
  dot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.gray300, alignItems: 'center', justifyContent: 'center' },
  dotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotNext: { borderColor: colors.primary },
  text: { flex: 1, gap: 2 },
  stepTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  stepDone: { color: colors.gray500, textDecorationLine: 'line-through' },
  stepBody: { fontFamily: fonts.medium, fontSize: 13, color: colors.gray600, lineHeight: 18 },
});
