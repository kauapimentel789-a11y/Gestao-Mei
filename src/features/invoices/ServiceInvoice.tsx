// Nota fiscal (NFS-e) no detalhe do serviço. Com o certificado conectado
// (Configurações → Nota fiscal automática), a nota sai com um toque pelo
// Emissor Nacional. Sem ele: dados prontos para copiar no site do governo e o
// registro do número da nota emitida.
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Copy, ExternalLink, FileText, Zap } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

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
import { nfseErrorText, useCancelNfse, useEmitNfse, useNfsePdf, useNfseSettings } from './emissor';
import { EMISSOR_NACIONAL_URL, invoiceAmount, invoiceDescription, isValidInvoiceNumber, normalizeInvoiceNumber, NFSE_CONSULTA_URL } from './logic';

function isoDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Abre o PDF da nota numa aba nova (só na versão web). */
function openPdf(base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  window.open(url, '_blank');
}

export function ServiceInvoice({ order: o }: { order: OrderDetail }) {
  const { orgId } = useOrg();
  const invoices = useOrderInvoices(orgId, o.id);
  const customer = useCustomer(orgId, o.customer?.id ?? '');
  const toast = useToast();
  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null);
  const cancel = useCancelInvoice(orgId);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const nfse = useNfseSettings(orgId);
  const emit = useEmitNfse(orgId);
  const cancelNfse = useCancelNfse(orgId);
  const pdf = useNfsePdf();
  const [emitError, setEmitError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);

  // Sem a atualização do banco (tabela ainda não existe), o cartão não aparece.
  if (invoices.isPending || invoices.error) return null;
  const active = invoices.data.find((i) => !i.cancelled_at) ?? null;
  const cancelled = invoices.data.filter((i) => i.cancelled_at);
  if (o.status === 'cancelled' && invoices.data.length === 0) return null;
  if (o.total_cents <= 0 && !active) return null;

  const doc = customer.data?.document ?? null;
  const automatic = !!nfse.data?.connected;
  const fromApp = !!active?.access_key;
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
          {fromApp ? (
            <>
              {Platform.OS === 'web' ? (
                <Button
                  size="medium"
                  variant="tint"
                  label="Ver o PDF da nota"
                  loading={pdf.isPending}
                  onPress={() =>
                    pdf.mutate(active.id, {
                      onSuccess: (r) => openPdf(r.pdf_base64),
                      onError: (e) => toast(nfseErrorText(e)),
                    })
                  }
                />
              ) : null}
              <CopyRow label="Chave de acesso" value={active.access_key!} onCopy={() => copy('Chave', active.access_key!)} />
              <Button size="medium" variant="outline" label="Consultar no site do governo" onPress={() => Linking.openURL(NFSE_CONSULTA_URL)} />
            </>
          ) : (
            <Button size="medium" variant="outline" label="Abrir o Emissor Nacional" onPress={() => Linking.openURL(EMISSOR_NACIONAL_URL)} />
          )}
          <Pressable accessibilityRole="button" onPress={() => setCancelTarget(active)} style={styles.link}>
            <Text style={styles.linkText}>{fromApp && automatic ? 'Cancelar esta nota' : 'Cancelei esta nota no Emissor'}</Text>
          </Pressable>
        </>
      ) : o.status === 'cancelled' ? null : automatic && !manual ? (
        <>
          <Text style={styles.body}>
            {o.customer ? `Para ${o.customer.name}${doc ? ` (${documentLabel(doc)} ${formatDocument(doc)})` : ''}` : 'Sem tomador identificado'} ·{' '}
            {formatCents(o.total_cents)}
          </Text>
          <Text style={styles.hint}>{invoiceDescription(o.items, o.number)}</Text>
          {o.customer && !doc && customer.data ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/clientes/form', params: { id: o.customer!.id } })}
              style={styles.link}
            >
              <Text style={styles.linkText}>Adicionar CPF ou CNPJ de {o.customer.name.split(' ')[0]} (opcional)</Text>
            </Pressable>
          ) : null}
          {emitError ? <Text style={styles.error}>{emitError}</Text> : null}
          <Button
            label="Emitir nota agora"
            trailing={<Zap size={18} color={colors.white} />}
            loading={emit.isPending}
            onPress={() => {
              setEmitError(null);
              emit.mutate(o.id, {
                onSuccess: (r) => toast(`Nota nº ${r.number} emitida`),
                onError: (e) => setEmitError(nfseErrorText(e)),
              });
            }}
          />
          <Pressable accessibilityRole="button" onPress={() => setManual(true)} style={styles.link}>
            <Text style={styles.linkText}>Prefiro emitir no site do Emissor</Text>
          </Pressable>
        </>
      ) : (
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
          {!automatic ? (
            <Pressable accessibilityRole="button" onPress={() => router.push('/nota-fiscal')} style={styles.link}>
              <Text style={styles.linkText}>Emitir com um toque, sem copiar e colar</Text>
            </Pressable>
          ) : null}
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
        title={`Cancelar a nota nº ${cancelTarget?.number ?? ''}?`}
        description={
          cancelTarget?.access_key && automatic
            ? 'A nota é cancelada no Emissor Nacional na hora. Aqui ela fica no histórico com o motivo, e o atendimento pode receber outra nota.'
            : 'Use quando você já cancelou a nota no Emissor Nacional. Aqui ela fica no histórico com o motivo, e o pedido pode receber outra nota.'
        }
        confirmLabel={cancelTarget?.access_key && automatic ? 'Cancelar a nota' : 'Marcar como cancelada'}
        keepLabel="Voltar"
        placeholder="Ex.: valor digitado errado"
        loading={cancel.isPending || cancelNfse.isPending}
        error={cancelError}
        onClose={() => {
          setCancelTarget(null);
          setCancelError(null);
        }}
        onConfirm={(reason) => {
          if (!cancelTarget) return;
          setCancelError(null);
          const done = {
            onSuccess: () => {
              setCancelTarget(null);
              toast('Nota cancelada');
            },
          };
          if (cancelTarget.access_key && automatic) {
            if (reason.trim().length < 15) return setCancelError('O governo pede um motivo com pelo menos 15 letras.');
            cancelNfse.mutate(
              { invoiceId: cancelTarget.id, reasonCode: 9, reason: reason.trim() },
              { ...done, onError: (e) => setCancelError(nfseErrorText(e)) },
            );
            return;
          }
          cancel.mutate({ id: cancelTarget.id, reason }, { ...done, onError: (e) => setCancelError(friendlyError(e)) });
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
          <TextField label="Emitida em" value={date} onChangeText={setDate} mask="date" />
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
  error: { fontFamily: fonts.semibold, fontSize: 13, color: colors.danger, lineHeight: 18 },
  history: { gap: 4, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 10 },
});
