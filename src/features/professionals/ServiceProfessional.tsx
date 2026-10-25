// Profissional do atendimento, no detalhe da ordem de serviço. Só aparece
// quando a empresa tem profissionais cadastrados.
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { useToast } from '@/components/Toast';
import { useOrg } from '@/features/organizations/useOrg';
import { friendlyError } from '@/lib/errors';
import { colors, fonts, radius } from '@/theme/tokens';

import { useProfessionals, useSetOrderProfessional } from './api';

export function ServiceProfessional({ orderId, professionalId, closed }: { orderId: string; professionalId: string | null; closed: boolean }) {
  const { orgId } = useOrg();
  const list = useProfessionals(orgId);
  const setPro = useSetOrderProfessional(orgId);
  const toast = useToast();

  const all = list.data ?? [];
  const current = all.find((p) => p.id === professionalId) ?? null;
  const options = all.filter((p) => p.active);
  if (options.length === 0 && !current) return null;

  const choose = (id: string | null) => {
    if (closed || id === professionalId) return;
    setPro.mutate(
      { orderId, professionalId: id },
      {
        onSuccess: () => toast(id ? 'Profissional escolhido' : 'Sem profissional'),
        onError: (e) => toast(friendlyError(e)),
      },
    );
  };

  return (
    <Card>
      <Text style={styles.cardTitle}>Profissional</Text>
      {closed ? (
        <Text style={styles.body}>{current?.name ?? 'Sem profissional'}</Text>
      ) : (
        <>
          <View style={styles.chips}>
            <Chip label="Sem profissional" on={!professionalId} onPress={() => choose(null)} />
            {current && !current.active ? <Chip label={`${current.name} (desativado)`} on onPress={() => undefined} /> : null}
            {options.map((p) => (
              <Chip key={p.id} label={p.name} on={p.id === professionalId} onPress={() => choose(p.id)} />
            ))}
          </View>
          {!professionalId ? <Text style={styles.hint}>Sem profissional, este horário fica ocupado na agenda de todos.</Text> : null}
        </>
      )}
    </Card>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600 },
  hint: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.white,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.primaryTint, borderColor: colors.primary },
  pressed: { opacity: 0.7 },
  chipText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  chipTextOn: { fontFamily: fonts.bold, color: colors.primaryText },
});
