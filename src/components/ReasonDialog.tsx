// Confirmação que exige um motivo (estorno, cancelamento).
import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, shadows } from '@/theme/tokens';

import { Button } from './Button';
import { TextField } from './TextField';

interface Props {
  visible: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  keepLabel: string;
  placeholder?: string;
  loading: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

export function ReasonDialog({ visible, title, description, confirmLabel, keepLabel, placeholder, loading, error, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | undefined>();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{description}</Text>
          <TextField label="Motivo" value={reason} onChangeText={setReason} error={err ?? error ?? undefined} placeholder={placeholder} />
          <Button variant="ink" size="medium" label={keepLabel} onPress={onClose} />
          <Button
            size="medium"
            label={confirmLabel}
            loading={loading}
            onPress={() => {
              if (reason.trim().length < 3) return setErr('Informe o motivo.');
              setErr(undefined);
              onConfirm(reason.trim());
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
