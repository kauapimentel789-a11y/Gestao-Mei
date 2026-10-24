import { router, useLocalSearchParams } from 'expo-router';
import { ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, History, Pencil } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { CircleButton, DetailBar } from '@/components/DetailBar';
import { ErrorCard } from '@/components/ErrorCard';
import { QueryStates, Skeleton } from '@/components/ListStates';
import { ReasonDialog } from '@/components/ReasonDialog';
import { Screen } from '@/components/Screen';
import { TextLink } from '@/components/TextLink';
import { useToast } from '@/components/Toast';
import { type Movement, useMovements, useReverseMovement } from '@/features/inventory/api';
import { formatSigned, type MoveMode, MOVEMENT_LABEL } from '@/features/inventory/logic';
import { formatQuantity } from '@/features/orders/logic';
import { useOrg } from '@/features/organizations/useOrg';
import { useRecipeCost } from '@/features/production/api';
import { formatMinutes } from '@/features/production/logic';
import { useProduct } from '@/features/products/api';
import { ITEM_TYPE_LABEL, isLowStock } from '@/features/products/types';
import { formatWhen } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { formatCents } from '@/lib/money';
import { colors, fonts, radius } from '@/theme/tokens';

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orgId, config } = useOrg();
  const product = useProduct(orgId, id);
  const p = product.data;
  const movements = useMovements(orgId, id, Boolean(p?.track_stock));
  const reverse = useReverseMovement(orgId);
  const toast = useToast();
  const [reversing, setReversing] = useState<{ movement: Movement; key: string } | null>(null);
  const [reverseError, setReverseError] = useState<string | null>(null);

  if (product.isPending) {
    return (
      <Screen>
        <DetailBar title="Item" />
        <Skeleton rows={4} />
      </Screen>
    );
  }
  if (product.error || !p) {
    return (
      <Screen>
        <DetailBar title="Item" />
        <ErrorCard message={friendlyError(product.error)} onRetry={() => product.refetch()} />
      </Screen>
    );
  }

  const low = isLowStock(p);
  const list = movements.data ?? [];
  const reversed = new Set(list.map((m) => m.reverses_movement_id).filter((x): x is number => x != null));
  const move = (mode: MoveMode) => router.push({ pathname: '/itens/movimentar', params: { id: p.id, modo: mode } });

  return (
    <Screen>
      <DetailBar
        title={p.name}
        right={
          <CircleButton
            label="Editar cadastro"
            icon={<Pencil size={18} color={colors.ink} />}
            onPress={() => router.push({ pathname: '/itens/form', params: { id: p.id } })}
          />
        }
      />

      <Card>
        <Text style={styles.muted}>
          {ITEM_TYPE_LABEL[p.item_type]}
          {!p.active ? ' · inativo' : ''}
        </Text>
        {p.track_stock ? (
          <>
            <Text style={styles.label}>Em estoque</Text>
            <Text style={[styles.stock, low && styles.low]}>
              {formatQuantity(p.stock_qty)} <Text style={styles.unit}>{p.unit}</Text>
            </Text>
            {Number(p.min_stock) > 0 ? (
              <Text style={[styles.muted, low && styles.low]}>
                {low ? 'Repor: ' : ''}mínimo de {formatQuantity(p.min_stock)} {p.unit}
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.body}>Este item não controla estoque. Ative “Controlar estoque” no cadastro para registrar entradas e saídas.</Text>
        )}
        <Text style={styles.muted}>
          {p.cost_cents != null ? `Custo ${formatCents(p.cost_cents)}` : 'Sem custo'}
          {p.price_cents != null ? ` · venda ${formatCents(p.price_cents)}` : ''}
        </Text>
      </Card>

      {p.item_type === 'finished' || p.item_type === 'component' ? <RecipeCard productId={p.id} hasStock={p.track_stock} /> : null}

      {p.track_stock ? (
        <>
          <View style={styles.actions}>
            <Action label="Entrada" icon={<ArrowDownToLine size={22} color={colors.white} />} primary onPress={() => move('in')} />
            <Action label="Saída" icon={<ArrowUpFromLine size={22} color={colors.primaryText} />} onPress={() => move('out')} />
            <Action label="Ajustar contagem" icon={<ClipboardCheck size={22} color={colors.primaryText} />} onPress={() => move('adjust')} />
          </View>

          <Card style={styles.history}>
            <Text style={styles.cardTitle}>Movimentações</Text>
            <QueryStates
              query={movements}
              isEmpty={list.length === 0}
              empty={{ icon: History, title: 'Nenhuma movimentação ainda', description: 'Registre uma entrada para começar o saldo deste item.' }}
            />
            {list.map((m, i) => (
              <View key={m.id} style={[styles.movRow, i > 0 && styles.divider]}>
                <View style={styles.flex}>
                  <Text style={styles.movType}>
                    {MOVEMENT_LABEL[m.movement_type]}
                    {reversed.has(m.id) ? <Text style={styles.reversedTag}>  estornada</Text> : null}
                  </Text>
                  {m.reason ? (
                    <Text style={styles.muted} numberOfLines={2}>
                      {m.reason}
                    </Text>
                  ) : null}
                  <Text style={styles.muted}>
                    {formatWhen(new Date(m.created_at))} · saldo {formatQuantity(m.balance_before)} → {formatQuantity(m.balance_after)}
                    {m.negative_authorized ? ' · negativo autorizado' : ''}
                  </Text>
                  {m.order_id ? (
                    <TextLink label={`Ver ${config.orderNoun}`} onPress={() => router.push({ pathname: '/pedidos/[id]', params: { id: m.order_id! } })} />
                  ) : null}
                  {m.purchase_id ? (
                    <TextLink label="Ver compra" onPress={() => router.push({ pathname: '/compras/[id]', params: { id: m.purchase_id! } })} />
                  ) : null}
                  {m.production_run_id ? (
                    <TextLink label="Ver produção" onPress={() => router.push({ pathname: '/producao/[id]', params: { id: m.production_run_id! } })} />
                  ) : null}
                </View>
                <View style={styles.movRight}>
                  <Text style={[styles.qty, Number(m.quantity) < 0 ? styles.qtyOut : styles.qtyIn]}>{formatSigned(m.quantity)}</Text>
                  {m.movement_type !== 'reversal' && !reversed.has(m.id) && !m.purchase_id && !m.production_run_id ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Estornar ${MOVEMENT_LABEL[m.movement_type]}`}
                      hitSlop={8}
                      onPress={() => {
                        setReverseError(null);
                        setReversing({ movement: m, key: newId() });
                      }}
                    >
                      <Text style={styles.reverse}>Estornar</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </Card>
          <Text style={styles.note}>Movimentações não são apagadas. Para corrigir um lançamento, estorne e registre de novo.</Text>
        </>
      ) : null}

      <ReasonDialog
        key={reversing?.key}
        visible={reversing !== null}
        title="Estornar movimentação?"
        description={
          reversing
            ? `Será lançada a movimentação inversa (${formatSigned(-Number(reversing.movement.quantity))} ${p.unit}). A original continua no histórico.`
            : ''
        }
        keepLabel="Voltar"
        confirmLabel="Estornar"
        placeholder="Ex.: quantidade lançada errada"
        loading={reverse.isPending}
        error={reverseError}
        onClose={() => setReversing(null)}
        onConfirm={async (reason) => {
          if (!reversing) return;
          try {
            await reverse.mutateAsync({ movementId: reversing.movement.id, reason, idempotencyKey: reversing.key });
            setReversing(null);
            toast('Movimentação estornada');
          } catch (e) {
            setReverseError(friendlyError(e));
          }
        }}
      />
    </Screen>
  );
}

function RecipeCard({ productId, hasStock }: { productId: string; hasStock: boolean }) {
  const { orgId } = useOrg();
  const cost = useRecipeCost(orgId, productId);
  const edit = () => router.push({ pathname: '/itens/receita', params: { id: productId } });

  if (cost.isPending) return <Skeleton rows={1} />;
  if (cost.error) return <ErrorCard message={friendlyError(cost.error)} onRetry={() => cost.refetch()} />;
  const c = cost.data;
  return (
    <Card>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Ficha técnica</Text>
        <TextLink label={c ? 'Editar' : 'Cadastrar'} onPress={edit} />
      </View>
      {c ? (
        <>
          <Text style={styles.body}>
            Rende {formatQuantity(c.yield_qty)} por lote · {formatMinutes(c.labor_minutes)}
          </Text>
          <Text style={styles.muted}>
            Custo estimado {formatCents(c.unit_cost_cents)} por unidade (insumos {formatCents(c.materials_cost_cents)} + mão de obra{' '}
            {formatCents(c.labor_cost_cents)} por lote)
          </Text>
          {c.missing_cost_inputs > 0 ? (
            <Text style={[styles.muted, styles.low]}>
              {c.missing_cost_inputs === 1 ? '1 insumo sem custo cadastrado' : `${c.missing_cost_inputs} insumos sem custo cadastrado`}: o custo está incompleto.
            </Text>
          ) : null}
          {hasStock ? (
            <TextLink label="Registrar produção" onPress={() => router.push({ pathname: '/producao/nova', params: { produto: productId } })} />
          ) : null}
        </>
      ) : (
        <Text style={styles.body}>Cadastre os insumos de um lote para calcular o custo e dar baixa no estoque quando produzir.</Text>
      )}
    </Card>
  );
}

function Action({ label, icon, onPress, primary }: { label: string; icon: ReactNode; onPress: () => void; primary?: boolean }) {
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
  flex: { flex: 1, gap: 2 },
  label: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500, marginTop: 4 },
  stock: { fontFamily: fonts.extrabold, fontSize: 34, letterSpacing: -0.7, color: colors.ink },
  unit: { fontFamily: fonts.bold, fontSize: 16, color: colors.gray500 },
  low: { color: colors.primaryText },
  muted: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1, alignItems: 'center', gap: 6 },
  actionTile: { width: 60, height: 60, borderRadius: radius.quickAction, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  actionTilePrimary: { backgroundColor: colors.primary },
  actionLabel: { fontFamily: fonts.bold, fontSize: 12, color: colors.ink, textAlign: 'center' },
  history: { gap: 0 },
  cardTitle: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink, marginBottom: 6 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  movRow: { flexDirection: 'row', gap: 12, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  movType: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  reversedTag: { fontFamily: fonts.bold, fontSize: 11, color: colors.gray400 },
  movRight: { alignItems: 'flex-end', gap: 6 },
  qty: { fontFamily: fonts.extrabold, fontSize: 15 },
  qtyIn: { color: colors.ink },
  qtyOut: { color: colors.primaryText },
  reverse: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500, textDecorationLine: 'underline' },
  note: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500, textAlign: 'center' },
});
