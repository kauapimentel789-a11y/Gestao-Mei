import { Landmark } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Modal, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chips } from '@/components/Chips';
import { TextField } from '@/components/TextField';
import { TextLink } from '@/components/TextLink';
import { useToast } from '@/components/Toast';
import { useAccounts, useCategories, useCreateEntry } from '@/features/finance/api';
import { toISODate } from '@/features/finance/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { friendlyError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { formatCents, parseBRLToCents } from '@/lib/money';
import { useDeviceFlag } from '@/lib/useDeviceFlag';
import { colors, fonts, radius, shadows } from '@/theme/tokens';

import { useDasStatus } from './api';
import { currentDasPeriod, type DasPeriod, dasDescription, dasDueText, PGMEI_URL } from './logic';

/**
 * Lembrete do DAS na Início: aparece enquanto a guia do mês anterior não foi
 * lançada como paga. Some com "Já paguei" ou "Não tenho guia este mês".
 */
export function DasCard() {
  const { orgId } = useOrg();
  const [period] = useState(() => currentDasPeriod());
  const status = useDasStatus(orgId, period);
  const [skipped, setSkipped] = useDeviceFlag(`gf.das.skip.${orgId}.${period.key}`);
  const [open, setOpen] = useState(false);

  if (!status.data || status.data.registered || skipped !== false) return null;

  return (
    <Card style={period.overdue ? styles.overdue : undefined}>
      <View style={styles.head}>
        <Landmark size={20} color={colors.primaryText} />
        <Text style={styles.title}>DAS de {period.label}</Text>
      </View>
      <Text style={styles.body}>
        {dasDueText(period)} A guia mensal do MEI garante seu INSS e mantém o CNPJ em dia.
      </Text>
      <View style={styles.actions}>
        <Button size="medium" label="Já paguei" onPress={() => setOpen(true)} />
        <Button size="medium" variant="tint" label="Gerar a guia" onPress={() => Linking.openURL(PGMEI_URL)} />
      </View>
      <TextLink label="Não tenho guia este mês" onPress={() => setSkipped(true)} />
      <DasPaidDialog
        key={open ? 'open' : 'closed'}
        visible={open}
        period={period}
        suggestedCents={status.data.lastAmountCents}
        onClose={() => setOpen(false)}
      />
    </Card>
  );
}

function DasPaidDialog({
  visible,
  period,
  suggestedCents,
  onClose,
}: {
  visible: boolean;
  period: DasPeriod;
  suggestedCents: number | null;
  onClose: () => void;
}) {
  const { orgId } = useOrg();
  const accounts = useAccounts(orgId);
  const categories = useCategories(orgId);
  const create = useCreateEntry(orgId);
  const toast = useToast();
  const [amount, setAmount] = useState(suggestedCents ? formatCents(suggestedCents).replace(/R\$\s?/, '') : '');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [key] = useState(newId);
  const active = (accounts.data ?? []).filter((a) => a.active);
  const chosen = accountId ?? active.find((a) => a.kind !== 'cash')?.id ?? active[0]?.id ?? null;
  const category = (categories.data ?? []).find((c) => c.active && c.direction === 'payable' && c.nature === 'tax');

  const save = async () => {
    const cents = parseBRLToCents(amount);
    if (!cents || cents <= 0) return setError('Informe o valor pago.');
    if (!chosen) return setError('Cadastre uma conta em Financeiro antes.');
    if (!category) return setError('Falta a categoria de impostos. Crie uma em Financeiro → Categorias.');
    setError(undefined);
    const today = toISODate(new Date());
    try {
      await create.mutateAsync({
        direction: 'payable',
        description: dasDescription(period),
        amountCents: cents,
        categoryId: category.id,
        dueDate: today < period.dueDate ? today : period.dueDate,
        competenceDate: period.from,
        customerId: null,
        supplierId: null,
        notes: '',
        idempotencyKey: key,
        paid: { accountId: chosen, method: 'pix', paidOn: today },
      });
      toast('DAS registrado');
      onClose();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>Pagou o DAS de {period.label}?</Text>
          <Text style={styles.body}>O valor entra como despesa em Impostos (DAS), com a data de hoje.</Text>
          <TextField label="Valor pago (R$)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" error={error} />
          {active.length > 1 ? (
            <>
              <Text style={styles.label}>Saiu de</Text>
              <Chips accessibilityLabel="Conta" value={chosen} onChange={setAccountId} options={active.map((a) => ({ value: a.id, label: a.name }))} />
            </>
          ) : null}
          <Button variant="ink" size="medium" label="Voltar" onPress={onClose} />
          <Button size="medium" label="Registrar pagamento" loading={create.isPending} onPress={save} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overdue: { borderWidth: 2, borderColor: colors.primary },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 13, color: colors.gray600, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  label: { fontFamily: fonts.semibold, fontSize: 13, color: colors.gray500 },
  backdrop: { flex: 1, backgroundColor: 'rgba(11,11,15,0.45)', justifyContent: 'center', padding: 20 },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 20, gap: 12, ...shadows.card },
  dialogTitle: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.ink },
});
