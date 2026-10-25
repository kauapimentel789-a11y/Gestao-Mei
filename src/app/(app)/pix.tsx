import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chips } from '@/components/Chips';
import { DetailBar } from '@/components/DetailBar';
import { ErrorCard } from '@/components/ErrorCard';
import { FormError } from '@/components/FormError';
import { Skeleton } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { usePixSettings, useSavePixSettings } from '@/features/organizations/pix';
import { useOrg } from '@/features/organizations/useOrg';
import { friendlyError } from '@/lib/errors';
import { normalizePixKey, PIX_KEY_LABEL, PIX_KEY_TYPES, type PixKeyType, type PixSettings } from '@/lib/pix';
import { colors, fonts } from '@/theme/tokens';
import { goBack } from '@/lib/navigation';

const PLACEHOLDER: Record<PixKeyType, string> = {
  cpf: '000.000.000-00',
  cnpj: '00.000.000/0000-00',
  phone: '(11) 98888-7777',
  email: 'voce@email.com',
  random: 'Cole aqui a chave aleatória',
};

const INVALID: Record<PixKeyType, string> = {
  cpf: 'CPF inválido. Confira os números.',
  cnpj: 'CNPJ inválido. Confira os números.',
  phone: 'Informe o celular com DDD.',
  email: 'E-mail inválido.',
  random: 'Cole a chave aleatória completa, com os tracinhos.',
};

export default function PixScreen() {
  const { orgId, org, role } = useOrg();
  const pix = usePixSettings(orgId);
  if (pix.isPending) {
    return (
      <Screen>
        <DetailBar title="Chave Pix" />
        <Skeleton />
      </Screen>
    );
  }
  if (pix.error) {
    return (
      <Screen>
        <DetailBar title="Chave Pix" />
        <ErrorCard message={`${friendlyError(pix.error)} Se o problema continuar, o banco ainda precisa da atualização do Pix.`} onRetry={() => pix.refetch()} />
      </Screen>
    );
  }
  return <PixForm key={pix.data?.key ?? 'novo'} orgId={orgId} orgName={org.name} canEdit={role !== 'member'} current={pix.data ?? null} />;
}

function PixForm({ orgId, orgName, canEdit, current }: { orgId: string; orgName: string; canEdit: boolean; current: PixSettings | null }) {
  const save = useSavePixSettings(orgId);
  const toast = useToast();
  const [type, setType] = useState<PixKeyType>(current?.keyType ?? 'phone');
  const [key, setKey] = useState(current?.key ?? '');
  const [name, setName] = useState(current?.name ?? orgName.slice(0, 25));
  const [city, setCity] = useState(current?.city ?? '');
  const [errs, setErrs] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);

  const onSave = async () => {
    const normalized = normalizePixKey(type, key);
    const next: Record<string, string | undefined> = {};
    if (!normalized) next.key = INVALID[type];
    if (name.trim().length < 2 || name.trim().length > 25) next.name = 'Use de 2 a 25 letras.';
    if (city.trim().length < 2 || city.trim().length > 15) next.city = 'Use de 2 a 15 letras.';
    setErrs(next);
    if (!normalized || Object.values(next).some(Boolean)) return;
    setError(null);
    try {
      await save.mutateAsync({ keyType: type, key: normalized, name: name.trim(), city: city.trim() });
      toast('Chave Pix salva');
      goBack();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Screen>
      <DetailBar title="Chave Pix" />
      <Text style={styles.body}>
        A chave vai junto das cobranças pelo WhatsApp, com um Pix copia e cola já com o valor. O dinheiro cai direto na sua conta; o app não
        passa por banco nenhum. Confira o recebimento no extrato.
      </Text>

      <Card>
        <Text style={styles.label}>Tipo de chave</Text>
        <Chips
          accessibilityLabel="Tipo de chave"
          value={type}
          onChange={(t) => {
            setType(t);
            setErrs({});
          }}
          options={PIX_KEY_TYPES.map((t) => ({ value: t, label: PIX_KEY_LABEL[t] }))}
        />
        <TextField
          label="Chave"
          value={key}
          onChangeText={setKey}
          placeholder={PLACEHOLDER[type]}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={type === 'cpf' || type === 'cnpj' || type === 'phone' ? 'number-pad' : type === 'email' ? 'email-address' : 'default'}
          editable={canEdit}
          error={errs.key}
        />
        <TextField
          label="Nome de quem recebe"
          value={name}
          onChangeText={setName}
          maxLength={25}
          hint="Aparece para o cliente no app do banco. Até 25 letras."
          editable={canEdit}
          error={errs.name}
        />
        <TextField label="Cidade" value={city} onChangeText={setCity} maxLength={15} placeholder="Ex.: Santos" editable={canEdit} error={errs.city} />
      </Card>

      <FormError message={error} />
      {canEdit ? (
        <>
          <Button label="Salvar chave" onPress={onSave} loading={save.isPending} />
          {current ? (
            <Button
              variant="tint"
              label="Remover chave"
              onPress={async () => {
                try {
                  await save.mutateAsync(null);
                  toast('Chave removida');
                  goBack();
                } catch (e) {
                  setError(friendlyError(e));
                }
              }}
            />
          ) : null}
        </>
      ) : (
        <Text style={styles.body}>Só o dono ou um administrador pode mudar a chave Pix.</Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
  label: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
});
