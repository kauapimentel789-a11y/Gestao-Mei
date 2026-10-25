import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DetailBar } from '@/components/DetailBar';
import { ErrorCard } from '@/components/ErrorCard';
import { FormError } from '@/components/FormError';
import { Skeleton } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useBusinessHours, useSaveBusinessHours } from '@/features/booking/api';
import { type DayForm, formFromHours, hoursFromForm, WEEKDAY_LABEL } from '@/features/booking/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { friendlyError } from '@/lib/errors';
import { colors, fonts } from '@/theme/tokens';

function copyDay(d: DayForm): DayForm {
  return { open: d.open, first: { ...d.first }, second: d.second ? { ...d.second } : null };
}

/** Horário de funcionamento: define os horários oferecidos na página de agendamento. */
export default function BusinessHoursScreen() {
  const { orgId } = useOrg();
  const hours = useBusinessHours(orgId);
  if (hours.isPending) {
    return (
      <Screen>
        <DetailBar title="Horário de funcionamento" />
        <Skeleton />
      </Screen>
    );
  }
  if (hours.error) {
    return (
      <Screen>
        <DetailBar title="Horário de funcionamento" />
        <ErrorCard
          message={`${friendlyError(hours.error)} Se o problema continuar, o banco ainda precisa da atualização do agendamento.`}
          onRetry={() => hours.refetch()}
        />
      </Screen>
    );
  }
  return <HoursForm initial={formFromHours(hours.data)} />;
}

function HoursForm({ initial }: { initial: DayForm[] }) {
  const { orgId, role } = useOrg();
  const canEdit = role !== 'member';
  const save = useSaveBusinessHours(orgId);
  const toast = useToast();
  const [days, setDays] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, next: DayForm) => setDays(days.map((d, j) => (j === i ? next : d)));

  const onSave = async () => {
    const result = hoursFromForm(days);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setError(null);
    try {
      await save.mutateAsync(result.hours);
      toast('Horário salvo');
      router.back();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  // Segunda a sexta (1 a 5) iguais à segunda.
  const copyMonday = () => setDays(days.map((d, i) => (i >= 2 && i <= 5 ? copyDay(days[1]) : d)));

  return (
    <Screen>
      <DetailBar title="Horário de funcionamento" />
      <Text style={styles.body}>
        A página de agendamento só oferece horários dentro destes turnos, de 30 em 30 minutos, sem encostar nos atendimentos já marcados. Para
        fechar no almoço, use dois turnos.
      </Text>

      {days.map((day, i) => (
        <Card key={WEEKDAY_LABEL[i]}>
          <View style={styles.dayHead}>
            <Text style={styles.dayName}>{WEEKDAY_LABEL[i]}</Text>
            <View style={styles.switchRow}>
              <Text style={styles.muted}>{day.open ? 'Aberto' : 'Fechado'}</Text>
              <Switch
                accessibilityLabel={`${WEEKDAY_LABEL[i]} aberto`}
                value={day.open}
                disabled={!canEdit}
                onValueChange={(open) => update(i, { ...day, open })}
                trackColor={{ true: colors.primary, false: colors.gray200 }}
              />
            </View>
          </View>
          {day.open ? (
            <>
              <Turn
                label={day.second ? '1º turno' : 'Horário'}
                value={day.first}
                editable={canEdit}
                onChange={(first) => update(i, { ...day, first })}
              />
              {day.second ? (
                <Turn label="2º turno" value={day.second} editable={canEdit} onChange={(second) => update(i, { ...day, second })} />
              ) : null}
              {canEdit ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    update(
                      i,
                      day.second
                        ? { ...day, second: null }
                        : { ...day, first: { ...day.first, closes: '12:00' }, second: { opens: '13:00', closes: day.first.closes } },
                    )
                  }
                  style={styles.link}
                >
                  <Text style={styles.linkText}>{day.second ? 'Remover 2º turno' : 'Fechar no almoço (dois turnos)'}</Text>
                </Pressable>
              ) : null}
              {i === 1 && canEdit ? (
                <Pressable accessibilityRole="button" onPress={copyMonday} style={styles.link}>
                  <Text style={styles.linkText}>Usar este horário de terça a sexta</Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
        </Card>
      ))}

      <FormError message={error} />
      {canEdit ? (
        <Button label="Salvar horário" onPress={onSave} loading={save.isPending} />
      ) : (
        <Text style={styles.body}>Só o dono ou um administrador pode mudar o horário.</Text>
      )}
    </Screen>
  );
}

function Turn({
  label,
  value,
  editable,
  onChange,
}: {
  label: string;
  value: { opens: string; closes: string };
  editable: boolean;
  onChange: (v: { opens: string; closes: string }) => void;
}) {
  return (
    <View style={styles.turn}>
      <View style={styles.flex}>
        <TextField
          label={`${label}: abre`}
          value={value.opens}
          onChangeText={(opens) => onChange({ ...value, opens })}
          placeholder="08:00"
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          editable={editable}
        />
      </View>
      <View style={styles.flex}>
        <TextField
          label="fecha"
          value={value.closes}
          onChangeText={(closes) => onChange({ ...value, closes })}
          placeholder="18:00"
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          editable={editable}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
  muted: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gray500 },
  dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  dayName: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  turn: { flexDirection: 'row', gap: 10 },
  link: { minHeight: 36, justifyContent: 'center' },
  linkText: { fontFamily: fonts.bold, fontSize: 13, color: colors.primaryText },
});
