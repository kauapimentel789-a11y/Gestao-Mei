// Modo de trabalho de uma empresa de serviços: ordens de serviço ou
// atendimentos com hora marcada (com a área, que muda os nomes do app).
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { PRACTICE_AREA_INFO, PRACTICE_AREAS, type PracticeArea } from '@/config/business';
import { friendlyError } from '@/lib/errors';
import { colors, fonts, radius, shadows } from '@/theme/tokens';

interface Props {
  visible: boolean;
  current: PracticeArea | null;
  loading: boolean;
  onClose: () => void;
  onSave: (area: PracticeArea | null) => Promise<void>;
}

const OPTIONS: { value: PracticeArea | null; label: string; examples: string }[] = [
  { value: null, label: 'Ordens de serviço', examples: 'Manutenção, reparos, assistência técnica' },
  ...PRACTICE_AREAS.map((a) => ({ value: a, label: `Hora marcada · ${PRACTICE_AREA_INFO[a].label}`, examples: PRACTICE_AREA_INFO[a].examples })),
];

export function PracticeAreaDialog({ visible, current, loading, onClose, onSave }: Props) {
  const [value, setValue] = useState<PracticeArea | null>(current);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.title}>Como você trabalha?</Text>
          <View accessibilityRole="radiogroup" style={styles.options}>
            {OPTIONS.map((o) => {
              const selected = o.value === value;
              return (
                <Pressable
                  key={o.value ?? 'os'}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setValue(o.value)}
                  style={[styles.option, selected && styles.optionSelected]}
                >
                  <View style={styles.flex}>
                    <Text style={styles.optionTitle}>{o.label}</Text>
                    <Text style={styles.optionDesc}>{o.examples}</Text>
                  </View>
                  {selected ? <Check size={18} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button variant="ink" size="medium" label="Voltar" onPress={onClose} />
          <Button
            size="medium"
            label="Salvar"
            loading={loading}
            onPress={async () => {
              setError(null);
              try {
                await onSave(value);
              } catch (e) {
                setError(friendlyError(e));
              }
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,11,15,0.45)', justifyContent: 'center', padding: 20 },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 20, gap: 12, ...shadows.card },
  title: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.ink },
  options: { gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    minHeight: 56,
    borderRadius: radius.input,
    borderWidth: 1.5,
    borderColor: colors.gray200,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  optionTitle: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.ink },
  optionDesc: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray600 },
  error: { fontFamily: fonts.semibold, fontSize: 13, color: colors.primaryText },
});
