import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Chips } from '@/components/Chips';
import { TextField } from '@/components/TextField';
import { formatDateBR, formatTimeBR, parseDateTimeBR } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { colors, fonts, radius, shadows } from '@/theme/tokens';

const DURATIONS = ['30', '60', '90', '120', '180', '240'] as const;
const DURATION_LABEL: Record<(typeof DURATIONS)[number], string> = { '30': '30 min', '60': '1 h', '90': '1 h 30', '120': '2 h', '180': '3 h', '240': '4 h' };

interface Props {
  current: string | null;
  minutes: number | null;
  loading: boolean;
  onClose: () => void;
  onSave: (input: { at: Date | null; minutes: number | null; reason: string }) => Promise<void>;
}

export function ScheduleDialog({ current, minutes, loading, onClose, onSave }: Props) {
  const initial = current ? new Date(current) : null;
  const [date, setDate] = useState(initial ? formatDateBR(initial) : '');
  const [time, setTime] = useState(initial ? formatTimeBR(initial) : '');
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>(
    (DURATIONS as readonly string[]).includes(String(minutes)) ? (String(minutes) as (typeof DURATIONS)[number]) : '60',
  );
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();

  const save = async (clear: boolean) => {
    let at: Date | null = null;
    if (!clear) {
      at = parseDateTimeBR(date, time);
      if (!at || !time.trim()) return setError('Informe data (dd/mm/aaaa) e hora (hh:mm).');
    }
    setError(undefined);
    try {
      await onSave({ at, minutes: clear ? null : Number(duration), reason: reason.trim() });
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.title}>{current ? 'Reagendar' : 'Agendar'}</Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <TextField label="Data" value={date} onChangeText={setDate} placeholder="dd/mm/aaaa" keyboardType="numbers-and-punctuation" />
            </View>
            <View style={styles.time}>
              <TextField label="Hora" value={time} onChangeText={setTime} placeholder="hh:mm" keyboardType="numbers-and-punctuation" />
            </View>
          </View>
          <Text style={styles.label}>Duração prevista</Text>
          <Chips accessibilityLabel="Duração" value={duration} onChange={setDuration} options={DURATIONS.map((d) => ({ value: d, label: DURATION_LABEL[d] }))} />
          {current ? <TextField label="Motivo (opcional)" value={reason} onChangeText={setReason} placeholder="Ex.: cliente pediu outro dia" maxLength={300} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button variant="ink" size="medium" label="Voltar" onPress={onClose} />
          <Button size="medium" label="Salvar" loading={loading} onPress={() => save(false)} />
          {current ? <Button variant="tint" size="medium" label="Tirar da agenda" onPress={() => save(true)} /> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,11,15,0.45)', justifyContent: 'center', padding: 20 },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 20, gap: 12, ...shadows.card },
  title: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.ink },
  label: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  row: { flexDirection: 'row', gap: 10 },
  time: { width: 110 },
  error: { fontFamily: fonts.semibold, fontSize: 13, color: colors.primaryText },
});
