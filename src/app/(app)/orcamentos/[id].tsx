import { router, useLocalSearchParams } from 'expo-router';
import { MessageCircle } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DetailBar } from '@/components/DetailBar';
import { ErrorCard } from '@/components/ErrorCard';
import { FormError } from '@/components/FormError';
import { Skeleton } from '@/components/ListStates';
import { ReasonDialog } from '@/components/ReasonDialog';
import { Screen } from '@/components/Screen';
import { TextLink } from '@/components/TextLink';
import { useToast } from '@/components/Toast';
import { formatISODate, toISODate } from '@/features/finance/logic';
import { formatQuantity } from '@/features/orders/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { useConvertQuote, useQuote, useSetQuoteStatus } from '@/features/quotes/api';
import { isExpired, QUOTE_STATUS_LABEL, quoteLabel, quoteMessage } from '@/features/quotes/logic';
import { formatWhen } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { whatsappUrl } from '@/lib/whatsapp';
import { colors, fonts } from '@/theme/tokens';

export default function QuoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orgId, org, config } = useOrg();
  const query = useQuote(orgId, id);
  const setStatus = useSetQuoteStatus(orgId);
  const convert = useConvertQuote(orgId);
  const toast = useToast();
  const [dialog, setDialog] = useState<'rejected' | 'cancelled' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (query.isPending) {
    return (
      <Screen>
        <DetailBar title="Orçamento" />
        <Skeleton rows={4} />
      </Screen>
    );
  }
  if (query.error || !query.data) {
    return (
      <Screen>
        <DetailBar title="Orçamento" />
        <ErrorCard message={friendlyError(query.error)} onRetry={() => query.refetch()} />
      </Screen>
    );
  }

  const q = query.data;
  const today = toISODate(new Date());
  const open = q.status === 'draft' || q.status === 'sent';
  const expired = isExpired(q, today);
  const message = quoteMessage({
    businessName: org.name,
    number: q.number,
    customerName: q.customer_name,
    items: q.items,
    discountCents: q.discount_cents,
    totalCents: q.total_cents,
    validUntilBR: q.valid_until ? formatISODate(q.valid_until) : null,
    notes: q.notes,
  });
  const wa = q.customer_phone_digits ? whatsappUrl(q.customer_phone_digits, message) : `https://wa.me/?text=${encodeURIComponent(message)}`;

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setError(null);
    try {
      await fn();
      toast(done);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Screen>
      <DetailBar title={`Orçamento #${q.number}`} />

      <Card>
        <Text style={[styles.status, expired && styles.warn]}>{quoteLabel(q, today)}</Text>
        <Text style={styles.title}>{q.customer_name ?? 'Sem cliente'}</Text>
        <Text style={styles.muted}>
          Criado {formatWhen(new Date(q.created_at))}
          {q.valid_until ? ` · válido até ${formatISODate(q.valid_until)}` : ''}
        </Text>
        {q.status_reason && !open ? <Text style={styles.warn}>Motivo: {q.status_reason}</Text> : null}
        {q.order_id ? (
          <TextLink label={`Ver ${config.orderNoun} #${q.order_number}`} onPress={() => router.push({ pathname: '/pedidos/[id]', params: { id: q.order_id! } })} />
        ) : null}
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Itens</Text>
        {q.items.map((it) => (
          <View key={it.id} style={styles.itemRow}>
            <View style={styles.flex}>
              <Text style={styles.itemName}>{it.description}</Text>
              <Text style={styles.muted}>
                {formatQuantity(it.quantity)} {it.unit !== 'un' ? it.unit : ''} × {formatCents(it.unit_price_cents)}
              </Text>
            </View>
            <Text style={styles.itemTotal}>{formatCents(it.line_total_cents)}</Text>
          </View>
        ))}
        {q.discount_cents > 0 ? (
          <View style={styles.totalRow}>
            <Text style={styles.muted}>Desconto</Text>
            <Text style={styles.muted}>− {formatCents(q.discount_cents)}</Text>
          </View>
        ) : null}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatCents(q.total_cents)}</Text>
        </View>
        {q.notes ? <Text style={styles.body}>{q.notes}</Text> : null}
      </Card>

      {open ? (
        <>
          <Button
            variant="tint"
            label="Enviar pelo WhatsApp"
            trailing={<MessageCircle size={18} color={colors.primaryText} />}
            onPress={async () => {
              if (wa) await Linking.openURL(wa);
              if (q.status === 'draft') await run(() => setStatus.mutateAsync({ id: q.id, status: 'sent' }), 'Orçamento marcado como enviado');
            }}
          />
          <Button
            label={`Aprovado: criar ${config.orderNoun}`}
            loading={convert.isPending}
            onPress={() =>
              run(async () => {
                const order = await convert.mutateAsync({ id: q.id, dueAt: null });
                router.push({ pathname: '/pedidos/[id]', params: { id: order.id } });
              }, `${config.orderNoun.charAt(0).toUpperCase()}${config.orderNoun.slice(1)} criado`)
            }
          />
          <FormError message={error} />
          <View style={styles.links}>
            <TextLink label="Editar orçamento" onPress={() => router.push({ pathname: '/pedidos/novo', params: { editarOrcamento: q.id } })} />
            <TextLink label="Cliente recusou" onPress={() => setDialog('rejected')} />
            <TextLink label="Cancelar orçamento" onPress={() => setDialog('cancelled')} />
          </View>
          <Text style={styles.note}>Os preços ficam gravados no orçamento. Ao aprovar, o {config.orderNoun} é criado com esses mesmos valores.</Text>
        </>
      ) : null}

      <Card>
        <Text style={styles.cardTitle}>Histórico</Text>
        {q.history.map((h) => (
          <View key={h.id} style={styles.histRow}>
            <Text style={styles.body}>
              {h.from_status ? QUOTE_STATUS_LABEL[h.to_status] : 'Criado'}
              {h.reason ? ` · ${h.reason}` : ''}
            </Text>
            <Text style={styles.muted}>{formatWhen(new Date(h.changed_at))}</Text>
          </View>
        ))}
      </Card>

      {dialog ? (
        <ReasonDialog
          visible
          title={dialog === 'rejected' ? 'Cliente recusou?' : 'Cancelar orçamento?'}
          description="O orçamento continua no histórico e não pode mais virar pedido."
          keepLabel="Voltar"
          confirmLabel={dialog === 'rejected' ? 'Marcar como recusado' : 'Cancelar orçamento'}
          placeholder={dialog === 'rejected' ? 'Ex.: achou caro' : 'Ex.: feito em duplicidade'}
          loading={setStatus.isPending}
          error={error}
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            setError(null);
            try {
              await setStatus.mutateAsync({ id: q.id, status: dialog, reason });
              setDialog(null);
              toast(dialog === 'rejected' ? 'Orçamento recusado' : 'Orçamento cancelado');
            } catch (e) {
              setError(friendlyError(e));
            }
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  status: { fontFamily: fonts.bold, fontSize: 12, color: colors.primaryText },
  warn: { fontFamily: fonts.bold, fontSize: 13, color: colors.primaryText },
  title: { fontFamily: fonts.extrabold, fontSize: 17, color: colors.ink },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemName: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  itemTotal: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.ink },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 10 },
  totalLabel: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  totalValue: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.ink },
  links: { flexDirection: 'row', justifyContent: 'space-around' },
  note: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500, textAlign: 'center' },
  histRow: { gap: 2, paddingVertical: 6 },
});
