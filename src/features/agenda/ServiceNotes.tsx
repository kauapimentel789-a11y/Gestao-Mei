// Anotações do atendimento: só são acrescentadas, nunca editadas ou apagadas.
import { NotebookPen } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { QueryStates } from '@/components/ListStates';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useOrg } from '@/features/organizations/useOrg';
import { formatWhen } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { colors, fonts } from '@/theme/tokens';

import { type ServiceNote, useAddServiceNote, useOrderNotes } from './api';

export function ServiceNotes({ orderId }: { orderId: string }) {
  const { orgId } = useOrg();
  const notes = useOrderNotes(orgId, orderId);
  const add = useAddServiceNote(orgId);
  const toast = useToast();
  const [text, setText] = useState('');
  const [key, setKey] = useState(newId);
  const [error, setError] = useState<string | undefined>();

  return (
    <Card>
      <Text style={styles.cardTitle}>Anotações</Text>
      <Text style={styles.muted}>O que foi feito e os próximos passos. Só a sua equipe vê.</Text>
      <QueryStates query={notes} isEmpty={false} empty={{ icon: NotebookPen, title: '' }} />
      {notes.data?.map((n) => <NoteItem key={n.id} note={n} />)}
      <TextField
        label="Nova anotação"
        value={text}
        onChangeText={setText}
        placeholder="Ex.: Restauração no dente 36. Retorno em 6 meses."
        multiline
        maxLength={4000}
        error={error}
      />
      <Button
        variant="tint"
        size="medium"
        label="Salvar anotação"
        trailing={<NotebookPen size={18} color={colors.primaryText} />}
        loading={add.isPending}
        onPress={async () => {
          if (!text.trim()) return setError('Escreva a anotação.');
          setError(undefined);
          try {
            await add.mutateAsync({ orderId, body: text, idempotencyKey: key });
            setText('');
            setKey(newId());
            toast('Anotação salva');
          } catch (e) {
            setError(friendlyError(e));
          }
        }}
      />
      <Text style={styles.muted}>Para corrigir, escreva uma nova anotação. As anteriores ficam no histórico.</Text>
    </Card>
  );
}

export function NoteItem({ note, label }: { note: ServiceNote; label?: string }) {
  return (
    <View style={styles.note}>
      <Text style={styles.noteDate}>
        {formatWhen(new Date(note.created_at))}
        {label ? ` · ${label}` : ''}
      </Text>
      <Text style={styles.body}>{note.body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  note: { gap: 2, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.divider },
  noteDate: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
});
