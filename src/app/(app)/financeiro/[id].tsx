import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DetailBar } from '@/components/DetailBar';
import { ErrorCard } from '@/components/ErrorCard';
import { Skeleton } from '@/components/ListStates';
import { ReasonDialog } from '@/components/ReasonDialog';
import { Screen } from '@/components/Screen';
import { TextLink } from '@/components/TextLink';
import { useToast } from '@/components/Toast';
import { type Payment, useAccounts, useCancelEntry, useEntry, useReversePayment, useSettleEntry } from '@/features/finance/api';
import { EntryStatusChip } from '@/features/finance/EntryRow';
import { formatISODate, METHOD_LABEL, NATURE_LABEL } from '@/features/finance/logic';
import { PaymentDialog } from '@/features/finance/PaymentDialog';
import { getBusinessConfig } from '@/config/business';
import { useSpace } from '@/features/organizations/useOrg';
import { friendlyError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { formatCents } from '@/lib/money';
import { colors, fonts } from '@/theme/tokens';

export default function EntryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orgId, business, personal } = useSpace();
  const query = useEntry(orgId, id);
  const accounts = useAccounts(orgId);
  const settle = useSettleEntry(orgId);
  const reverse = useReversePayment(orgId);
  const cancel = useCancelEntry(orgId);
  const toast = useToast();
  const [payKey, setPayKey] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [reversing, setReversing] = useState<{ payment: Payment; key: string } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  if (query.isPending) {
    return (
      <Screen>
        <DetailBar title="Lançamento" />
        <Skeleton rows={4} />
      </Screen>
    );
  }
  if (query.error || !query.data) {
    return (
      <Screen>
        <DetailBar title="Lançamento" />
        <ErrorCard message={friendlyError(query.error)} onRetry={() => query.refetch()} />
      </Screen>
    );
  }

  const { entry: e, payments } = query.data;
  const receiving = e.direction === 'receivable';
  const accountName = (accId: string) => accounts.data?.find((a) => a.id === accId)?.name ?? 'Conta';
  const reversed = new Set(payments.map((p) => p.reverses_payment_id).filter((x): x is number => x != null));

  return (
    <Screen>
      <DetailBar title={personal ? (receiving ? 'Entrada' : 'Gasto') : receiving ? 'A receber' : 'A pagar'} />

      <Card>
        <View style={styles.rowBetween}>
          <Text style={styles.title}>{e.description}</Text>
          <EntryStatusChip entry={e} />
        </View>
        <Text style={styles.amount}>{formatCents(e.amount_cents)}</Text>
        {e.status !== 'cancelled' && e.paid_cents > 0 ? (
          <Text style={styles.body}>
            {receiving ? 'Recebido' : 'Pago'} {formatCents(e.paid_cents)} · falta {formatCents(e.open_cents)}
          </Text>
        ) : null}
        <Info label="Vencimento" value={formatISODate(e.due_date)} />
        <Info label="Competência" value={formatISODate(e.competence_date)} />
        <Info label="Categoria" value={personal ? e.category_name : `${e.category_name} (${NATURE_LABEL[e.category_nature].toLowerCase()})`} />
        {e.customer_name ? <Info label="Cliente" value={e.customer_name} /> : null}
        {e.supplier_name ? <Info label="Fornecedor" value={e.supplier_name} /> : null}
        {e.notes ? <Info label="Observações" value={e.notes} /> : null}
        {e.cancelled_at ? <Info label="Cancelado" value={e.cancel_reason ?? ''} /> : null}
        {e.order_id && business ? (
          <TextLink
            label={`Ver ${getBusinessConfig(business.business_type, business.practice_area).orderNoun} #${e.order_number}`}
            onPress={() => router.push({ pathname: '/pedidos/[id]', params: { id: e.order_id! } })}
          />
        ) : null}
      </Card>

      {e.open_cents > 0 ? (
        <Button
          label={receiving ? 'Registrar recebimento' : 'Registrar pagamento'}
          onPress={() => {
            setPayError(null);
            setPayKey(newId());
          }}
        />
      ) : null}

      <Card style={styles.history}>
        <Text style={styles.cardTitle}>{receiving ? 'Recebimentos' : 'Pagamentos'}</Text>
        {payments.length === 0 ? <Text style={styles.body}>Nenhum registro ainda.</Text> : null}
        {payments.map((p, i) => (
          <View key={p.id} style={[styles.payRow, i > 0 && styles.divider]}>
            <View style={styles.flex}>
              <Text style={styles.payTitle}>
                {p.reverses_payment_id ? 'Estorno' : METHOD_LABEL[p.method]} · {accountName(p.account_id)}
                {reversed.has(p.id) ? <Text style={styles.tag}>  estornado</Text> : null}
              </Text>
              <Text style={styles.muted}>
                {formatISODate(p.paid_on)}
                {p.notes ? ` · ${p.notes}` : ''}
              </Text>
            </View>
            <View style={styles.right}>
              <Text style={[styles.payAmount, p.amount_cents < 0 && styles.negative]}>{formatCents(p.amount_cents)}</Text>
              {!p.reverses_payment_id && !reversed.has(p.id) ? (
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => {
                    setDialogError(null);
                    setReversing({ payment: p, key: newId() });
                  }}
                >
                  <Text style={styles.reverse}>Estornar</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </Card>

      {e.purchase_id ? (
        <TextLink label="Ver compra" onPress={() => router.push({ pathname: '/compras/[id]', params: { id: e.purchase_id! } })} />
      ) : null}
      {!e.cancelled_at && !e.order_id && !e.purchase_id && e.paid_cents === 0 ? (
        <TextLink
          label="Cancelar lançamento"
          onPress={() => {
            setDialogError(null);
            setCancelOpen(true);
          }}
        />
      ) : null}
      {!e.cancelled_at && e.paid_cents > 0 ? (
        <Text style={styles.note}>Registros não são apagados. Para corrigir, estorne o pagamento e registre de novo.</Text>
      ) : null}

      <PaymentDialog
        key={payKey ?? 'closed'}
        visible={payKey !== null}
        receiving={receiving}
        openCents={e.open_cents}
        accounts={accounts.data ?? []}
        loading={settle.isPending}
        error={payError}
        onClose={() => setPayKey(null)}
        onConfirm={async (v) => {
          if (!payKey) return;
          try {
            await settle.mutateAsync({ entryId: e.id, ...v, idempotencyKey: payKey });
            setPayKey(null);
            toast(receiving ? 'Recebimento registrado' : 'Pagamento registrado');
          } catch (err) {
            setPayError(friendlyError(err));
          }
        }}
      />

      <ReasonDialog
        key={reversing?.key}
        visible={reversing !== null}
        title="Estornar?"
        description={
          reversing
            ? `Será lançado um estorno de ${formatCents(reversing.payment.amount_cents)} e o valor volta a ficar em aberto. O registro original continua no histórico.`
            : ''
        }
        keepLabel="Voltar"
        confirmLabel="Estornar"
        placeholder="Ex.: valor lançado errado"
        loading={reverse.isPending}
        error={dialogError}
        onClose={() => setReversing(null)}
        onConfirm={async (reason) => {
          if (!reversing) return;
          try {
            await reverse.mutateAsync({ paymentId: reversing.payment.id, reason, idempotencyKey: reversing.key });
            setReversing(null);
            toast('Estorno registrado');
          } catch (err) {
            setDialogError(friendlyError(err));
          }
        }}
      />

      <ReasonDialog
        visible={cancelOpen}
        title="Cancelar lançamento?"
        description="Ele continua no histórico como cancelado e sai de contas a receber e a pagar."
        keepLabel="Manter"
        confirmLabel="Cancelar lançamento"
        placeholder="Ex.: lançado em dobro"
        loading={cancel.isPending}
        error={dialogError}
        onClose={() => setCancelOpen(false)}
        onConfirm={async (reason) => {
          try {
            await cancel.mutateAsync({ entryId: e.id, reason });
            setCancelOpen(false);
            toast('Lançamento cancelado');
          } catch (err) {
            setDialogError(friendlyError(err));
          }
        }}
      />
    </Screen>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.info}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  title: { flex: 1, fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  amount: { fontFamily: fonts.extrabold, fontSize: 30, letterSpacing: -0.6, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
  info: { gap: 1 },
  infoValue: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink, marginBottom: 6 },
  history: { gap: 0 },
  payRow: { flexDirection: 'row', gap: 12, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  payTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  tag: { fontFamily: fonts.bold, fontSize: 11, color: colors.gray400 },
  right: { alignItems: 'flex-end', gap: 6 },
  payAmount: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.ink },
  negative: { color: colors.primaryText },
  reverse: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500, textDecorationLine: 'underline' },
  note: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500, textAlign: 'center' },
});
