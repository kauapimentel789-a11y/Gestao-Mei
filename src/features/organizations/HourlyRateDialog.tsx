import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { friendlyError } from '@/lib/errors';
import { parseBRLToCents } from '@/lib/money';
import { colors, fonts, radius, shadows } from '@/theme/tokens';

interface Props {
  visible: boolean;
  currentCents: number;
  loading: boolean;
  onClose: () => void;
  onSave: (cents: number) => Promise<void>;
}

export function HourlyRateDialog({ visible, currentCents, loading, onClose, onSave }: Props) {
  const [text, setText] = useState(currentCents > 0 ? (currentCents / 100).toFixed(2).replace('.', ',') : '');
  const [error, setError] = useState<string | undefined>();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.title}>Valor da hora</Text>
          <Text style={styles.body}>Quanto vale uma hora do seu trabalho. Entra no custo de mão de obra das fichas técnicas e das próximas produções.</Text>
          <TextField label="Valor (R$)" value={text} onChangeText={setText} keyboardType="decimal-pad" placeholder="0,00" error={error} />
          <Button variant="ink" size="medium" label="Voltar" onPress={onClose} />
          <Button
            size="medium"
            label="Salvar"
            loading={loading}
            onPress={async () => {
              const cents = text.trim() ? parseBRLToCents(text) : 0;
              if (cents === null || cents > 100000000) return setError('Valor inválido.');
              setError(undefined);
              try {
                await onSave(cents);
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
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
});
