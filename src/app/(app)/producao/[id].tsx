import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { DetailBar } from '@/components/DetailBar';
import { ErrorCard } from '@/components/ErrorCard';
import { Skeleton } from '@/components/ListStates';
import { ReasonDialog } from '@/components/ReasonDialog';
import { Screen } from '@/components/Screen';
import { TextLink } from '@/components/TextLink';
import { useToast } from '@/components/Toast';
import { formatSigned, MOVEMENT_LABEL } from '@/features/inventory/logic';
import { formatQuantity } from '@/features/orders/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { useCancelProduction, useProductionRun } from '@/features/production/api';
import { useProducts } from '@/features/products/api';
import { formatWhen } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { colors, fonts } from '@/theme/tokens';

export default function ProductionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orgId, config } = useOrg();
  const query = useProductionRun(orgId, id);
  const products = useProducts(orgId);
  const cancel = useCancelProduction(orgId);
  const toast = useToast();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const names = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data]);

  if (query.isPending) {
    return (
      <Screen>
        <DetailBar title="Produção" />
        <Skeleton rows={4} />
      </Screen>
    );
  }
  if (query.error || !query.data) {
    return (
      <Screen>
        <DetailBar title="Produção" />
        <ErrorCard message={friendlyError(query.error)} onRetry={() => query.refetch()} />
      </Screen>
    );
  }

  const r = query.data;
  const cancelled = r.status === 'cancelled';
  const total = r.materials_cost_cents + r.labor_cost_cents;

  return (
    <Screen>
      <DetailBar title={`Produção #${r.number}`} />

      <Card>
        <Text style={styles.title}>
          {formatQuantity(r.quantity)} {r.unit} · {r.product_name}
        </Text>
        <Text style={styles.muted}>{formatWhen(new Date(r.created_at))}</Text>
        {cancelled ? <Text style={styles.cancelled}>Cancelada: {r.cancel_reason}</Text> : null}
        {r.notes ? <Text style={styles.body}>{r.notes}</Text> : null}
        {r.order_id ? (
          <TextLink
            label={`Ver ${config.orderNoun} #${r.order_number}`}
            onPress={() => router.push({ pathname: '/pedidos/[id]', params: { id: r.order_id! } })}
          />
        ) : null}
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Custo desta produção</Text>
        <Row label="Insumos" value={formatCents(r.materials_cost_cents)} />
        <Row label="Mão de obra" value={formatCents(r.labor_cost_cents)} />
        <Row label="Total" value={formatCents(total)} strong />
        <Row label={`Por ${r.unit}`} value={formatCents(r.unit_cost_cents)} strong />
        {r.missing_cost_inputs > 0 ? (
          <Text style={styles.warn}>
            {r.missing_cost_inputs === 1 ? '1 insumo estava' : `${r.missing_cost_inputs} insumos estavam`} sem custo cadastrado: o custo ficou incompleto.
          </Text>
        ) : null}
      </Card>

      <Card style={styles.movs}>
        <Text style={styles.cardTitle}>Movimentações de estoque</Text>
        {r.movements.length === 0 ? <Text style={styles.muted}>Nenhum item desta produção controla estoque.</Text> : null}
        {r.movements.map((m, i) => {
          const p = names.get(m.product_id);
          return (
            <View key={m.id} style={[styles.movRow, i > 0 && styles.divider]}>
              <View style={styles.flex}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {p?.name ?? 'Item'}
                </Text>
                <Text style={styles.muted}>
                  {MOVEMENT_LABEL[m.movement_type]}
                  {m.negative_authorized ? ' · negativo autorizado' : ''}
                </Text>
              </View>
              <Text style={[styles.qty, Number(m.quantity) < 0 && styles.qtyOut]}>
                {formatSigned(m.quantity)} {p?.unit ?? ''}
              </Text>
            </View>
          );
        })}
      </Card>

      {!cancelled ? (
        <TextLink
          label="Cancelar produção"
          onPress={() => {
            setError(null);
            setCancelOpen(true);
          }}
        />
      ) : null}

      <ReasonDialog
        visible={cancelOpen}
        title="Cancelar produção?"
        description="As movimentações são estornadas: os insumos voltam e o produto sai do estoque, mesmo que o saldo fique negativo. O custo médio do produto não é recalculado. A produção continua no histórico."
        keepLabel="Manter produção"
        confirmLabel="Cancelar produção"
        placeholder="Ex.: quantidade lançada errada"
        loading={cancel.isPending}
        error={error}
        onClose={() => setCancelOpen(false)}
        onConfirm={async (reason) => {
          try {
            await cancel.mutateAsync({ id: r.id, reason });
            setCancelOpen(false);
            toast(`Produção #${r.number} cancelada`);
          } catch (e) {
            setError(friendlyError(e));
          }
        }}
      />
    </Screen>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
  cancelled: { fontFamily: fonts.bold, fontSize: 13, color: colors.primaryText },
  warn: { fontFamily: fonts.medium, fontSize: 12, color: colors.primaryText },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  row: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 28, alignItems: 'center' },
  rowLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gray500 },
  rowValue: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  rowStrong: { fontFamily: fonts.extrabold },
  movs: { gap: 0 },
  movRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  itemName: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  qty: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.ink },
  qtyOut: { color: colors.primaryText },
});
