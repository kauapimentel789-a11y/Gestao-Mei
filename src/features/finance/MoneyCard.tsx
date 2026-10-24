import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { formatCents } from '@/lib/money';
import { colors, fonts } from '@/theme/tokens';

import { useFinanceSummary } from './api';
import { cashNet, periodFor } from './logic';

/**
 * "Seu dinheiro em outubro" na Início, em frases curtas: o que entrou, o que
 * saiu, o que sobrou, quanto o dono tirou e quanto falta receber.
 * Os números vêm de finance_summary; aqui só se escolhem as palavras.
 */
export function MoneyCard({ orgId }: { orgId: string }) {
  const [period] = useState(() => periodFor('month', 0));
  const summary = useFinanceSummary(orgId, period.from, period.to);
  const s = summary.data;
  if (!s) return null;
  const net = cashNet(s);
  const month = period.label.toLowerCase();
  const nothing = s.received_cents === 0 && s.paid_cents === 0 && s.open_receivable_cents === 0;

  return (
    <Card>
      <Pressable accessibilityRole="button" accessibilityLabel="Abrir financeiro" onPress={() => router.push('/financeiro')} style={styles.head}>
        <Text style={styles.title}>Seu dinheiro em {month}</Text>
        <ChevronRight size={18} color={colors.gray500} />
      </Pressable>
      {nothing ? (
        <Text style={styles.body}>Ainda não entrou nem saiu nada este mês. Use Venda rápida quando receber um valor.</Text>
      ) : (
        <>
          <View style={styles.cols}>
            <Col label="Entrou" value={formatCents(s.received_cents)} />
            <Col label="Saiu" value={formatCents(s.paid_cents)} />
            <Col label={net >= 0 ? 'Sobrou' : 'Faltou'} value={formatCents(Math.abs(net))} strong negative={net < 0} />
          </View>
          {s.owner_withdrawal_cents > 0 ? (
            <Text style={styles.body}>Você tirou {formatCents(s.owner_withdrawal_cents)} para você este mês (retirada do dono).</Text>
          ) : null}
          {net < 0 ? <Text style={styles.body}>Saiu mais do que entrou. Veja em Quem me deve se alguém pode pagar logo.</Text> : null}
        </>
      )}
      {s.open_receivable_cents > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/financeiro/quem-me-deve')} style={({ pressed }) => [styles.debt, pressed && styles.pressed]}>
          <View style={styles.flex}>
            <Text style={styles.debtTitle}>Clientes te devem {formatCents(s.open_receivable_cents)}</Text>
            <Text style={styles.debtSub}>
              {s.overdue_receivable_cents > 0 ? `${formatCents(s.overdue_receivable_cents)} já venceu. ` : ''}Toque para cobrar pelo WhatsApp.
            </Text>
          </View>
          <ChevronRight size={18} color={colors.primaryText} />
        </Pressable>
      ) : null}
      {s.overdue_payable_cents > 0 ? (
        <Text style={styles.warn}>Você tem {formatCents(s.overdue_payable_cents)} em contas vencidas para pagar.</Text>
      ) : null}
    </Card>
  );
}

function Col({ label, value, strong, negative }: { label: string; value: string; strong?: boolean; negative?: boolean }) {
  return (
    <View style={styles.col}>
      <Text style={styles.colLabel}>{label}</Text>
      <Text style={[styles.colValue, strong && styles.colStrong, negative && styles.negative]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  title: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 13, color: colors.gray600, lineHeight: 19 },
  cols: { flexDirection: 'row', gap: 8 },
  col: { flex: 1, gap: 2 },
  colLabel: { fontFamily: fonts.semibold, fontSize: 12, color: colors.gray500 },
  colValue: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  colStrong: { fontFamily: fonts.extrabold, fontSize: 17 },
  negative: { color: colors.primaryText },
  debt: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primaryTint, borderRadius: 16, padding: 14 },
  pressed: { backgroundColor: colors.primaryTintPressed },
  debtTitle: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.primaryText },
  debtSub: { fontFamily: fonts.medium, fontSize: 12, color: colors.primaryText },
  warn: { fontFamily: fonts.bold, fontSize: 13, color: colors.primaryText },
});
