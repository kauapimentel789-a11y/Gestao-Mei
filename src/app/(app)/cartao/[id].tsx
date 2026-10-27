// Cartão: faturas mês a mês, parcelas de cada uma, pagar a fatura (total ou
// parte) e o histórico de pagamentos com estorno.
import { router, useLocalSearchParams } from 'expo-router';
import { Pencil } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CircleButton, DetailBar } from '@/components/DetailBar';
import { ErrorCard } from '@/components/ErrorCard';
import { FormError } from '@/components/FormError';
import { Skeleton } from '@/components/ListStates';
import { ReasonDialog } from '@/components/ReasonDialog';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TextLink } from '@/components/TextLink';
import { useToast } from '@/components/Toast';
import { type CardPayment, useCardPayments, useCards, usePayStatement, useReverseCardPayment, useStatementEntries, useStatements, useUpdateCard } from '@/features/cards/api';
import { CardDialog } from '@/features/cards/CardDialog';
import { cardUsage, currentStatement, statementLabel } from '@/features/cards/logic';
import { StatementChip } from '@/features/cards/StatementChip';
import { useAccounts } from '@/features/finance/api';
import { EntryRow } from '@/features/finance/EntryRow';
import { formatISODate, METHOD_LABEL } from '@/features/finance/logic';
import { PaymentDialog } from '@/features/finance/PaymentDialog';
import { useSpace } from '@/features/organizations/useOrg';
import { monthLabel } from '@/features/reports/logic';
import { friendlyError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { formatCents } from '@/lib/money';
import { colors, fonts } from '@/theme/tokens';

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orgId } = useSpace();
  const cards = useCards(orgId);
  const statements = useStatements(orgId);
  const accounts = useAccounts(orgId);
  const payments = useCardPayments(orgId, id);
  const update = useUpdateCard(orgId);
  const pay = usePayStatement(orgId);
  const reverse = useReverseCardPayment(orgId);
  const toast = useToast();
  const [month, setMonth] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [payKey, setPayKey] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [reversing, setReversing] = useState<CardPayment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const card = cards.data?.find((c) => c.id === id);
  const list = (statements.data ?? []).filter((s) => s.card_id === id);
  const selected = list.find((s) => s.statement_month === month) ?? currentStatement(list);
  const entries = useStatementEntries(orgId, id, selected?.statement_month ?? null);
  const usage = card ? cardUsage(card.limit_cents, list) : null;
  const accountName = (accId: string) => accounts.data?.find((a) => a.id === accId)?.name ?? 'Conta';

  if (cards.isPending) {
    return (
      <Screen>
        <DetailBar title="Cartão" />
        <Skeleton rows={4} />
      </Screen>
    );
  }
  if (cards.error || !card) {
    return (
      <Screen>
        <DetailBar title="Cartão" />
        <ErrorCard message={cards.error ? friendlyError(cards.error) : 'Cartão não encontrado.'} onRetry={() => cards.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <DetailBar title={card.name} right={<CircleButton label="Editar cartão" icon={<Pencil size={18} color={colors.ink} />} onPress={() => setEditOpen(true)} />} />

      <Text style={styles.muted}>
        Fecha dia {card.closing_day} · vence dia {card.due_day}
        {usage?.available != null ? ` · ${formatCents(usage.available)} livres de ${formatCents(card.limit_cents ?? 0)}` : ''}
      </Text>

      {list.length > 1 ? (
        <SegmentedControl
          scrollable
          accessibilityLabel="Fatura"
          value={selected?.statement_month ?? ''}
          onChange={setMonth}
          segments={list.map((s) => ({ value: s.statement_month, label: monthLabel(s.statement_month.slice(0, 7), true) }))}
        />
      ) : null}

      {!selected ? (
        <Card>
          <Text style={styles.cardTitle}>Nenhuma fatura</Text>
          <Text style={styles.muted}>As compras feitas neste cartão aparecem aqui, na fatura em que vão ser cobradas.</Text>
          <Button size="medium" label="Lançar compra no cartão" onPress={() => router.push({ pathname: '/financeiro/parcelado', params: { cartao: card.id } })} />
        </Card>
      ) : (
        <>
          <Card>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>{statementLabel(selected.statement_month)}</Text>
              <StatementChip status={selected.status} />
            </View>
            <Text style={styles.amount}>{formatCents(selected.total_cents)}</Text>
            {selected.paid_cents > 0 && selected.open_cents > 0 ? (
              <Text style={styles.body}>
                Pago {formatCents(selected.paid_cents)} · falta {formatCents(selected.open_cents)}
              </Text>
            ) : null}
            <Info label="Fecha em" value={formatISODate(selected.closing_date)} />
            <Info label="Vence em" value={formatISODate(selected.due_date)} />
            {selected.status === 'open' ? (
              <Text style={styles.muted}>A fatura ainda está aberta: compras até o fechamento entram nela.</Text>
            ) : null}
          </Card>

          {selected.open_cents > 0 ? (
            <Button
              label="Pagar fatura"
              onPress={() => {
                setPayError(null);
                setPayKey(newId());
              }}
            />
          ) : null}

          <Card style={styles.list}>
            <Text style={styles.cardTitle}>Compras nesta fatura</Text>
            {entries.isPending ? <Skeleton rows={2} /> : null}
            {(entries.data ?? []).map((e, i) => (
              <View key={e.id} style={i > 0 && styles.divider}>
                <EntryRow entry={e} />
              </View>
            ))}
          </Card>
        </>
      )}

      <TextLink label="Lançar compra neste cartão" onPress={() => router.push({ pathname: '/financeiro/parcelado', params: { cartao: card.id } })} />

      {(payments.data ?? []).length > 0 ? (
        <Card style={styles.list}>
          <Text style={styles.cardTitle}>Pagamentos de fatura</Text>
          {(payments.data ?? []).map((p, i) => (
            <View key={p.id} style={[styles.payRow, i > 0 && styles.divider]}>
              <View style={styles.flex}>
                <Text style={styles.payTitle}>
                  {statementLabel(p.statement_month)}
                  {p.reversed_at ? <Text style={styles.tag}>  estornado</Text> : null}
                </Text>
                <Text style={styles.muted}>
                  {formatISODate(p.paid_on)} · {METHOD_LABEL[p.method]} · {accountName(p.account_id)}
                </Text>
              </View>
              <View style={styles.right}>
                <Text style={styles.payAmount}>{formatCents(p.amount_cents)}</Text>
                {!p.reversed_at ? (
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => {
                      setError(null);
                      setReversing(p);
                    }}
                  >
                    <Text style={styles.reverse}>Estornar</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text style={styles.payTitle}>Cartão ativo</Text>
            <Text style={styles.muted}>Desativado, não aparece para novas compras. As faturas continuam no histórico.</Text>
          </View>
          <Switch
            value={card.active}
            onValueChange={async (active) => {
              setError(null);
              try {
                await update.mutateAsync({ id: card.id, active });
              } catch (e) {
                setError(friendlyError(e));
              }
            }}
            trackColor={{ true: colors.primary }}
            accessibilityLabel="Cartão ativo"
          />
        </View>
      </Card>
      <FormError message={error} />

      {selected && payKey ? (
        <PaymentDialog
          key={payKey}
          visible
          receiving={false}
          openCents={selected.open_cents}
          accounts={accounts.data ?? []}
          loading={pay.isPending}
          error={payError}
          onClose={() => setPayKey(null)}
          onConfirm={async (v) => {
            setPayError(null);
            try {
              await pay.mutateAsync({ cardId: card.id, month: selected.statement_month, ...v, idempotencyKey: payKey });
              setPayKey(null);
              toast('Pagamento da fatura registrado');
            } catch (e) {
              setPayError(friendlyError(e));
            }
          }}
        />
      ) : null}

      <CardDialog
        key={editOpen ? 'edit-open' : 'edit-closed'}
        visible={editOpen}
        card={card}
        loading={update.isPending}
        onClose={() => setEditOpen(false)}
        onSave={async (input) => {
          await update.mutateAsync({ id: card.id, ...input });
          setEditOpen(false);
          toast('Cartão atualizado');
        }}
      />

      <ReasonDialog
        key={reversing?.id}
        visible={reversing !== null}
        title="Estornar pagamento da fatura?"
        description="O valor volta para a conta e a fatura fica em aberto de novo. O pagamento continua no histórico."
        keepLabel="Voltar"
        confirmLabel="Estornar"
        loading={reverse.isPending}
        error={error}
        onClose={() => setReversing(null)}
        onConfirm={async (reason) => {
          if (!reversing) return;
          try {
            await reverse.mutateAsync({ paymentId: reversing.id, reason });
            setReversing(null);
            toast('Pagamento estornado');
          } catch (e) {
            setError(friendlyError(e));
          }
        }}
      />
    </Screen>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rowBetween}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  amount: { fontFamily: fonts.extrabold, fontSize: 28, letterSpacing: -0.5, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600 },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  infoValue: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  list: { gap: 0, paddingVertical: 4 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  payTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  payAmount: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.ink },
  right: { alignItems: 'flex-end', gap: 6 },
  tag: { fontFamily: fonts.bold, fontSize: 11, color: colors.gray400 },
  reverse: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500, textDecorationLine: 'underline' },
});
