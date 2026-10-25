// Nota fiscal (NFS-e) no detalhe do serviço: dados prontos para copiar no
// Emissor Nacional, botão para abrir o site do governo e o registro do número
// da nota emitida. O app não emite a nota.
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Copy, ExternalLink, FileText } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { FormError } from '@/components/FormError';
import { ReasonDialog } from '@/components/ReasonDialog';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useCustomer } from '@/features/customers/api';
import { formatISODate } from '@/features/finance/logic';
import type { OrderDetail } from '@/features/orders/api';
import { useOrg } from '@/features/organizations/useOrg';
import { formatDateBR, parseDateTimeBR } from '@/lib/dates';
import { documentLabel, formatDocument } from '@/lib/document';
import { friendlyError } from '@/lib/errors';
import { formatCents } from '@/lib/money';
import { colors, fonts, radius } from '@/theme/tokens';

import { type ServiceInvoice as Invoice, useCancelInvoice, useOrderInvoices, useRegisterInvoice } from './api';
import { EMISSOR_NACIONAL_URL, invoiceAmount, invoiceDescription, isValidInvoiceNumber, normalizeInvoiceNumber } from './logic';

function isoDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function ServiceInvoice({ order: o }: { order: OrderDetail }) {
  const { orgId } = useOrg();
  const invoices = useOrderInvoices(orgId, o.id);
  const customer = useCustomer(orgId, o.customer?.id ?? '');
  const toast = useToast();
  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null);
  const cancel = useCancelInvoice(orgId);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Sem a atualização do banco (tabela ainda não existe), o cartão não aparece.
  if (invoices.isPending || invoices.error) return null;
  const active = invoices.data.find((i) => !i.cancelled_at) ?? null;
  const cancelled = invoices.data.filter((i) => i.cancelled_at);
  if (o.status === 'cancelled' && invoices.data.length === 0) return null;
  if (o.total_cents <= 0 && !active) return null;

  const doc = customer.data?.document ?? null;
  const copy = async (label: string, value: string) => {
    await Clipboard.setStringAsync(value);
    toast(`${label} copiado`);
  };

  return (
    <Card>
      <View style={styles.titleRow}>
        <FileText size={18} color={colors.primaryText} />
        <Text style={styles.cardTitle}>Nota fiscal</Text>
      </View>

      {active ? (
        <>
          <Text style={styles.body}>
            Nota nº {active.number}, emitida em {formatISODate(active.issued_on)}, de {formatCents(active.amount_cents)}.
          </Text>
          <Button size="medium" variant="outline" label="Abrir o Emissor Nacional" onPress={() => Linking.openURL(EMISSOR_NACIONAL_URL)} />
          <Pressable accessibilityRole="button" onPress={() => setCancelTarget(active)} style={styles.link}>
            <Text style={styles.linkText}>Cancelei esta nota no Emissor</Text>
          </Pressable>
        </>
      ) : o.status === 'cancelled' ? null : (
        <>
          <Text style={styles.body}>
            Emita a nota de graça no Emissor Nacional (gov.br). Toque num dado para copiar e colar lá. Depois, anote aqui o número da nota.
          </Text>
          <View style={styles.rows}>
            {o.customer ? (
              <CopyRow label="Tomador" value={o.customer.name} onCopy={() => copy('Nome', o.customer!.name)} />
            ) : (
              <Text style={styles.hint}>Sem cliente neste pedido. No Emissor, a nota pode sair sem tomador identificado.</Text>
            )}
            {o.customer ? (
              doc ? (
                <CopyRow label={documentLabel(doc)} value={formatDocument(doc)} onCopy={() => copy(documentLabel(doc), doc)} />
              ) : customer.data ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/clientes/form', params: { id: o.customer!.id } })}
                  style={styles.link}
                >
                  <Text style={styles.linkText}>Adicionar CPF ou CNPJ de {o.customer.name.split(' ')[0]}</Text>
                </Pressable>
              ) : null
            ) : null}
            <CopyRow
              label="Descrição"
              value={invoiceDescription(o.items, o.number)}
              onCopy={() => copy('Descrição', invoiceDescription(o.items, o.number))}
            />
            <CopyRow label="Valor" value={formatCents(o.total_cents)} onCopy={() => copy('Valor', invoiceAmount(o.total_cents))} />
          </View>
          <Button
            size="medium"
            variant="tint"
            label="Abrir o Emissor Nacional"
            trailing={<ExternalLink size={18} color={colors.primaryText} />}
            onPress={() => Linking.openURL(EMISSOR_NACIONAL_URL)}
          />
          <RegisterForm orderId={o.id} />
        </>
      )}

      {cancelled.length > 0 ? (
        <View style={styles.history}>
          {cancelled.map((i) => (
            <Text key={i.id} style={styles.hint}>
              Nota nº {i.number} cancelada · {i.cancel_reason}
            </Text>
          ))}
        </View>
      ) : null}

      <ReasonDialog
        visible={cancelTarget !== null}
        title={`Nota nº ${cancelTarget?.number ?? ''} cancelada?`}
        description="Use quando você já cancelou a nota no Emissor Nacional. Aqui ela fica no histórico com o motivo, e o pedido pode receber outra nota."
        confirmLabel="Marcar como cancelada"
        keepLabel="Voltar"
        placeholder="Ex.: valor errado"
        loading={cancel.isPending}
        error={cancelError}
        onClose={() => {
          setCancelTarget(null);
          setCancelError(null);
        }}
        onConfirm={(reason) => {
          if (!cancelTarget) return;
          setCancelError(null);
          cancel.mutate(
            { id: cancelTarget.id, reason },
            {
              onSuccess: () => {
                setCancelTarget(null);
                toast('Nota marcada como cancelada');
              },
              onError: (e) => setCancelError(friendlyError(e)),
            },
          );
        }}
      />
    </Card>
  );
}

function RegisterForm({ orderId }: { orderId: string }) {
  const { orgId } = useOrg();
  const register = useRegisterInvoice(orgId);
  const toast = useToast();
  const [number, setNumber] = useState('');
  const [date, setDate] = useState(() => formatDateBR(new Date()));
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (!isValidInvoiceNumber(number)) return setError('Informe o número da nota (só letras, números, ponto, barra ou hífen).');
    const day = parseDateTimeBR(date);
    if (!day) return setError('Informe a data de emissão como dd/mm/aaaa.');
    register.mutate(
      { orderId, number: normalizeInvoiceNumber(number), issuedOn: isoDay(day) },
      {
        onSuccess: () => toast('Nota registrada'),
        onError: (e) => setError(friendlyError(e)),
      },
    );
  };

  return (
    <View style={styles.form}>
      <Text style={styles.subTitle}>Já emitiu?</Text>
      <View style={styles.formRow}>
        <View style={styles.flex}>
          <TextField label="Número da nota" value={number} onChangeText={setNumber} autoCapitalize="characters" maxLength={30} />
        </View>
        <View style={styles.flex}>
          <TextField label="Emitida em" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" maxLength={10} />
        </View>
      </View>
      <FormError message={error} />
      <Button size="medium" label="Registrar nota" loading={register.isPending} disabled={number.trim().length === 0} onPress={submit} />
    </View>
  );
}

function CopyRow({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Copiar ${label}`}
      onPress={onCopy}
      style={({ pressed }) => [styles.copyRow, pressed && styles.pressed]}
    >
      <View style={styles.flex}>
        <Text style={styles.copyLabel}>{label}</Text>
        <Text style={styles.copyValue}>{value}</Text>
      </View>
      <Copy size={18} color={colors.gray500} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  subTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
  hint: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500, lineHeight: 17 },
  rows: { gap: 8 },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  pressed: { opacity: 0.7 },
  copyLabel: { fontFamily: fonts.bold, fontSize: 11, color: colors.gray500, textTransform: 'uppercase', letterSpacing: 0.5 },
  copyValue: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  flex: { flex: 1, gap: 2 },
  form: { gap: 10, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 12 },
  formRow: { flexDirection: 'row', gap: 10 },
  link: { minHeight: 40, justifyContent: 'center' },
  linkText: { fontFamily: fonts.bold, fontSize: 14, color: colors.primaryText },
  history: { gap: 4, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 10 },
});
