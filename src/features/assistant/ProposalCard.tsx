// Lançamento sugerido pelo assistente: a pessoa confere e salva com um toque.
// Salvar usa o mesmo RPC da tela de lançamento (create_financial_entry).
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { FormError } from '@/components/FormError';
import { useCreateEntry } from '@/features/finance/api';
import { formatISODate } from '@/features/finance/logic';
import { friendlyError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { formatCents } from '@/lib/money';
import { colors, fonts, radius } from '@/theme/tokens';

import { type Proposal, proposalToEntry } from './logic';

export function ProposalCard({ orgId, proposal }: { orgId: string; proposal: Proposal }) {
  const create = useCreateEntry(orgId);
  const [key] = useState(newId);
  const [state, setState] = useState<'open' | 'saved' | 'dismissed'>('open');
  const [error, setError] = useState<string | null>(null);
  const out = proposal.direction === 'payable';

  const save = async () => {
    setError(null);
    try {
      await create.mutateAsync(proposalToEntry(proposal, key));
      setState('saved');
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const status = proposal.paid
    ? `${out ? 'Pago' : 'Recebido'}${proposal.account_name ? ` · ${proposal.account_name}` : ''}`
    : out
      ? 'A pagar'
      : 'A receber';

  return (
    <View style={[styles.card, state !== 'open' && styles.done]}>
      <Text style={styles.kicker}>{out ? 'GASTO' : 'RECEBIMENTO'}</Text>
      <View style={styles.row}>
        <Text style={styles.title} numberOfLines={2}>
          {proposal.description}
        </Text>
        <Text style={[styles.value, !out && styles.in]}>
          {out ? '−' : '+'} {formatCents(proposal.amount_cents)}
        </Text>
      </View>
      <Text style={styles.meta}>
        {proposal.category_name} · {formatISODate(proposal.date)} · {status}
      </Text>
      {state === 'saved' ? <Text style={styles.result}>Salvo ✓</Text> : null}
      {state === 'dismissed' ? <Text style={styles.result}>Não salvo</Text> : null}
      {state === 'open' ? (
        <>
          <FormError message={error} />
          <View style={styles.actions}>
            <View style={styles.flex}>
              <Button label="Salvar" size="medium" loading={create.isPending} onPress={save} />
            </View>
            <View style={styles.flex}>
              <Button label="Descartar" size="medium" variant="outline" disabled={create.isPending} onPress={() => setState('dismissed')} />
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.primarySoft, padding: 14, gap: 6 },
  done: { borderColor: colors.divider },
  kicker: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.6, color: colors.primaryText },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { flex: 1, fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  value: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  in: { color: colors.success },
  meta: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  result: { fontFamily: fonts.bold, fontSize: 13, color: colors.gray600 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  flex: { flex: 1 },
});
