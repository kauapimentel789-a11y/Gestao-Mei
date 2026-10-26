import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { DetailBar } from '@/components/DetailBar';
import { ErrorCard } from '@/components/ErrorCard';
import { Skeleton } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { type AdminDashboard, type AdminDays, useAdminDashboard, useIsPlatformAdmin } from '@/features/admin/api';
import { bucketLabel, businessLabel, formatDate, formatDateTime, growthPercent, percentOf, PLAN_LABEL } from '@/features/admin/logic';
import { useAuth } from '@/features/auth/AuthProvider';
import { friendlyError } from '@/lib/errors';
import { colors, fonts, radius } from '@/theme/tokens';

const PERIOD_LABEL: Record<AdminDays, string> = { 7: 'nos últimos 7 dias', 30: 'nos últimos 30 dias', 365: 'nos últimos 12 meses' };

export default function AdminScreen() {
  const { session } = useAuth();
  const admin = useIsPlatformAdmin(session?.user.id);
  const [days, setDays] = useState<AdminDays>(30);
  const query = useAdminDashboard(days, admin.data === true);
  const d = query.data;

  return (
    <Screen>
      <DetailBar title="Painel do Gestão Fácil" />

      {admin.isPending ? (
        <Skeleton rows={4} />
      ) : admin.data !== true ? (
        <Card>
          <Text style={styles.cardTitle}>Área restrita</Text>
          <Text style={styles.body}>Esta área é só para quem administra o Gestão Fácil.</Text>
        </Card>
      ) : (
        <>
          <SegmentedControl
            accessibilityLabel="Período do painel"
            value={String(days) as '7' | '30' | '365'}
            onChange={(v) => setDays(Number(v) as AdminDays)}
            segments={[
              { value: '7', label: '7 dias' },
              { value: '30', label: '30 dias' },
              { value: '365', label: '12 meses' },
            ]}
          />

          {query.isPending ? (
            <Skeleton rows={5} />
          ) : query.error || !d ? (
            <ErrorCard message={friendlyError(query.error)} onRetry={() => query.refetch()} />
          ) : (
            <Dashboard d={d} days={days} />
          )}
        </>
      )}
    </Screen>
  );
}

function Dashboard({ d, days }: { d: AdminDashboard; days: AdminDays }) {
  const period = PERIOD_LABEL[days];
  const withCompany = d.users.total - d.users.without_company;
  const usedOnce = d.organizations.total - d.organizations.never_used;
  const typeTotal = d.organizations.total;
  const planTotal = d.by_plan.free + d.by_plan.pro + d.by_plan.pro_max;

  return (
    <>
      <View style={styles.kpis}>
        <Kpi label="Pessoas cadastradas" value={d.users.total} detail={`+${d.users.new} ${period}`} growth={growthPercent(d.users.new, d.users.new_previous)} />
        <Kpi label="Empresas criadas" value={d.organizations.total} detail={`+${d.organizations.new} ${period}`} growth={growthPercent(d.organizations.new, d.organizations.new_previous)} />
        <Kpi label="Empresas ativas (7 dias)" value={d.organizations.active_7d} detail={`${d.organizations.active_30d} nos últimos 30 dias`} />
        <Kpi label="Entraram no app (30 dias)" value={d.users.signed_in_30d} detail={`${d.users.signed_in_7d} nos últimos 7 dias`} />
      </View>

      <SignupsChart d={d} />

      <Card>
        <Text style={styles.cardTitle}>Do cadastro ao uso</Text>
        <Bar label="Criaram a conta" value={d.users.total} total={d.users.total} />
        <Bar label="Criaram a empresa" value={withCompany} total={d.users.total} />
        <Bar label="Já cadastraram algo" value={usedOnce} total={d.users.total} />
        <Text style={styles.hint}>
          {d.users.without_company} {d.users.without_company === 1 ? 'pessoa criou a conta e parou' : 'pessoas criaram a conta e pararam'} antes de criar a empresa
          {d.users.unconfirmed > 0 ? `; ${d.users.unconfirmed} ainda não confirmaram o e-mail` : ''}. &quot;Já cadastraram algo&quot; conta empresas com pelo
          menos um pedido, lançamento, cliente, item ou tarefa.
        </Text>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Tipos de negócio</Text>
        <Bar label="Produção" value={d.by_type.production} total={typeTotal} />
        <Bar label="Revenda" value={d.by_type.resale} total={typeTotal} />
        <Bar label="Serviços (ordens de serviço)" value={d.by_type.services} total={typeTotal} />
        <Bar label="Atendimentos (hora marcada)" value={d.by_type.appointments} total={typeTotal} />
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Planos</Text>
        <Bar label="Grátis" value={d.by_plan.free} total={planTotal} />
        <Bar label="Pro" value={d.by_plan.pro} total={planTotal} />
        <Bar label="Pro Max" value={d.by_plan.pro_max} total={planTotal} />
        {d.expiring.length > 0 ? (
          <>
            <Text style={styles.subTitle}>Vencem nos próximos 15 dias</Text>
            {d.expiring.map((e) => (
              <Line key={e.slug} label={`${e.name} · ${PLAN_LABEL[e.plan]}`} value={formatDate(e.plan_until)} />
            ))}
          </>
        ) : null}
        <Text style={styles.hint}>Plano vencido conta como Grátis.</Text>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Recursos ligados</Text>
        <Bar label="Link de encomenda" value={d.features.public_orders} total={typeTotal} />
        <Bar label="Agendamento pelo site" value={d.features.online_booking} total={typeTotal} />
        <Bar label="Chave Pix cadastrada" value={d.features.pix} total={typeTotal} />
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Uso do app {period}</Text>
        <Line label="Pedidos, vendas e atendimentos" value={String(d.usage.orders)} />
        <Line label="Clientes cadastrados" value={String(d.usage.customers)} />
        <Line label="Lançamentos no financeiro" value={String(d.usage.financial_entries)} />
        <Line label="Tarefas criadas" value={String(d.usage.tasks)} />
        <Text style={styles.hint}>Soma de todas as empresas, sem os pedidos cancelados.</Text>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Empresas que mais usam</Text>
        {d.top_organizations.length === 0 ? (
          <Text style={styles.body}>Nenhum pedido {period}.</Text>
        ) : (
          d.top_organizations.map((o, i) => (
            <View key={`${o.name}-${i}`} style={[styles.listRow, i > 0 && styles.divider]}>
              <View style={styles.flex}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {o.name}
                </Text>
                <Text style={styles.muted}>
                  {businessLabel(o.business_type, o.practice_area)} · {PLAN_LABEL[o.plan]}
                </Text>
              </View>
              <Text style={styles.value}>
                {o.orders} {o.orders === 1 ? 'pedido' : 'pedidos'}
              </Text>
            </View>
          ))
        )}
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Últimos cadastros</Text>
        {d.recent_signups.length === 0 ? (
          <Text style={styles.body}>Ninguém se cadastrou ainda.</Text>
        ) : (
          d.recent_signups.map((s, i) => (
            <View key={`${s.email}-${s.created_at}`} style={[styles.signup, i > 0 && styles.divider]}>
              <Text style={styles.itemName} numberOfLines={1}>
                {s.name || s.email || 'Sem nome'}
              </Text>
              {s.name && s.email ? (
                <Text style={styles.muted} selectable numberOfLines={1}>
                  {s.email}
                </Text>
              ) : null}
              <Text style={styles.muted}>
                {s.organization ? `${s.organization} · ${businessLabel(s.business_type, s.practice_area)} · ${PLAN_LABEL[s.plan ?? 'free']}` : 'Ainda sem empresa'}
                {s.confirmed ? '' : ' · e-mail não confirmado'}
              </Text>
              <Text style={styles.muted}>
                Cadastro {formatDateTime(s.created_at)} · último acesso {formatDateTime(s.last_sign_in_at)}
              </Text>
            </View>
          ))
        )}
        <Text style={styles.hint}>Mostra as 30 contas mais recentes.</Text>
      </Card>

      <Text style={styles.note}>Só você vê este painel. Os números são de todas as empresas, sem abrir os dados de cada negócio.</Text>
    </>
  );
}

function Kpi({ label, value, detail, growth }: { label: string; value: number; detail: string; growth?: number | null }) {
  return (
    <Card style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value.toLocaleString('pt-BR')}</Text>
      <Text style={styles.muted}>{detail}</Text>
      {growth !== undefined && growth !== null ? (
        <Text style={[styles.growth, growth >= 0 ? styles.up : styles.down]}>
          {growth >= 0 ? '+' : ''}
          {growth}% contra o período anterior
        </Text>
      ) : null}
    </Card>
  );
}

function SignupsChart({ d }: { d: AdminDashboard }) {
  const peak = Math.max(0, ...d.series.map((s) => s.users));
  const max = Math.max(1, peak);
  const step = Math.max(1, Math.ceil(d.series.length / 6));
  return (
    <Card>
      <Text style={styles.cardTitle}>Novos cadastros {d.by_month ? 'por mês' : 'por dia'}</Text>
      <View style={styles.chart} accessibilityLabel={`Gráfico de cadastros: ${d.users.new} no período`}>
        {d.series.map((s) => (
          <View key={s.bucket} style={styles.column}>
            <View style={[styles.columnBar, { height: `${(s.users / max) * 100}%` }, s.users === 0 && styles.columnEmpty]} />
          </View>
        ))}
      </View>
      <View style={styles.axis}>
        {d.series.map((s, i) => (
          <Text key={s.bucket} style={styles.axisLabel} numberOfLines={1}>
            {i % step === 0 ? bucketLabel(s.bucket, d.by_month) : ''}
          </Text>
        ))}
      </View>
      <Text style={styles.hint}>
        {d.users.new} {d.users.new === 1 ? 'cadastro' : 'cadastros'} no período. Maior {d.by_month ? 'mês' : 'dia'}: {peak}.
      </Text>
    </Card>
  );
}

function Bar({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = percentOf(value, total);
  return (
    <View style={styles.barRow}>
      <View style={styles.barHead}>
        <Text style={styles.barLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.value}>{value}</Text>
        <Text style={styles.pct}>{pct}%</Text>
      </View>
      <View style={styles.barWrap}>
        <View style={[styles.bar, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  subTitle: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink, marginTop: 4 },
  body: { fontFamily: fonts.medium, fontSize: 13, color: colors.gray600, lineHeight: 19 },
  hint: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500, lineHeight: 17, marginTop: 4 },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  note: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500, textAlign: 'center' },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpi: { flexGrow: 1, flexBasis: 150, gap: 4 },
  kpiLabel: { fontFamily: fonts.semibold, fontSize: 12, color: colors.gray500 },
  kpiValue: { fontFamily: fonts.extrabold, fontSize: 28, color: colors.ink },
  growth: { fontFamily: fonts.bold, fontSize: 11, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, overflow: 'hidden' },
  up: { color: colors.success, backgroundColor: colors.successTint },
  down: { color: colors.danger, backgroundColor: colors.dangerTint },
  chart: { height: 140, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  column: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  columnBar: { width: '100%', minHeight: 2, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: colors.primary },
  columnEmpty: { backgroundColor: colors.gray200 },
  axis: { flexDirection: 'row', gap: 2 },
  axisLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 9, color: colors.gray500, overflow: 'visible' },
  barRow: { gap: 6, paddingVertical: 4 },
  barHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barLabel: { flex: 1, fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  barWrap: { height: 8, borderRadius: 4, backgroundColor: colors.gray100, overflow: 'hidden' },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  pct: { width: 40, textAlign: 'right', fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  value: { fontFamily: fonts.extrabold, fontSize: 13, color: colors.ink },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, minHeight: 28, alignItems: 'center' },
  lineLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: colors.gray600 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 8 },
  itemName: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  signup: { gap: 2, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
});
