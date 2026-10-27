import { router } from 'expo-router';
import { ArrowLeftRight, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chips } from '@/components/Chips';
import { CircleButton, DetailBar } from '@/components/DetailBar';
import { FormError } from '@/components/FormError';
import { QueryStates } from '@/components/ListStates';
import { ReasonDialog } from '@/components/ReasonDialog';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { type Transfer, useAccounts, useCreateAccount, useReverseTransfer, useTransfers, useUpdateAccount } from './api';
import { ACCOUNT_KIND_LABEL, type AccountKind, formatISODate, parseDateInput } from './logic';
import { useSpace } from '@/features/organizations/useOrg';
import { formatDateBR } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { formatCents, parseBRLToCents } from '@/lib/money';
import { colors, fonts, radius, shadows } from '@/theme/tokens';

/** Contas e transferências. Na aba de "Minhas finanças" (`tab`) não tem botão de voltar. */
export function AccountsScreen({ tab = false }: { tab?: boolean }) {
  const { orgId } = useSpace();
  const accounts = useAccounts(orgId);
  const transfers = useTransfers(orgId);
  const update = useUpdateAccount(orgId);
  const reverse = useReverseTransfer(orgId);
  const toast = useToast();
  const [newOpen, setNewOpen] = useState(false);
  const [reversing, setReversing] = useState<Transfer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = accounts.data ?? [];
  const name = (id: string) => list.find((a) => a.id === id)?.name ?? 'Conta';
  const reversed = new Set((transfers.data ?? []).map((t) => t.reverses_transfer_id).filter((x): x is number => x != null));

  return (
    <Screen>
      {tab ? (
        <View style={styles.tabHeader}>
          <View style={styles.flex}>
            <Text style={styles.tabTitle} accessibilityRole="header">
              Contas
            </Text>
            <Text style={styles.muted}>Carteira, banco e onde mais você guarda dinheiro</Text>
          </View>
          <CircleButton label="Nova conta" icon={<Plus size={20} color={colors.ink} />} onPress={() => setNewOpen(true)} />
        </View>
      ) : (
        <DetailBar title="Contas" right={<CircleButton label="Nova conta" icon={<Plus size={20} color={colors.ink} />} onPress={() => setNewOpen(true)} />} />
      )}

      <Card style={styles.list}>
        <QueryStates query={accounts} isEmpty={list.length === 0} empty={{ icon: Plus, title: 'Nenhuma conta', action: { label: 'Nova conta', onPress: () => setNewOpen(true) } }} />
        {list.map((a, i) => (
          <View key={a.id} style={[styles.row, i > 0 && styles.divider, !a.active && styles.inactive]}>
            <View style={styles.flex}>
              <Text style={styles.name}>{a.name}</Text>
              <Text style={styles.muted}>
                {ACCOUNT_KIND_LABEL[a.kind]} · inicial {formatCents(a.opening_balance_cents)} em {formatISODate(a.opening_date)}
              </Text>
            </View>
            <View style={styles.right}>
              <Text style={[styles.balance, a.balance_cents < 0 && styles.negative]}>{formatCents(a.balance_cents)}</Text>
              <Switch
                value={a.active}
                onValueChange={async (active) => {
                  setError(null);
                  try {
                    await update.mutateAsync({ id: a.id, active });
                  } catch (e) {
                    setError(friendlyError(e));
                  }
                }}
                trackColor={{ true: colors.primary }}
                accessibilityLabel={`Conta ${a.name} ativa`}
              />
            </View>
          </View>
        ))}
      </Card>
      <Text style={styles.note}>
        O saldo é calculado pelo app (saldo inicial + recebimentos − pagamentos ± transferências) e não é lido do banco. Contas inativas não aparecem nos
        lançamentos, mas continuam no histórico.
      </Text>
      <FormError message={error} />

      <Button
        variant="tint"
        label="Transferir entre contas"
        trailing={<ArrowLeftRight size={18} color={colors.primaryText} />}
        disabled={list.filter((a) => a.active).length < 2}
        onPress={() => router.push('/financeiro/transferir')}
      />

      <Card style={styles.list}>
        <Text style={styles.cardTitle}>Transferências</Text>
        {(transfers.data ?? []).length === 0 ? <Text style={styles.muted}>Nenhuma transferência. Elas não contam como receita nem despesa.</Text> : null}
        {(transfers.data ?? []).map((t, i) => (
          <View key={t.id} style={[styles.row, i > 0 && styles.divider]}>
            <View style={styles.flex}>
              <Text style={styles.name}>
                {name(t.from_account_id)} → {name(t.to_account_id)}
                {reversed.has(t.id) ? <Text style={styles.tag}>  estornada</Text> : null}
              </Text>
              <Text style={styles.muted}>
                {formatISODate(t.transfer_date)}
                {t.description ? ` · ${t.description}` : ''}
              </Text>
            </View>
            <View style={styles.right}>
              <Text style={styles.balance}>{formatCents(t.amount_cents)}</Text>
              {!t.reverses_transfer_id && !reversed.has(t.id) ? (
                <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setReversing(t)}>
                  <Text style={styles.reverse}>Estornar</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      </Card>

      <NewAccountDialog
        visible={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={() => {
          setNewOpen(false);
          toast('Conta criada');
        }}
      />

      <ReasonDialog
        key={reversing?.id}
        visible={reversing !== null}
        title="Estornar transferência?"
        description="Será lançada a transferência inversa. A original continua no histórico."
        keepLabel="Voltar"
        confirmLabel="Estornar"
        loading={reverse.isPending}
        error={error}
        onClose={() => setReversing(null)}
        onConfirm={async (reason) => {
          if (!reversing) return;
          try {
            await reverse.mutateAsync({ transferId: reversing.id, reason });
            setReversing(null);
            toast('Transferência estornada');
          } catch (e) {
            setError(friendlyError(e));
          }
        }}
      />
    </Screen>
  );
}

function NewAccountDialog({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: () => void }) {
  const { orgId } = useSpace();
  const create = useCreateAccount(orgId);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('bank');
  const [opening, setOpening] = useState('');
  const [negative, setNegative] = useState(false);
  const [date, setDate] = useState(formatDateBR(new Date()));
  const [errs, setErrs] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const cents = opening.trim() ? parseBRLToCents(opening) : 0;
    const iso = parseDateInput(date);
    const next: Record<string, string | undefined> = {};
    if (name.trim().length < 2) next.name = 'Informe o nome.';
    if (cents === null) next.opening = 'Valor inválido.';
    if (!iso) next.date = 'Use o formato dd/mm/aaaa.';
    setErrs(next);
    if (Object.values(next).some(Boolean) || cents === null || !iso) return;
    setError(null);
    try {
      await create.mutateAsync({ name, kind, openingCents: negative ? -cents : cents, openingDate: iso });
      setName('');
      setOpening('');
      onCreated();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Nova conta</Text>
            <TextField label="Nome" value={name} onChangeText={setName} placeholder="Ex.: Nubank, Carteira" error={errs.name} />
            <Chips accessibilityLabel="Tipo de conta" value={kind} onChange={setKind} options={(Object.keys(ACCOUNT_KIND_LABEL) as AccountKind[]).map((k) => ({ value: k, label: ACCOUNT_KIND_LABEL[k] }))} />
            <TextField label="Saldo inicial" value={opening} onChangeText={setOpening} keyboardType="decimal-pad" placeholder="0,00" error={errs.opening} hint="Não pode ser alterado depois." />
            <View style={styles.switchRow}>
              <Text style={styles.muted}>Saldo inicial negativo</Text>
              <Switch value={negative} onValueChange={setNegative} trackColor={{ true: colors.primary }} accessibilityLabel="Saldo inicial negativo" />
            </View>
            <TextField label="Data do saldo" value={date} onChangeText={setDate} placeholder="dd/mm/aaaa" keyboardType="numbers-and-punctuation" error={errs.date} />
            <FormError message={error} />
            <Button variant="ink" size="medium" label="Voltar" onPress={onClose} />
            <Button size="medium" label="Criar conta" loading={create.isPending} onPress={submit} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  tabHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tabTitle: { fontFamily: fonts.extrabold, fontSize: 26, letterSpacing: -0.5, color: colors.ink },
  flex: { flex: 1, gap: 2 },
  list: { gap: 0, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  inactive: { opacity: 0.55 },
  name: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  right: { alignItems: 'flex-end', gap: 6 },
  balance: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.ink },
  negative: { color: colors.primaryText },
  tag: { fontFamily: fonts.bold, fontSize: 11, color: colors.gray400 },
  reverse: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500, textDecorationLine: 'underline' },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink, marginBottom: 6 },
  note: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500, textAlign: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,11,15,0.45)' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 20, gap: 12, ...shadows.card },
  dialogTitle: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.ink },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
});
