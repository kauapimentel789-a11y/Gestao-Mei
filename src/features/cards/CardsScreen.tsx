// Aba "Cartões" de Minhas finanças: cada cartão com a fatura de agora e o
// limite usado. Tocar abre o cartão com todas as faturas.
import { router } from 'expo-router';
import { ChevronRight, CreditCard as CardIcon, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { CircleButton } from '@/components/DetailBar';
import { QueryStates } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { TextLink } from '@/components/TextLink';
import { useToast } from '@/components/Toast';
import { formatISODate } from '@/features/finance/logic';
import { useSpace } from '@/features/organizations/useOrg';
import { formatCents } from '@/lib/money';
import { colors, fonts } from '@/theme/tokens';

import { type CreditCard, type Statement, useCards, useCreateCard, useStatements } from './api';
import { CardDialog } from './CardDialog';
import { cardUsage, currentStatement, statementLabel } from './logic';
import { StatementChip } from './StatementChip';

export function CardsScreen() {
  const { orgId } = useSpace();
  const cards = useCards(orgId);
  const statements = useStatements(orgId);
  const create = useCreateCard(orgId);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const list = (cards.data ?? []).filter((c) => c.active);
  const inactive = (cards.data ?? []).length - list.length;

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            Cartões
          </Text>
          <Text style={styles.subtitle}>Faturas, parcelas e limite</Text>
        </View>
        <CircleButton label="Novo cartão" icon={<Plus size={20} color={colors.ink} />} onPress={() => setOpen(true)} />
      </View>

      <QueryStates
        query={cards}
        isEmpty={list.length === 0}
        empty={{
          icon: CardIcon,
          title: 'Nenhum cartão',
          description: 'Cadastre o cartão com o dia em que a fatura fecha e o dia em que vence. As compras caem na fatura certa sozinhas.',
          action: { label: 'Cadastrar cartão', onPress: () => setOpen(true) },
        }}
      />
      {list.map((c) => (
        <CardRow key={c.id} card={c} statements={(statements.data ?? []).filter((s) => s.card_id === c.id)} />
      ))}
      {inactive > 0 ? <Text style={styles.muted}>{inactive === 1 ? '1 cartão desativado' : `${inactive} cartões desativados`}</Text> : null}

      {list.length > 0 ? <TextLink label="Lançar compra parcelada" onPress={() => router.push('/financeiro/parcelado')} /> : null}

      <CardDialog
        key={open ? 'open' : 'closed'}
        visible={open}
        loading={create.isPending}
        onClose={() => setOpen(false)}
        onSave={async (input) => {
          await create.mutateAsync(input);
          setOpen(false);
          toast('Cartão cadastrado');
        }}
      />
    </Screen>
  );
}

function CardRow({ card, statements }: { card: CreditCard; statements: Statement[] }) {
  const current = currentStatement(statements);
  const usage = cardUsage(card.limit_cents, statements);
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/cartao/[id]', params: { id: card.id } })}>
      <Card>
        <View style={styles.cardHead}>
          <View style={styles.icon}>
            <CardIcon size={18} color={colors.primaryText} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.name}>{card.name}</Text>
            <Text style={styles.muted}>
              Fecha dia {card.closing_day} · vence dia {card.due_day}
            </Text>
          </View>
          <ChevronRight size={18} color={colors.gray500} />
        </View>
        {current ? (
          <View style={styles.statement}>
            <View style={styles.flex}>
              <Text style={styles.label}>{statementLabel(current.statement_month)}</Text>
              <Text style={styles.value}>{formatCents(current.status === 'paid' ? current.total_cents : current.open_cents)}</Text>
              <Text style={styles.muted}>vence {formatISODate(current.due_date)}</Text>
            </View>
            <StatementChip status={current.status} />
          </View>
        ) : (
          <Text style={styles.muted}>Nenhuma compra em aberto.</Text>
        )}
        {usage.ratio !== null && usage.available !== null ? (
          <>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${usage.ratio * 100}%` }, usage.ratio >= 0.9 && styles.fillWarn]} />
            </View>
            <Text style={styles.muted}>
              {formatCents(usage.used)} usados · {usage.available >= 0 ? `${formatCents(usage.available)} livres` : `${formatCents(-usage.available)} acima do limite`}
            </Text>
          </>
        ) : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: fonts.extrabold, fontSize: 26, letterSpacing: -0.5, color: colors.ink },
  subtitle: { fontFamily: fonts.medium, fontSize: 13, color: colors.gray500 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  statement: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.bg, borderRadius: 16, padding: 12 },
  label: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  value: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.ink },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.gray150, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  fillWarn: { backgroundColor: colors.danger },
});
