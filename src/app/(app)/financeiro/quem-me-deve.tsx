import { router } from 'expo-router';
import { ChevronRight, HandCoins, MessageCircle } from 'lucide-react-native';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DetailBar } from '@/components/DetailBar';
import { QueryStates } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { useCustomersByIds } from '@/features/customers/api';
import { useOpenEntries } from '@/features/finance/api';
import { chargeMessage, type Debtor, groupDebtors } from '@/features/finance/debtors';
import { formatShortDate, toISODate } from '@/features/finance/logic';
import { usePixSettings } from '@/features/organizations/pix';
import { useOrg } from '@/features/organizations/useOrg';
import { formatCents } from '@/lib/money';
import { PIX_KEY_LABEL, pixCopyPaste, type PixSettings } from '@/lib/pix';
import { whatsappUrl } from '@/lib/whatsapp';
import { colors, fonts } from '@/theme/tokens';

export default function DebtorsScreen() {
  const { orgId, org, config } = useOrg();
  const open = useOpenEntries(orgId, 'receivable');
  const pix = usePixSettings(orgId);
  const today = toISODate(new Date());
  const debtors = groupDebtors(open.data ?? [], today);
  const customers = useCustomersByIds(orgId, debtors.flatMap((d) => (d.customerId ? [d.customerId] : [])));
  const phoneOf = (id: string | null) => customers.data?.find((c) => c.id === id)?.phone_digits ?? null;
  const total = debtors.reduce((s, d) => s + d.totalCents, 0);
  const overdue = debtors.reduce((s, d) => s + d.overdueCents, 0);

  return (
    <Screen>
      <DetailBar title="Quem me deve" />

      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Falta receber</Text>
        <Text style={styles.heroValue}>{open.data ? formatCents(total) : '–'}</Text>
        {overdue > 0 ? <Text style={styles.heroSub}>{formatCents(overdue)} já venceu</Text> : null}
      </View>

      {pix.isSuccess && !pix.data ? (
        <Card>
          <Text style={styles.cardTitle}>Receba mais rápido com Pix</Text>
          <Text style={styles.body}>Cadastre sua chave e a cobrança já vai com o Pix copia e cola no valor certo.</Text>
          <Button size="medium" label="Cadastrar chave Pix" onPress={() => router.push('/pix')} />
        </Card>
      ) : null}

      <QueryStates
        query={open}
        isEmpty={debtors.length === 0}
        empty={{
          icon: HandCoins,
          title: 'Ninguém te deve agora',
          description: `Quando um ${config.clientNoun} ficar de pagar depois, ele aparece aqui com o valor e o botão de cobrar.`,
        }}
      />

      {debtors.map((d) => (
        <DebtorCard key={d.customerId ?? 'none'} debtor={d} phone={phoneOf(d.customerId)} orgName={org.name} pix={pix.data ?? null} />
      ))}
    </Screen>
  );
}

function DebtorCard({ debtor, phone, orgName, pix }: { debtor: Debtor; phone: string | null; orgName: string; pix: PixSettings | null }) {
  const toast = useToast();
  const url =
    debtor.customerId && phone
      ? whatsappUrl(
          phone,
          chargeMessage({
            customerName: debtor.name,
            orgName,
            entries: debtor.entries,
            totalCents: debtor.totalCents,
            pix: pix ? { keyLabel: PIX_KEY_LABEL[pix.keyType], key: pix.key, code: pixCopyPaste(pix, debtor.totalCents) } : null,
          }),
        )
      : null;

  return (
    <Card style={styles.debtor}>
      <View style={styles.debtorHead}>
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={1}>
            {debtor.name}
          </Text>
          <Text style={[styles.meta, debtor.overdueCents > 0 && styles.late]}>
            {debtor.overdueCents > 0 ? `Venceu ${formatShortDate(debtor.oldestDue)}` : `Vence ${formatShortDate(debtor.oldestDue)}`}
            {debtor.entries.length > 1 ? ` · ${debtor.entries.length} valores` : ''}
          </Text>
        </View>
        <Text style={styles.total}>{formatCents(debtor.totalCents)}</Text>
      </View>

      {debtor.entries.map((e) => (
        <Pressable
          key={e.id}
          accessibilityRole="button"
          accessibilityLabel={`Abrir ${e.description}`}
          onPress={() => router.push({ pathname: '/financeiro/[id]', params: { id: e.id } })}
          style={({ pressed }) => [styles.entry, pressed && styles.pressed]}
        >
          <Text style={styles.entryText} numberOfLines={1}>
            {e.order_number ? `#${e.order_number} · ` : ''}
            {e.description}
          </Text>
          <Text style={styles.entryValue}>{formatCents(e.open_cents)}</Text>
          <ChevronRight size={16} color={colors.gray400} />
        </Pressable>
      ))}

      {url ? (
        <Button
          size="medium"
          label="Cobrar no WhatsApp"
          trailing={<MessageCircle size={18} color={colors.white} />}
          onPress={() => Linking.openURL(url).catch(() => toast('Não foi possível abrir o WhatsApp.'))}
        />
      ) : debtor.customerId ? (
        <Text style={styles.hint}>Cadastre o WhatsApp deste cliente para cobrar com um toque.</Text>
      ) : (
        <Text style={styles.hint}>Valores sem cliente. Abra cada um para registrar o recebimento.</Text>
      )}
      <Text style={styles.hint}>Recebeu? Toque no valor e registre o recebimento.</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { backgroundColor: colors.ink, borderRadius: 26, padding: 20, gap: 4 },
  heroLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gray300 },
  heroValue: { fontFamily: fonts.extrabold, fontSize: 32, letterSpacing: -0.7, color: colors.white },
  heroSub: { fontFamily: fonts.bold, fontSize: 13, color: colors.primarySoft },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 13, color: colors.gray600, lineHeight: 19 },
  debtor: { gap: 8 },
  debtorHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  meta: { fontFamily: fonts.semibold, fontSize: 12, color: colors.gray500 },
  late: { color: colors.primaryText },
  total: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.ink },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderTopWidth: 1, borderTopColor: colors.divider },
  pressed: { backgroundColor: colors.rowPressed },
  entryText: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.gray600 },
  entryValue: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  hint: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500, lineHeight: 17 },
});
