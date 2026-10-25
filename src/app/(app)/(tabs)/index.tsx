import { router, useFocusEffect } from 'expo-router';
import { BadgeDollarSign, CalendarPlus, ChevronRight, Link2, Package, ReceiptText, Settings, Users } from 'lucide-react-native';
import { type ReactNode, useCallback, useState } from 'react';
import { Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { QueryStates } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { AgendaRow } from '@/features/agenda/AgendaRow';
import { useAgenda } from '@/features/agenda/api';
import { canRemind, overlapping } from '@/features/agenda/logic';
import { RemindersCard } from '@/features/agenda/RemindersCard';
import { useAuth } from '@/features/auth/AuthProvider';
import { DasCard } from '@/features/das/DasCard';
import { MoneyCard } from '@/features/finance/MoneyCard';
import { toISODate } from '@/features/finance/logic';
import { useLowStock } from '@/features/inventory/api';
import { useOrderCounts, useOrders } from '@/features/orders/api';
import { formatQuantity } from '@/features/orders/logic';
import { OrderRow } from '@/features/orders/OrderRow';
import { useOrg } from '@/features/organizations/useOrg';
import { useSetupStatus } from '@/features/setup/api';
import { SetupCard } from '@/features/setup/SetupCard';
import { useTasks } from '@/features/tasks/api';
import { filterTasks } from '@/features/tasks/logic';
import { TaskRow } from '@/features/tasks/TaskRow';
import { formatLongToday, formatTimeBR, greeting } from '@/lib/dates';
import { publicOrderUrl } from '@/lib/publicLink';
import { useDeviceFlag } from '@/lib/useDeviceFlag';
import { colors, fonts, minTouch, radius } from '@/theme/tokens';

const logo = require('../../../../assets/brand/logo-tile-dark.png');

export default function HomeScreen() {
  const { session } = useAuth();
  const { org, orgId, config } = useOrg();
  const counts = useOrderCounts(orgId);
  const late = useOrders(orgId, 'late');
  const today = useOrders(orgId, 'today');
  const low = useLowStock(orgId);
  const lowItems = low.data ?? [];
  const tasks = useTasks(orgId);
  const todayTasks = filterTasks(tasks.data ?? [], 'today', toISODate(new Date()));
  const firstName = String(session?.user.user_metadata?.display_name ?? '').split(' ')[0];
  const c = counts.data;
  const plural = config.tabLabels.pedidos.toLowerCase();
  const link = org.public_orders_enabled ? publicOrderUrl(org.slug) : null;
  const appointments = config.profile === 'appointments';
  const [dayStart] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  });
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const agenda = useAgenda(orgId, dayStart.toISOString(), dayEnd.toISOString(), appointments);
  const todayAgenda = agenda.data ?? [];
  const next = todayAgenda.find((a) => canRemind(a));
  const conflicts = overlapping(todayAgenda);
  const setup = useSetupStatus(orgId, config);
  const [setupHidden, setSetupHidden] = useDeviceFlag(`gf.setup.hidden.${orgId}`);
  const refetchSetup = setup.refetch;
  // Ao voltar de um cadastro, os primeiros passos se atualizam.
  useFocusEffect(
    useCallback(() => {
      refetchSetup();
    }, [refetchSetup]),
  );
  const attention = [...(late.data ?? []), ...(today.data ?? []).filter((t) => !late.data?.some((l) => l.id === t.id))];

  return (
    <Screen>
      <View style={styles.header}>
        <Image source={logo} style={styles.logo} accessibilityIgnoresInvertColors />
        <View style={styles.headerText}>
          <Text style={styles.date}>{formatLongToday()}</Text>
          <Text style={styles.greeting} accessibilityRole="header">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Configurações" onPress={() => router.push('/configuracoes')} style={styles.circle}>
          <Settings size={20} color={colors.ink} />
        </Pressable>
      </View>

      <View style={styles.hero}>
        <View style={styles.glow} pointerEvents="none" />
        <Text style={styles.kicker}>{org.name.toUpperCase()}</Text>
        {appointments ? (
          <>
            <Text style={styles.heroLabel}>{config.tabLabels.pedidos} hoje</Text>
            <Text style={styles.heroValue}>{agenda.data ? todayAgenda.length : '–'}</Text>
            <View style={styles.heroRow}>
              <Text style={styles.heroSub}>
                {next ? `Próximo às ${formatTimeBR(new Date(next.scheduled_for!))}${next.customer_name ? ` · ${next.customer_name.split(' ')[0]}` : ''}` : ' '}
              </Text>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.heroLabel}>{config.tabLabels.pedidos} em aberto</Text>
            <Text style={styles.heroValue}>{c ? c.open : '–'}</Text>
            <View style={styles.heroRow}>
              <Text style={styles.heroSub}>{c ? `${c.today} para hoje` : ' '}</Text>
              <Text style={styles.heroSub}>{c ? `${c.late} atrasados` : ' '}</Text>
            </View>
          </>
        )}
      </View>

      <View style={styles.actions}>
        {appointments ? (
          <QuickAction label={`Novo ${config.orderNoun}`} primary onPress={() => router.push('/horarios/novo')} icon={<CalendarPlus size={22} color={colors.white} />} />
        ) : (
          <QuickAction label={`Novo ${config.orderNoun}`} primary onPress={() => router.push('/pedidos/novo')} icon={<ReceiptText size={22} color={colors.white} />} />
        )}
        <QuickAction
          label="Venda rápida"
          onPress={() => router.push('/financeiro/venda-rapida')}
          icon={<BadgeDollarSign size={22} color={colors.primaryText} />}
        />
        <QuickAction label={config.clientsLabel} onPress={() => router.push('/clientes')} icon={<Users size={22} color={colors.primaryText} />} />
        <QuickAction
          label={org.business_type === 'services' ? 'Serviços' : 'Itens'}
          onPress={() => router.push(org.business_type === 'services' ? '/itens' : '/estoque')}
          icon={<Package size={22} color={colors.primaryText} />}
        />
        {link ? (
          <QuickAction
            label="Link de encomenda"
            onPress={() => Share.share({ message: `Faça seu pedido para ${org.name}: ${link}` })}
            icon={<Link2 size={22} color={colors.primaryText} />}
          />
        ) : null}
      </View>

      {setup.status && setupHidden === false ? <SetupCard config={config} status={setup.status} onHide={() => setSetupHidden(true)} /> : null}

      <RemindersCard />

      <DasCard />

      {!appointments && c && c.late > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/pedidos')} style={styles.lateBanner}>
          <Text style={styles.lateTitle}>
            {c.late === 1 ? `1 ${config.orderNoun} atrasado` : `${c.late} ${plural} atrasados`}
          </Text>
          <Text style={styles.lateSub}>Toque para ver e avisar os clientes</Text>
        </Pressable>
      ) : null}

      {appointments ? (
        <Card style={styles.list}>
          <Text style={styles.cardTitle}>Agenda de hoje</Text>
          <QueryStates
            query={agenda}
            isEmpty={todayAgenda.length === 0}
            empty={{ icon: CalendarPlus, title: 'Nenhum horário hoje.', description: 'Os horários marcados para hoje aparecem aqui.' }}
          />
          {todayAgenda.map((a, i) => (
            <AgendaRow key={a.id} item={a} first={i === 0} conflict={conflicts.has(a.id)} />
          ))}
        </Card>
      ) : (
      <Card style={styles.list}>
        <Text style={styles.cardTitle}>Para hoje</Text>
        <QueryStates
          query={today.isPending || late.isPending ? { ...today, isPending: true } : late.error ? late : today}
          isEmpty={attention.length === 0}
          empty={{ icon: ReceiptText, title: 'Nada com prazo para hoje.', description: `${config.tabLabels.pedidos} atrasados e com prazo hoje aparecem aqui.` }}
        />
        {attention.map((o, i) => (
          <View key={o.id} style={i > 0 && styles.divider}>
            <OrderRow order={o} config={config} />
          </View>
        ))}
      </Card>
      )}

      <MoneyCard orgId={orgId} />

      {lowItems.length > 0 ? (
        <Card style={styles.list}>
          <Text style={styles.cardTitle}>Estoque baixo</Text>
          {lowItems.slice(0, 5).map((p, i) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/itens/[id]', params: { id: p.id } })}
              style={({ pressed }) => [styles.lowRow, i > 0 && styles.divider, pressed && styles.pressed]}
            >
              <Text style={styles.lowName} numberOfLines={1}>
                {p.name}
              </Text>
              <Text style={styles.lowQty}>
                {formatQuantity(p.stock_qty)} / mín. {formatQuantity(p.min_stock)} {p.unit}
              </Text>
              <ChevronRight size={16} color={colors.gray400} />
            </Pressable>
          ))}
          {lowItems.length > 5 ? (
            <Text style={styles.more}>
              + {lowItems.length - 5} {lowItems.length - 5 === 1 ? 'item' : 'itens'} para repor
            </Text>
          ) : null}
        </Card>
      ) : null}

      {todayTasks.length > 0 ? (
        <Card style={styles.list}>
          <Text style={styles.cardTitle}>Tarefas de hoje</Text>
          {todayTasks.slice(0, 5).map((t, i) => (
            <TaskRow key={t.id} task={t} first={i === 0} orderNoun={config.orderNoun} />
          ))}
          {todayTasks.length > 5 ? (
            <Pressable accessibilityRole="button" onPress={() => router.push('/tarefas')}>
              <Text style={styles.more}>
                + {todayTasks.length - 5} {todayTasks.length - 5 === 1 ? 'tarefa' : 'tarefas'} para hoje
              </Text>
            </Pressable>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}

function QuickAction({ label, icon, onPress, primary }: { label: string; icon: ReactNode; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.action}>
      <View style={[styles.actionTile, primary && styles.actionTilePrimary]}>{icon}</View>
      <Text style={styles.actionLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 44, height: 44, borderRadius: 14 },
  headerText: { flex: 1 },
  date: { fontFamily: fonts.semibold, fontSize: 12, color: colors.gray500 },
  greeting: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.ink },
  circle: { width: minTouch, height: minTouch, borderRadius: minTouch / 2, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  hero: { backgroundColor: colors.ink, borderRadius: radius.hero, padding: 20, gap: 4, overflow: 'hidden' },
  glow: { position: 'absolute', top: -120, right: -90, width: 240, height: 240, borderRadius: 120, backgroundColor: colors.primary, opacity: 0.45 },
  kicker: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 2.6, color: colors.primary },
  heroLabel: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gray300, marginTop: 6 },
  heroValue: { fontFamily: fonts.extrabold, fontSize: 34, letterSpacing: -0.7, color: colors.white },
  heroRow: { flexDirection: 'row', gap: 16 },
  heroSub: { fontFamily: fonts.semibold, fontSize: 13, color: colors.primarySoft },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, alignItems: 'center', gap: 6 },
  actionTile: { width: 56, height: 56, borderRadius: radius.quickAction, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  actionTilePrimary: { backgroundColor: colors.primary },
  actionLabel: { fontFamily: fonts.bold, fontSize: 12, color: colors.ink, textAlign: 'center' },
  lateBanner: { backgroundColor: colors.primary, borderRadius: 20, padding: 16, gap: 2 },
  lateTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.white },
  lateSub: { fontFamily: fonts.medium, fontSize: 12, color: colors.white },
  list: { gap: 0 },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink, marginBottom: 6 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  pressed: { backgroundColor: colors.rowPressed },
  lowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingVertical: 8 },
  lowName: { flex: 1, fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  lowQty: { fontFamily: fonts.extrabold, fontSize: 13, color: colors.primaryText },
  more: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500, paddingTop: 8 },
});
