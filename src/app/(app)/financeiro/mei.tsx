import { router } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DetailBar } from '@/components/DetailBar';
import { ErrorCard } from '@/components/ErrorCard';
import { Skeleton } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { useToast } from '@/components/Toast';
import { formatISODate, formatShortDate } from '@/features/finance/logic';
import { useMeiYear, useRevenueLimits, useSetRevenueLimit } from '@/features/mei/api';
import { LimitDialog } from '@/features/mei/LimitDialog';
import { LEVEL_TEXT, limitLevel, MONTH_LABEL, yearProjection, yearTotal } from '@/features/mei/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { friendlyError } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { colors, fonts, minTouch, radius } from '@/theme/tokens';

export default function MeiRevenueScreen() {
  const { orgId, role, config } = useOrg();
  const toast = useToast();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const query = useMeiYear(orgId, year);
  const limits = useRevenueLimits(orgId);
  const setLimit = useSetRevenueLimit(orgId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const canEdit = role === 'owner' || role === 'admin';

  const d = query.data;
  const total = d ? yearTotal(d.months) : 0;
  const received = d ? yearTotal(d.months, 'received_cents') : 0;
  const limitCents = d?.limit?.annual_limit_cents ?? null;
  const level = limitLevel(total, limitCents);
  const projection = d ? yearProjection(d.months, year) : 0;
  const maxMonth = d ? Math.max(1, ...d.months.map((m) => m.revenue_cents)) : 1;
  const pct = limitCents ? Math.min(1, total / limitCents) : 0;

  return (
    <Screen>
      <DetailBar title="Faturamento do MEI" />

      <View style={styles.yearRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Ano anterior" onPress={() => setYear(year - 1)} style={styles.arrow}>
          <ChevronLeft size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.yearLabel}>{year}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Próximo ano"
          disabled={year >= thisYear}
          onPress={() => setYear(year + 1)}
          style={[styles.arrow, year >= thisYear && styles.disabled]}
        >
          <ChevronRight size={20} color={colors.ink} />
        </Pressable>
      </View>

      {query.isPending ? (
        <Skeleton rows={4} />
      ) : query.error || !d ? (
        <ErrorCard message={friendlyError(query.error)} onRetry={() => query.refetch()} />
      ) : (
        <>
          <View style={styles.hero}>
            <View style={styles.glow} pointerEvents="none" />
            <Text style={styles.heroLabel}>Faturamento acumulado em {year}</Text>
            <Text style={styles.heroValue}>{formatCents(total)}</Text>
            {limitCents ? (
              <>
                <View style={styles.bar} accessibilityLabel={`${Math.round((total / limitCents) * 100)}% do limite`}>
                  <View style={[styles.barFill, { width: `${pct * 100}%` }, level === 'over' || level === 'near' ? styles.barHot : null]} />
                </View>
                <Text style={styles.heroSub}>
                  {Math.round((total / limitCents) * 100)}% de {formatCents(limitCents)} · falta {formatCents(Math.max(0, limitCents - total))}
                </Text>
                {level !== 'none' ? <Text style={[styles.heroSub, level !== 'ok' && styles.heroWarn]}>{LEVEL_TEXT[level]}</Text> : null}
              </>
            ) : (
              <Text style={styles.heroSub}>Cadastre o limite anual para acompanhar quanto falta.</Text>
            )}
            {year === thisYear && total > 0 ? (
              <Text style={styles.heroHint}>No ritmo atual, o ano fecharia em cerca de {formatCents(projection)}.</Text>
            ) : null}
          </View>

          <Card>
            <Text style={styles.cardTitle}>Mês a mês</Text>
            {d.months.map((m) => (
              <View key={m.month} style={styles.monthRow}>
                <Text style={styles.monthLabel}>{MONTH_LABEL[m.month - 1]}</Text>
                <View style={styles.monthBarWrap}>
                  <View style={[styles.monthBar, { width: `${(m.revenue_cents / maxMonth) * 100}%` }]} />
                </View>
                <View style={styles.monthValues}>
                  <Text style={styles.monthValue}>{formatCents(m.revenue_cents)}</Text>
                  {m.received_cents > 0 ? <Text style={styles.muted}>recebido {formatCents(m.received_cents)}</Text> : null}
                </View>
              </View>
            ))}
            <Text style={styles.hint}>
              Considera os lançamentos a receber de vendas e serviços pela data de competência, recebidos ou não, sem os cancelados. Recebido no ano:{' '}
              {formatCents(received)}. Recebimento não é o mesmo que faturamento.
            </Text>
          </Card>

          {d.unbilled_orders.length > 0 || d.other_revenue_entries.length > 0 ? (
            <Card>
              <Text style={styles.cardTitle}>Para conferir</Text>
              {d.unbilled_orders.length > 0 ? (
                <>
                  <Text style={styles.body}>
                    {config.tabLabels.pedidos} concluídos sem recebimento lançado ({formatCents(d.unbilled_orders_cents)}). Eles ainda não contam no
                    faturamento: registre o recebimento no {config.orderNoun}.
                  </Text>
                  {d.unbilled_orders.map((o) => (
                    <Pressable
                      key={o.id}
                      accessibilityRole="button"
                      onPress={() => router.push({ pathname: '/pedidos/[id]', params: { id: o.id } })}
                      style={styles.reviewRow}
                    >
                      <Text style={styles.reviewTitle}>
                        #{o.number} · {formatShortDate(o.order_date)}
                      </Text>
                      <Text style={styles.reviewValue}>{formatCents(o.total_cents)}</Text>
                    </Pressable>
                  ))}
                </>
              ) : null}
              {d.other_revenue_entries.length > 0 ? (
                <>
                  <Text style={styles.body}>Lançados como “outras receitas”, fora do faturamento. Se forem vendas ou serviços, mude a categoria.</Text>
                  {d.other_revenue_entries.map((e) => (
                    <Pressable
                      key={e.id}
                      accessibilityRole="button"
                      onPress={() => router.push({ pathname: '/financeiro/[id]', params: { id: e.id } })}
                      style={styles.reviewRow}
                    >
                      <Text style={styles.reviewTitle} numberOfLines={1}>
                        {e.description} · {formatShortDate(e.competence_date)}
                      </Text>
                      <Text style={styles.reviewValue}>{formatCents(e.amount_cents)}</Text>
                    </Pressable>
                  ))}
                </>
              ) : null}
            </Card>
          ) : null}
        </>
      )}

      <Card>
        <Text style={styles.cardTitle}>Limite anual</Text>
        {limits.data && limits.data.length > 0 ? (
          limits.data.map((l) => (
            <View key={l.id} style={styles.limitRow}>
              <View style={styles.flex}>
                <Text style={styles.limitValue}>{formatCents(l.annual_limit_cents)}</Text>
                <Text style={styles.muted}>
                  {l.valid_to ? `De ${formatISODate(l.valid_from)} a ${formatISODate(l.valid_to)}` : `Desde ${formatISODate(l.valid_from)}`}
                  {l.note ? ` · ${l.note}` : ''}
                </Text>
              </View>
            </View>
          ))
        ) : limits.isPending ? (
          <Skeleton rows={1} />
        ) : (
          <Text style={styles.body}>Nenhum limite cadastrado. O valor muda com as regras oficiais, por isso não vem pronto no app.</Text>
        )}
        {canEdit ? <Button variant="tint" size="medium" label="Atualizar limite" onPress={() => setDialogOpen(true)} /> : null}
      </Card>

      <Text style={styles.note}>Acompanhamento gerencial. Não substitui a apuração oficial nem a orientação de um contador.</Text>

      {dialogOpen ? (
        <LimitDialog
          visible
          loading={setLimit.isPending}
          defaultFrom={`01/01/${thisYear}`}
          onClose={() => setDialogOpen(false)}
          onSave={async (input) => {
            await setLimit.mutateAsync(input);
            setDialogOpen(false);
            toast('Limite atualizado');
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: { width: minTouch, height: minTouch, borderRadius: minTouch / 2, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  yearLabel: { fontFamily: fonts.extrabold, fontSize: 17, color: colors.ink },
  hero: { backgroundColor: colors.ink, borderRadius: radius.hero, padding: 20, gap: 6, overflow: 'hidden' },
  glow: { position: 'absolute', top: -120, right: -90, width: 240, height: 240, borderRadius: 120, backgroundColor: colors.primary, opacity: 0.45 },
  heroLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gray300 },
  heroValue: { fontFamily: fonts.extrabold, fontSize: 32, letterSpacing: -0.7, color: colors.white },
  heroSub: { fontFamily: fonts.semibold, fontSize: 13, color: colors.primarySoft },
  heroWarn: { color: colors.white },
  heroHint: { fontFamily: fonts.medium, fontSize: 11, color: colors.gray400 },
  bar: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5, backgroundColor: colors.primarySoft },
  barHot: { backgroundColor: colors.primary },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 },
  monthLabel: { width: 32, fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  monthBarWrap: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.gray100, overflow: 'hidden' },
  monthBar: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  monthValues: { width: 116, alignItems: 'flex-end' },
  monthValue: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  muted: { fontFamily: fonts.medium, fontSize: 11, color: colors.gray500 },
  hint: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500, lineHeight: 17, marginTop: 4 },
  body: { fontFamily: fonts.medium, fontSize: 13, color: colors.gray600, lineHeight: 19 },
  reviewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, borderTopWidth: 1, borderTopColor: colors.divider },
  reviewTitle: { flex: 1, fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  reviewValue: { fontFamily: fonts.extrabold, fontSize: 13, color: colors.ink },
  limitRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderTopWidth: 1, borderTopColor: colors.divider },
  limitValue: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  note: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500, textAlign: 'center' },
});
