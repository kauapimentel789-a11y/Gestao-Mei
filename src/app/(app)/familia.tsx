// Família: quem divide "Minhas finanças", convites em aberto, convidar pelo
// e-mail e sair. O banco confere quem pode o quê.
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DetailBar } from '@/components/DetailBar';
import { FormError } from '@/components/FormError';
import { Skeleton } from '@/components/ListStates';
import { ReasonDialog } from '@/components/ReasonDialog';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { TextLink } from '@/components/TextLink';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { type SpaceMember, useInvite, useRemoveMember, useRevokeInvite, useSentInvites, useSpaceMembers } from '@/features/family/api';
import { inviteMessage, memberName, normalizeEmail, ROLE_LABEL } from '@/features/family/logic';
import { formatISODate } from '@/features/finance/logic';
import { useActiveOrganization } from '@/features/organizations/ActiveOrganizationProvider';
import { useSpace } from '@/features/organizations/useOrg';
import { friendlyError } from '@/lib/errors';
import { appHomeUrl } from '@/lib/publicLink';
import { colors, fonts } from '@/theme/tokens';

export default function FamilyScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const { orgId, role } = useSpace();
  const { refetch } = useActiveOrganization();
  const members = useSpaceMembers(orgId);
  const sent = useSentInvites(orgId);
  const invite = useInvite(orgId);
  const revoke = useRevokeInvite(orgId);
  const remove = useRemoveMember(orgId, userId);
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [emailErr, setEmailErr] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<SpaceMember | null>(null);

  const canManage = role === 'owner' || role === 'admin';
  const me = members.data?.find((m) => m.user_id === userId);
  const myName = me ? memberName(me) : '';

  const share = (to: string) => {
    const url = appHomeUrl();
    if (!url) return;
    void Share.share({ message: inviteMessage(myName, to, url) });
  };

  const send = async () => {
    const value = normalizeEmail(email);
    if (!value) {
      setEmailErr('Digite o e-mail da pessoa.');
      return;
    }
    setEmailErr(undefined);
    setError(null);
    try {
      await invite.mutateAsync(value);
      setEmail('');
      toast('Convite criado');
      share(value);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Screen>
      <DetailBar title="Família" />

      <Card>
        <Text style={styles.body}>
          Divida Minhas finanças com quem mora com você. Todos veem e lançam os mesmos gastos, contas, cartões, orçamento e metas. A sua empresa
          continua só sua.
        </Text>
      </Card>

      <Card style={styles.list}>
        <Text style={styles.cardTitle}>Quem participa</Text>
        {members.isPending ? <Skeleton rows={2} /> : null}
        {(members.data ?? []).map((m, i) => {
          const self = m.user_id === userId;
          const canRemove = m.role !== 'owner' && (self || canManage);
          return (
            <View key={m.user_id} style={[styles.row, i > 0 && styles.divider]}>
              <View style={styles.flex}>
                <Text style={styles.name}>
                  {memberName(m)}
                  {self ? ' (você)' : ''}
                </Text>
                <Text style={styles.muted}>
                  {m.email} · {ROLE_LABEL[m.role]}
                </Text>
              </View>
              {canRemove ? (
                <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setRemoving(m)}>
                  <Text style={styles.action}>{self ? 'Sair' : 'Tirar'}</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </Card>

      {(sent.data ?? []).length > 0 ? (
        <Card style={styles.list}>
          <Text style={styles.cardTitle}>Convites esperando resposta</Text>
          {(sent.data ?? []).map((inv, i) => (
            <View key={inv.id} style={[styles.row, i > 0 && styles.divider]}>
              <View style={styles.flex}>
                <Text style={styles.name}>{inv.email}</Text>
                <Text style={styles.muted}>Vale até {formatISODate(inv.expires_at.slice(0, 10))}</Text>
              </View>
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" hitSlop={8} onPress={() => share(inv.email)}>
                  <Text style={styles.link}>Enviar</Text>
                </Pressable>
                {canManage ? (
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={async () => {
                      try {
                        await revoke.mutateAsync(inv.id);
                        toast('Convite cancelado');
                      } catch (e) {
                        setError(friendlyError(e));
                      }
                    }}
                  >
                    <Text style={styles.action}>Cancelar</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      {canManage ? (
        <Card>
          <Text style={styles.cardTitle}>Convidar alguém</Text>
          <TextField
            label="E-mail da pessoa"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="nome@email.com"
            error={emailErr}
            hint="A pessoa entra no Gestão Fácil com este e-mail e o convite aparece para ela aceitar. Até 6 pessoas."
          />
          <FormError message={error} />
          <Button label="Convidar" loading={invite.isPending} onPress={send} />
        </Card>
      ) : (
        <FormError message={error} />
      )}

      <ReasonDialog
        key={removing?.user_id}
        visible={removing !== null}
        title={removing?.user_id === userId ? 'Sair das finanças da família?' : `Tirar ${removing ? memberName(removing) : ''}?`}
        description={
          removing?.user_id === userId
            ? 'Você deixa de ver estas finanças. O que já foi lançado continua aqui para os outros.'
            : 'A pessoa deixa de ver estas finanças. O que ela lançou continua aqui.'
        }
        keepLabel="Voltar"
        confirmLabel={removing?.user_id === userId ? 'Sair' : 'Tirar'}
        placeholder="Ex.: mudou de casa"
        loading={remove.isPending}
        error={error}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          const self = removing.user_id === userId;
          try {
            await remove.mutateAsync(removing.user_id);
            setRemoving(null);
            if (self) {
              refetch();
              toast('Você saiu');
              router.replace('/');
            } else {
              toast('Pessoa removida');
            }
          } catch (e) {
            setError(friendlyError(e));
          }
        }}
      />

      <TextLink label="Voltar para as configurações" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  body: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.gray600 },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink, paddingVertical: 6 },
  list: { gap: 0, paddingVertical: 4 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  actions: { flexDirection: 'row', gap: 16 },
  name: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  link: { fontFamily: fonts.bold, fontSize: 13, color: colors.primaryText },
  action: { fontFamily: fonts.bold, fontSize: 13, color: colors.gray500, textDecorationLine: 'underline' },
});
