import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DetailBar } from '@/components/DetailBar';
import { ErrorCard } from '@/components/ErrorCard';
import { FormError } from '@/components/FormError';
import { Skeleton } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useOrg } from '@/features/organizations/useOrg';
import { type Professional, useProfessionals, useSaveProfessional } from '@/features/professionals/api';
import { friendlyError } from '@/lib/errors';
import { colors, fonts } from '@/theme/tokens';

/**
 * Profissionais (quem atende). Com pelo menos um ativo, a página de
 * agendamento pergunta "com quem?" e cada um tem a própria agenda.
 */
export default function ProfessionalsScreen() {
  const { orgId, role } = useOrg();
  const canEdit = role !== 'member';
  const list = useProfessionals(orgId);
  const save = useSaveProfessional(orgId);
  const toast = useToast();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    setError(null);
    save.mutate(
      { id: null, name, active: true },
      {
        onSuccess: () => {
          setName('');
          toast('Profissional cadastrado');
        },
        onError: (e) => setError(friendlyError(e)),
      },
    );
  };

  const toggle = (p: Professional) =>
    save.mutate(
      { id: p.id, name: p.name, active: !p.active },
      {
        onSuccess: () => toast(p.active ? `${p.name} desativado` : `${p.name} ativo de novo`),
        onError: (e) => toast(friendlyError(e)),
      },
    );

  return (
    <Screen>
      <DetailBar title="Profissionais" />
      <Card>
        <Text style={styles.body}>
          Cadastre quem atende. Na página de agendamento o cliente escolhe com quem quer ser atendido (ou “sem preferência”), e cada
          profissional tem a própria agenda. No atendimento, você escolhe o profissional no detalhe.
        </Text>
        {canEdit ? (
          <View style={styles.form}>
            <TextField label="Nome" value={name} onChangeText={setName} maxLength={60} placeholder="Ex.: Ana" />
            <FormError message={error} />
            <Button label="Adicionar" onPress={add} loading={save.isPending && !save.variables?.id} disabled={name.trim().length < 2} />
          </View>
        ) : (
          <Text style={styles.body}>Só o dono ou um admin cadastra profissionais.</Text>
        )}
      </Card>

      {list.isPending ? (
        <Skeleton />
      ) : list.error ? (
        <ErrorCard
          message={`${friendlyError(list.error)} Se o problema continuar, o banco ainda precisa da atualização de profissionais.`}
          onRetry={() => list.refetch()}
        />
      ) : list.data.length === 0 ? (
        <Card>
          <Text style={styles.body}>Nenhum profissional ainda. Sem profissionais, a agenda funciona como uma só.</Text>
        </Card>
      ) : (
        <Card>
          {list.data.map((p, i) => (
            <View key={p.id} style={[styles.row, i > 0 && styles.divider]}>
              <View style={styles.flex}>
                <Text style={[styles.name, !p.active && styles.inactive]}>{p.name}</Text>
                {!p.active ? <Text style={styles.muted}>Desativado: não aparece para escolher</Text> : null}
              </View>
              {canEdit ? (
                <Button
                  size="medium"
                  variant="tint"
                  label={p.active ? 'Desativar' : 'Reativar'}
                  loading={save.isPending && save.variables?.id === p.id}
                  onPress={() => toggle(p)}
                />
              ) : null}
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { fontFamily: fonts.medium, fontSize: 13, color: colors.gray600, lineHeight: 19 },
  form: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  flex: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  inactive: { color: colors.gray500 },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
});
