import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { DetailBar } from '@/components/DetailBar';
import { ErrorCard } from '@/components/ErrorCard';
import { FormError } from '@/components/FormError';
import { Skeleton } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useToast } from '@/components/Toast';
import { type DeliveryZone, useDeliveryZones, useSaveDeliveryZone } from '@/features/delivery/api';
import { useOrg } from '@/features/organizations/useOrg';
import { centsToInput } from '@/features/quotes/logic';
import { friendlyError } from '@/lib/errors';
import { formatCents, parseBRLToCents } from '@/lib/money';
import { colors, fonts } from '@/theme/tokens';

/**
 * Taxas de entrega por bairro. Os bairros ativos aparecem no novo pedido e
 * no link de encomenda, onde o cliente escolhe retirada ou entrega.
 */
export default function DeliveryZonesScreen() {
  const { orgId, role } = useOrg();
  const canEdit = role !== 'member';
  const list = useDeliveryZones(orgId);
  const save = useSaveDeliveryZone(orgId);
  const toast = useToast();
  const [editing, setEditing] = useState<DeliveryZone | null>(null);
  const [name, setName] = useState('');
  const [fee, setFee] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEditing(null);
    setName('');
    setFee('');
  };

  const submit = () => {
    setError(null);
    const feeCents = fee.trim() ? parseBRLToCents(fee) : 0;
    if (feeCents === null) return setError('Taxa inválida. Ex.: 5,00 (ou 0 para entrega grátis).');
    save.mutate(
      { id: editing?.id ?? null, name, feeCents, active: editing?.active ?? true },
      {
        onSuccess: () => {
          toast(editing ? 'Bairro atualizado' : 'Bairro cadastrado');
          reset();
        },
        onError: (e) => setError(friendlyError(e)),
      },
    );
  };

  const toggle = (z: DeliveryZone) =>
    save.mutate(
      { id: z.id, name: z.name, feeCents: z.fee_cents, active: !z.active },
      {
        onSuccess: () => toast(z.active ? `${z.name} desativado` : `${z.name} ativo de novo`),
        onError: (e) => toast(friendlyError(e)),
      },
    );

  return (
    <Screen>
      <DetailBar title="Taxas de entrega" />
      <Card>
        <Text style={styles.body}>
          Cadastre os bairros onde você entrega e a taxa de cada um. No pedido e no link de encomenda, o cliente escolhe retirar ou receber em
          casa, e a taxa entra no total.
        </Text>
        {canEdit ? (
          <View style={styles.form}>
            {editing ? <Text style={styles.label}>Editando {editing.name}</Text> : null}
            <TextField label="Bairro ou região" value={name} onChangeText={setName} maxLength={60} placeholder="Ex.: Centro" />
            <TextField label="Taxa de entrega" value={fee} onChangeText={setFee} keyboardType="decimal-pad" placeholder="0,00" />
            <FormError message={error} />
            <Button
              label={editing ? 'Salvar alterações' : 'Adicionar bairro'}
              onPress={submit}
              loading={save.isPending && (save.variables?.id ?? null) === (editing?.id ?? null)}
              disabled={name.trim().length < 2}
            />
            {editing ? <Button variant="tint" size="medium" label="Cancelar edição" onPress={reset} /> : null}
          </View>
        ) : (
          <Text style={styles.body}>Só o dono ou um admin cadastra bairros de entrega.</Text>
        )}
      </Card>

      {list.isPending ? (
        <Skeleton />
      ) : list.error ? (
        <ErrorCard
          message={`${friendlyError(list.error)} Se o problema continuar, o banco ainda precisa da atualização de entregas.`}
          onRetry={() => list.refetch()}
        />
      ) : list.data.length === 0 ? (
        <Card>
          <Text style={styles.body}>Nenhum bairro ainda. Sem bairros, os pedidos ficam como retirada no local.</Text>
        </Card>
      ) : (
        <Card>
          {list.data.map((z, i) => (
            <View key={z.id} style={[styles.row, i > 0 && styles.divider]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Editar ${z.name}`}
                disabled={!canEdit}
                style={styles.flex}
                onPress={() => {
                  setError(null);
                  setEditing(z);
                  setName(z.name);
                  setFee(centsToInput(z.fee_cents));
                }}
              >
                <Text style={[styles.name, !z.active && styles.inactive]}>{z.name}</Text>
                <Text style={styles.muted}>
                  {z.fee_cents === 0 ? 'Entrega grátis' : formatCents(z.fee_cents)}
                  {z.active ? '' : ' · desativado: não aparece para escolher'}
                </Text>
              </Pressable>
              {canEdit ? (
                <Button
                  size="medium"
                  variant="tint"
                  label={z.active ? 'Desativar' : 'Reativar'}
                  loading={save.isPending && save.variables?.id === z.id && !editing}
                  onPress={() => toggle(z)}
                />
              ) : null}
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { fontFamily: fonts.medium, fontSize: 13, color: colors.gray600, lineHeight: 19 },
  form: { gap: 10 },
  label: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  flex: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  inactive: { color: colors.gray500 },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
});
