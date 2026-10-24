import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { DetailBar } from '@/components/DetailBar';
import { ErrorCard } from '@/components/ErrorCard';
import { Skeleton } from '@/components/ListStates';
import { ReasonDialog } from '@/components/ReasonDialog';
import { Screen } from '@/components/Screen';
import { TextLink } from '@/components/TextLink';
import { useToast } from '@/components/Toast';
import { formatISODate } from '@/features/finance/logic';
import { formatQuantity } from '@/features/orders/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { useCancelPurchase, usePurchase } from '@/features/purchases/api';
import { friendlyError } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { colors, fonts } from '@/theme/tokens';

export default function PurchaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orgId } = useOrg();
  const query = usePurchase(orgId, id);
  const cancel = useCancelPurchase(orgId);
  const toast = useToast();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (query.isPending) {
    return (
      <Screen>
        <DetailBar title="Compra" />
        <Skeleton rows={4} />
      </Screen>
    );
  }
  if (query.error || !query.data) {
    return (
      <Screen>
        <DetailBar title="Compra" />
        <ErrorCard message={friendlyError(query.error)} onRetry={() => query.refetch()} />
      </Screen>
    );
  }

  const p = query.data;
  const cancelled = p.status === 'cancelled';

  return (
    <Screen>
      <DetailBar title={`Compra #${p.number}`} />

      <Card>
        <Text style={styles.title}>{p.supplier_name ?? 'Sem fornecedor'}</Text>
        <Text style={styles.muted}>
          {formatISODate(p.purchase_date)}
          {p.invoice_ref ? ` · ${p.invoice_ref}` : ''}
        </Text>
        {cancelled ? <Text style={styles.cancelled}>Cancelada: {p.cancel_reason}</Text> : null}
        {p.notes ? <Text style={styles.body}>{p.notes}</Text> : null}
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Itens</Text>
        {p.items.map((it) => (
          <View key={it.id} style={styles.itemRow}>
            <View style={styles.flex}>
              <Text style={styles.itemName}>{it.description}</Text>
              <Text style={styles.muted}>
                {formatQuantity(it.quantity)} {it.unit} × {formatCents(it.unit_cost_cents)}
              </Text>
            </View>
            <Text style={styles.itemTotal}>{formatCents(it.line_total_cents)}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatCents(p.total_cents)}</Text>
        </View>
        <Text style={styles.muted}>
          {cancelled
            ? 'As entradas de estoque desta compra foram estornadas.'
            : 'Os itens que controlam estoque entraram no saldo e o custo médio foi atualizado.'}
        </Text>
      </Card>

      {p.entry_id ? (
        <Card>
          <Text style={styles.cardTitle}>Pagamento</Text>
          <Text style={styles.body}>
            {cancelled
              ? 'Conta a pagar cancelada.'
              : p.open_cents === 0
                ? `Pago ${formatCents(p.paid_cents)}.`
                : `Pago ${formatCents(p.paid_cents)} · falta ${formatCents(p.open_cents)}${p.due_date ? `, vence ${formatISODate(p.due_date)}` : ''}.`}
          </Text>
          <TextLink label="Ver conta a pagar" onPress={() => router.push({ pathname: '/financeiro/[id]', params: { id: p.entry_id! } })} />
        </Card>
      ) : null}

      {!cancelled ? (
        <TextLink
          label="Cancelar compra"
          onPress={() => {
            setError(null);
            setCancelOpen(true);
          }}
        />
      ) : null}

      <ReasonDialog
        visible={cancelOpen}
        title="Cancelar compra?"
        description="As entradas de estoque são estornadas e a conta a pagar é cancelada. Se já houve pagamento, estorne o pagamento antes. A compra continua no histórico."
        keepLabel="Manter compra"
        confirmLabel="Cancelar compra"
        placeholder="Ex.: nota lançada em dobro"
        loading={cancel.isPending}
        error={error}
        onClose={() => setCancelOpen(false)}
        onConfirm={async (reason) => {
          try {
            await cancel.mutateAsync({ id: p.id, reason });
            setCancelOpen(false);
            toast(`Compra #${p.number} cancelada`);
          } catch (e) {
            setError(friendlyError(e));
          }
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
  cancelled: { fontFamily: fonts.bold, fontSize: 13, color: colors.primaryText },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemName: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  itemTotal: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.ink },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 10 },
  totalLabel: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  totalValue: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.ink },
});
