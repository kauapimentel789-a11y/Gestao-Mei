// Ficha do fornecedor: contato, endereço, o que vende e o histórico de compras.
import { router, useLocalSearchParams } from 'expo-router';
import { Mail, MapPin, MessageCircle, Package, Pencil, Phone, ShoppingCart, User } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CircleButton, DetailBar } from '@/components/DetailBar';
import { ErrorCard } from '@/components/ErrorCard';
import { QueryStates, Skeleton } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { useOrg } from '@/features/organizations/useOrg';
import { useSupplierPurchases } from '@/features/purchases/api';
import { PurchaseRow } from '@/features/purchases/PurchaseRow';
import { useSuppliers } from '@/features/suppliers/api';
import { formatDocument } from '@/lib/document';
import { friendlyError } from '@/lib/errors';
import { mapsLink } from '@/lib/maps';
import { formatCents } from '@/lib/money';
import { whatsappUrl } from '@/lib/whatsapp';
import { colors, fonts } from '@/theme/tokens';

export default function SupplierDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orgId } = useOrg();
  const list = useSuppliers(orgId);
  const purchases = useSupplierPurchases(orgId, id);
  const s = list.data?.find((x) => x.id === id);

  if (list.isPending) {
    return (
      <Screen>
        <DetailBar title="" />
        <Skeleton />
      </Screen>
    );
  }
  if (list.error || !s) {
    return (
      <Screen>
        <DetailBar title="" />
        <ErrorCard message={friendlyError(list.error ?? { message: 'not_found' })} onRetry={() => list.refetch()} />
      </Screen>
    );
  }

  const wa = s.phone_digits ? whatsappUrl(s.phone_digits) : null;
  const valid = (purchases.data ?? []).filter((p) => p.status !== 'cancelled');
  const total = valid.reduce((sum, p) => sum + p.total_cents, 0);
  const open = valid.reduce((sum, p) => sum + p.open_cents, 0);

  return (
    <Screen>
      <DetailBar
        title={s.name}
        right={
          <CircleButton
            label="Editar fornecedor"
            icon={<Pencil size={18} color={colors.ink} />}
            onPress={() => router.push({ pathname: '/fornecedores/form', params: { id: s.id } })}
          />
        }
      />
      <Card>
        {!s.active ? <Text style={styles.inactive}>Fornecedor inativo</Text> : null}
        {s.supplies ? <Info icon={<Package size={16} color={colors.gray500} />} text={s.supplies} /> : null}
        {s.contact_name ? <Info icon={<User size={16} color={colors.gray500} />} text={s.contact_name} /> : null}
        {s.phone ? <Info icon={<Phone size={16} color={colors.gray500} />} text={s.phone} onPress={() => Linking.openURL(`tel:${s.phone_digits}`)} action="Ligar" /> : null}
        {s.email ? <Info icon={<Mail size={16} color={colors.gray500} />} text={s.email} onPress={() => Linking.openURL(`mailto:${s.email}`)} action="E-mail" /> : null}
        {s.address ? <Info icon={<MapPin size={16} color={colors.gray500} />} text={s.address} onPress={() => Linking.openURL(mapsLink(s.address!))} action="Mapa" /> : null}
        {s.document ? <Text style={styles.muted}>{s.document.length === 14 ? 'CNPJ' : 'CPF'} {formatDocument(s.document)}</Text> : null}
        {s.notes ? <Text style={styles.body}>{s.notes}</Text> : null}
        {!s.supplies && !s.contact_name && !s.phone && !s.email && !s.address ? (
          <Text style={styles.muted}>Toque no lápis para completar contato, endereço e o que esse fornecedor vende.</Text>
        ) : null}
        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>
              {purchases.data ? formatCents(total) : '–'}
            </Text>
            <Text style={styles.muted}>em compras</Text>
          </View>
          <View style={styles.metric}>
            <Text style={[styles.metricValue, open > 0 && styles.open]} numberOfLines={1} adjustsFontSizeToFit>
              {purchases.data ? formatCents(open) : '–'}
            </Text>
            <Text style={styles.muted}>a pagar</Text>
          </View>
        </View>
        {s.active ? (
          <Button size="medium" label="Registrar compra" onPress={() => router.push({ pathname: '/compras/nova', params: { fornecedorId: s.id } })} />
        ) : null}
        {wa ? (
          <Button
            size="medium"
            variant="tint"
            label="WhatsApp"
            trailing={<MessageCircle size={18} color={colors.primaryText} />}
            onPress={() => Linking.openURL(wa)}
          />
        ) : null}
      </Card>
      <Card style={styles.list}>
        <Text style={styles.cardTitle}>Compras</Text>
        <QueryStates
          query={purchases}
          isEmpty={purchases.data?.length === 0}
          empty={{ icon: ShoppingCart, title: 'Nenhuma compra deste fornecedor ainda.' }}
        />
        {purchases.data?.map((p, i) => (
          <PurchaseRow key={p.id} purchase={p} first={i === 0} hideSupplier />
        ))}
      </Card>
    </Screen>
  );
}

function Info({ icon, text, onPress, action }: { icon: ReactNode; text: string; onPress?: () => void; action?: string }) {
  const content = (
    <>
      {icon}
      <Text style={[styles.body, styles.flex]}>{text}</Text>
      {action ? <Text style={styles.link}>{action}</Text> : null}
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="link" accessibilityLabel={`${action}: ${text}`} onPress={onPress} style={styles.info}>
      {content}
    </Pressable>
  ) : (
    <View style={styles.info}>{content}</View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600 },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  link: { fontFamily: fonts.bold, fontSize: 13, color: colors.primaryText },
  inactive: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  metrics: { flexDirection: 'row', gap: 12 },
  metric: { flex: 1, backgroundColor: colors.bg, borderRadius: 16, padding: 12, gap: 2 },
  metricValue: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  open: { color: colors.primaryText },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  list: { gap: 0 },
});
