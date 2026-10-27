import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { parseDateInput } from '@/features/finance/logic';
import { friendlyError } from '@/lib/errors';
import { parseBRLToCents } from '@/lib/money';
import { colors, fonts, radius, shadows } from '@/theme/tokens';

interface Props {
  visible: boolean;
  loading: boolean;
  defaultFrom: string;
  onClose: () => void;
  onSave: (input: { cents: number; validFrom: string; note: string }) => Promise<void>;
}

export function LimitDialog({ visible, loading, defaultFrom, onClose, onSave }: Props) {
  const [value, setValue] = useState('');
  const [from, setFrom] = useState(defaultFrom);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.title}>Limite anual de faturamento</Text>
          <Text style={styles.body}>
            Informe o limite vigente segundo as regras oficiais e a partir de quando ele vale. O valor anterior fica no histórico. Confira com seu contador
            se tiver dúvida, inclusive se o seu primeiro ano tem limite proporcional.
          </Text>
          <TextField label="Limite do ano (R$)" value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="0,00" />
          <TextField label="Vale a partir de" value={from} onChangeText={setFrom} placeholder="dd/mm/aaaa" mask="date" />
          <TextField label="Origem da informação (opcional)" value={note} onChangeText={setNote} placeholder="Ex.: site do Simples Nacional" maxLength={300} error={error} />
          <Button variant="ink" size="medium" label="Voltar" onPress={onClose} />
          <Button
            size="medium"
            label="Salvar limite"
            loading={loading}
            onPress={async () => {
              const cents = parseBRLToCents(value);
              if (!cents) return setError('Informe o valor do limite.');
              const validFrom = parseDateInput(from);
              if (!validFrom) return setError('Data inválida. Use dd/mm/aaaa.');
              setError(undefined);
              try {
                await onSave({ cents, validFrom, note: note.trim() });
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
  backdrop: { flex: 1, backgroundColor: 'rgba(11,11,15,0.45)', justifyContent: 'center', padding: 20 },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 20, gap: 12, ...shadows.card },
  title: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 13, color: colors.gray600, lineHeight: 19 },
});
