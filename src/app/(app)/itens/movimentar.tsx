import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chips } from '@/components/Chips';
import { DetailBar } from '@/components/DetailBar';
import { ErrorCard } from '@/components/ErrorCard';
import { FormError } from '@/components/FormError';
import { Skeleton } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { useInventoryMove } from '@/features/inventory/api';
import { balanceAfter, type MoveMode, MOVEMENT_LABEL, movementTypesFor, reasonRequired } from '@/features/inventory/logic';
import { formatQuantity, parseQuantity } from '@/features/orders/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { useProduct } from '@/features/products/api';
import { friendlyError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { colors, fonts } from '@/theme/tokens';

const SUBMIT_LABEL: Record<MoveMode, string> = { in: 'Registrar entrada', out: 'Registrar saída', adjust: 'Salvar contagem' };

/** Aceita "0" na contagem (zerar o estoque); nas demais, só positivo. */
function parseCount(text: string): number | null {
  return /^0([.,]0{1,3})?$/.test(text.trim()) ? 0 : parseQuantity(text);
}

export default function MoveStockScreen() {
  const params = useLocalSearchParams<{ id: string; modo?: MoveMode }>();
  const { orgId, org } = useOrg();
  const product = useProduct(orgId, params.id);
  const save = useInventoryMove(orgId);
  const toast = useToast();

  const [mode, setModeState] = useState<MoveMode>(params.modo ?? 'in');
  const [type, setType] = useState(movementTypesFor(params.modo ?? 'in', org.business_type)[0]!);
  const [qtyText, setQtyText] = useState('');
  const [reason, setReason] = useState('');
  const [allowNegative, setAllowNegative] = useState(false);
  const [fieldError, setFieldError] = useState<{ qty?: string; reason?: string }>({});
  const [error, setError] = useState<string | null>(null);
  // Uma chave por tentativa de lançamento: reenvio (toque duplo, rede) não duplica.
  const [key, setKey] = useState(newId);

  const setMode = (m: MoveMode) => {
    setModeState(m);
    setType(movementTypesFor(m, org.business_type)[0]!);
    setAllowNegative(false);
    setFieldError({});
    setKey(newId());
  };

  const p = product.data;
  if (product.isPending) {
    return (
      <Screen>
        <DetailBar title="Movimentar estoque" />
        <Skeleton rows={3} />
      </Screen>
    );
  }
  if (product.error || !p) {
    return (
      <Screen>
        <DetailBar title="Movimentar estoque" />
        <ErrorCard message={friendlyError(product.error)} onRetry={() => product.refetch()} />
      </Screen>
    );
  }

  const qty = mode === 'adjust' ? parseCount(qtyText) : parseQuantity(qtyText);
  const after = qty !== null ? balanceAfter(p.stock_qty, mode, qty) : null;
  const goesNegative = mode === 'out' && after !== null && after < 0;
  const needsReason = reasonRequired(type);

  const onSubmit = async () => {
    const errs: { qty?: string; reason?: string } = {};
    if (qty === null) errs.qty = mode === 'adjust' ? 'Informe a quantidade contada.' : 'Informe uma quantidade maior que zero (até 3 casas).';
    else if (mode === 'adjust' && qty === Number(p.stock_qty)) errs.qty = 'A contagem é igual ao saldo atual.';
    if (needsReason && reason.trim().length < 3) errs.reason = 'Informe o motivo.';
    setFieldError(errs);
    if (errs.qty || errs.reason || qty === null) return;
    if (goesNegative && !allowNegative) {
      setError('O saldo ficaria negativo. Confirme abaixo se quiser registrar assim mesmo.');
      return;
    }
    setError(null);
    try {
      await save.mutateAsync(
        mode === 'adjust'
          ? { kind: 'adjust', productId: p.id, counted: qty, reason: reason.trim(), idempotencyKey: key }
          : { kind: 'move', productId: p.id, type, quantity: qty, reason: reason.trim(), allowNegative, idempotencyKey: key },
      );
      toast(mode === 'in' ? 'Entrada registrada' : mode === 'out' ? 'Saída registrada' : 'Contagem salva');
      router.back();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Screen>
      <DetailBar title="Movimentar estoque" />

      <Card>
        <Text style={styles.name}>{p.name}</Text>
        <Text style={styles.muted}>
          Saldo atual: {formatQuantity(p.stock_qty)} {p.unit}
        </Text>
      </Card>

      <SegmentedControl
        accessibilityLabel="Tipo de movimentação"
        value={mode}
        onChange={setMode}
        segments={[
          { value: 'in', label: 'Entrada' },
          { value: 'out', label: 'Saída' },
          { value: 'adjust', label: 'Ajuste' },
        ]}
      />

      <Card>
        {mode !== 'adjust' ? (
          <>
            <Text style={styles.label}>{mode === 'in' ? 'Origem' : 'Motivo da saída'}</Text>
            <Chips
              accessibilityLabel="Motivo"
              value={type}
              onChange={(t) => {
                setType(t);
                setKey(newId());
              }}
              options={movementTypesFor(mode, org.business_type).map((t) => ({ value: t, label: MOVEMENT_LABEL[t] }))}
            />
          </>
        ) : (
          <Text style={styles.body}>Informe quanto você contou. A diferença para o saldo atual é lançada como ajuste.</Text>
        )}
        <TextField
          label={mode === 'adjust' ? `Quantidade contada (${p.unit})` : `Quantidade (${p.unit})`}
          value={qtyText}
          onChangeText={setQtyText}
          keyboardType="decimal-pad"
          placeholder="0"
          error={fieldError.qty}
        />
        <TextField
          label={needsReason ? 'Motivo' : 'Observação (opcional)'}
          value={reason}
          onChangeText={setReason}
          placeholder={mode === 'in' ? 'Ex.: fornecedor, nota' : mode === 'adjust' ? 'Ex.: contagem do mês' : 'Ex.: quebrou no transporte'}
          error={fieldError.reason}
        />
      </Card>

      <View style={styles.preview} accessibilityLiveRegion="polite">
        <Text style={styles.previewLabel}>Saldo depois</Text>
        <Text style={[styles.previewValue, goesNegative && styles.negative]}>
          {formatQuantity(p.stock_qty)} → {after !== null ? formatQuantity(after) : '–'} {p.unit}
        </Text>
      </View>

      {goesNegative ? (
        <Card>
          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <Text style={styles.name}>Registrar com saldo negativo</Text>
              <Text style={styles.muted}>Use só se o estoque estava desatualizado. A autorização fica registrada.</Text>
            </View>
            <Switch value={allowNegative} onValueChange={setAllowNegative} trackColor={{ true: colors.primary }} accessibilityLabel="Autorizar saldo negativo" />
          </View>
        </Card>
      ) : null}

      <FormError message={error} />
      <Button label={SUBMIT_LABEL[mode]} onPress={onSubmit} loading={save.isPending} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  label: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
  preview: { backgroundColor: colors.ink, borderRadius: 20, padding: 16, gap: 2 },
  previewLabel: { fontFamily: fonts.semibold, fontSize: 12, color: colors.gray300 },
  previewValue: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.white },
  negative: { color: colors.primary },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
});
