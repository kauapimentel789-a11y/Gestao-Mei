import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DetailBar } from '@/components/DetailBar';
import { ErrorCard } from '@/components/ErrorCard';
import { FormError } from '@/components/FormError';
import { Skeleton } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { formatPhone } from '@/features/booking/logic';
import { type BookingProfile, cleanProfile, useBookingProfile, useSaveBookingProfile } from '@/features/booking/profile';
import { useOrg } from '@/features/organizations/useOrg';
import { friendlyError } from '@/lib/errors';
import { goBack } from '@/lib/navigation';
import { colors, fonts } from '@/theme/tokens';

/** O que a página de agendamento mostra sobre o negócio. */
export default function BookingProfileScreen() {
  const { orgId } = useOrg();
  const profile = useBookingProfile(orgId);
  if (profile.isPending) {
    return (
      <Screen>
        <DetailBar title="Página do cliente" />
        <Skeleton />
      </Screen>
    );
  }
  if (profile.error) {
    return (
      <Screen>
        <DetailBar title="Página do cliente" />
        <ErrorCard
          message={`${friendlyError(profile.error)} Se o problema continuar, o banco ainda precisa da atualização da página do cliente.`}
          onRetry={() => profile.refetch()}
        />
      </Screen>
    );
  }
  return <ProfileForm current={profile.data} />;
}

function ProfileForm({ current }: { current: BookingProfile }) {
  const { orgId, org, role } = useOrg();
  const canEdit = role !== 'member';
  const save = useSaveBookingProfile(orgId);
  const toast = useToast();
  const [form, setForm] = useState({
    tagline: current.tagline ?? '',
    about: current.about ?? '',
    whatsapp: current.whatsapp ? formatPhone(current.whatsapp) : '',
    address: current.address ?? '',
    instagram: current.instagram ? `@${current.instagram}` : '',
  });
  const [errs, setErrs] = useState<Partial<Record<keyof BookingProfile, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof BookingProfile) => (v: string) => setForm({ ...form, [k]: v });

  const onSave = async () => {
    const result = cleanProfile(form);
    if ('field' in result) {
      setErrs({ [result.field]: result.error });
      return;
    }
    setErrs({});
    setError(null);
    try {
      await save.mutateAsync(result.profile);
      toast('Página atualizada');
      goBack();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Screen>
      <DetailBar title="Página do cliente" />
      <Text style={styles.body}>
        Isso aparece na sua página de agendamento. Tudo é opcional: o que ficar em branco não aparece. Os serviços e o horário vêm do seu cadastro.
      </Text>

      <Card>
        <Text style={styles.title}>Apresentação</Text>
        <TextField
          label="Frase de destaque"
          value={form.tagline}
          onChangeText={set('tagline')}
          placeholder={`Ex.: Seu estilo, nosso cuidado`}
          maxLength={80}
          hint="Aparece grande no topo da página. Sem ela, usamos o nome do negócio."
          editable={canEdit}
          error={errs.tagline}
        />
        <TextField
          label="Sobre o negócio"
          value={form.about}
          onChangeText={set('about')}
          placeholder={`Ex.: Atendimento com hora marcada em ${org.name}, sem fila.`}
          multiline
          maxLength={300}
          editable={canEdit}
          error={errs.about}
        />
      </Card>

      <Card>
        <Text style={styles.title}>Contato</Text>
        <TextField
          label="WhatsApp"
          value={form.whatsapp}
          onChangeText={set('whatsapp')}
          placeholder="(11) 99999-9999"
          keyboardType="phone-pad"
          maxLength={20}
          hint="O cliente fala com você por um botão na página."
          editable={canEdit}
          error={errs.whatsapp}
        />
        <TextField
          label="Endereço"
          value={form.address}
          onChangeText={set('address')}
          placeholder="Rua, número, bairro, cidade"
          maxLength={160}
          hint="Vira um link para abrir no mapa."
          editable={canEdit}
          error={errs.address}
        />
        <TextField
          label="Instagram"
          value={form.instagram}
          onChangeText={set('instagram')}
          placeholder="@seunegocio"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={60}
          editable={canEdit}
          error={errs.instagram}
        />
      </Card>

      <FormError message={error} />
      {canEdit ? (
        <Button label="Salvar" onPress={onSave} loading={save.isPending} />
      ) : (
        <Text style={styles.body}>Só o dono ou um administrador pode mudar a página.</Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
  title: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
});
