// Convite para dividir as finanças de alguém: aparece no Início e no primeiro
// acesso para quem entrou com o e-mail convidado.
import { Users } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { useActiveOrganization } from '@/features/organizations/ActiveOrganizationProvider';
import { friendlyError } from '@/lib/errors';
import { colors, fonts, radius } from '@/theme/tokens';

import { useAnswerInvite, useMyInvites } from './api';

export function PendingInvites() {
  const { session } = useAuth();
  const invites = useMyInvites(session?.user.id);
  const answer = useAnswerInvite(session?.user.id);
  const { select, refetch } = useActiveOrganization();
  const toast = useToast();

  const reply = async (inviteId: string, accept: boolean) => {
    try {
      const orgId = await answer.mutateAsync({ inviteId, accept });
      if (accept && orgId) {
        refetch();
        select(orgId);
        toast('Pronto! Agora vocês dividem as finanças.');
      } else {
        toast('Convite recusado');
      }
    } catch (e) {
      toast(friendlyError(e));
    }
  };

  return (
    <>
      {(invites.data ?? []).map((inv) => (
        <Card key={inv.id} style={styles.card}>
          <View style={styles.head}>
            <View style={styles.icon}>
              <Users size={18} color={colors.primaryText} />
            </View>
            <Text style={styles.title}>{inv.invited_by_name} convidou você para dividir as finanças da casa</Text>
          </View>
          <Text style={styles.body}>Vocês vão ver e lançar os mesmos gastos, contas, cartões e metas. A sua empresa continua só sua.</Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Button size="medium" variant="outline" label="Recusar" disabled={answer.isPending} onPress={() => void reply(inv.id, false)} />
            </View>
            <View style={styles.flex}>
              <Button size="medium" label="Aceitar" loading={answer.isPending} onPress={() => void reply(inv.id, true)} />
            </View>
          </View>
        </Card>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderColor: colors.primary },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 34, height: 34, borderRadius: radius.segmentedOption, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 19, color: colors.gray600 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
});
