import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DetailBar } from '@/components/DetailBar';
import { FormError } from '@/components/FormError';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { DeleteAccountError, useDeleteAccount } from '@/features/account/api';
import { colors, fonts } from '@/theme/tokens';

const CONFIRM_WORD = 'EXCLUIR';

/** Exclusão da conta (LGPD). Sem volta: pede a palavra EXCLUIR e a senha. */
export default function DeleteAccountScreen() {
  const remove = useDeleteAccount();
  const [word, setWord] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ready = word.trim().toUpperCase() === CONFIRM_WORD && password.length > 0;

  const onDelete = async () => {
    setError(null);
    try {
      await remove.mutateAsync(password);
    } catch (e) {
      setError(e instanceof DeleteAccountError ? e.message : 'Não foi possível excluir a conta agora.');
    }
  };

  return (
    <Screen>
      <DetailBar title="Excluir minha conta" />
      <Card>
        <Text style={styles.title}>O que acontece</Text>
        <Text style={styles.body}>• Você não consegue mais entrar com este e-mail.</Text>
        <Text style={styles.body}>
          • Na empresa em que só você participa, somem os nomes, telefones, e-mails, documentos, endereços e anotações de
          clientes, pacientes e fornecedores, e as páginas de encomenda e agendamento saem do ar.
        </Text>
        <Text style={styles.body}>
          • Os valores de pedidos e lançamentos ficam guardados sem nomes, pelo prazo que a lei fiscal exige.
        </Text>
        <Text style={styles.warning}>Não dá para desfazer. Se quiser guardar algo, anote antes.</Text>
      </Card>
      <Card>
        <TextField
          label={`Digite ${CONFIRM_WORD} para confirmar`}
          value={word}
          onChangeText={setWord}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <TextField
          label="Sua senha"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
        />
        <FormError message={error} />
        <Button label="Excluir minha conta" variant="ink" disabled={!ready} loading={remove.isPending} onPress={onDelete} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 21 },
  warning: { fontFamily: fonts.bold, fontSize: 14, color: colors.danger, lineHeight: 21 },
});
