// Lista de itens (aba Estoque, ou Configurações → Itens para serviços).
import { router } from 'expo-router';
import { Package } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { QueryStates } from '@/components/ListStates';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useOrg } from '@/features/organizations/useOrg';
import { formatQuantity } from '@/features/orders/logic';
import { formatCents } from '@/lib/money';
import { colors, fonts } from '@/theme/tokens';

import { useProducts } from './api';
import { ITEM_TYPE_LABEL, isLowStock, marginRatio, SELLABLE_TYPES } from './types';

type Group = 'sell' | 'materials';

export function ItemsList() {
  const { orgId } = useOrg();
  const [group, setGroup] = useState<Group>('sell');
  const list = useProducts(orgId);
  const items = (list.data ?? []).filter((p) => (group === 'sell') === SELLABLE_TYPES.includes(p.item_type));

  return (
    <>
      <SegmentedControl
        value={group}
        onChange={setGroup}
        segments={[
          { value: 'sell', label: 'À venda' },
          { value: 'materials', label: 'Materiais' },
        ]}
      />
      <Card style={styles.list}>
        <QueryStates
          query={list}
          isEmpty={items.length === 0}
          empty={{
            icon: Package,
            title: group === 'sell' ? 'Nenhum item à venda' : 'Nenhum material cadastrado',
            description:
              group === 'sell'
                ? 'Cadastre produtos, mercadorias ou serviços com preço de venda.'
                : 'Cadastre matérias-primas, embalagens e peças para controlar o estoque.',
            action: { label: 'Cadastrar item', onPress: () => router.push('/itens/form') },
          }}
        />
        {items.map((p, i) => {
          const low = isLowStock(p);
          const margin = marginRatio(p);
          return (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/itens/[id]', params: { id: p.id } })}
              style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed, !p.active && styles.inactive]}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{p.name[0]?.toUpperCase()}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.name} numberOfLines={1}>
                  {p.name}
                  {!p.active ? ' (inativo)' : ''}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {ITEM_TYPE_LABEL[p.item_type]}
                  {p.cost_cents != null ? ` · custo ${formatCents(p.cost_cents)}` : ''}
                  {p.price_cents != null ? ` · venda ${formatCents(p.price_cents)}` : ''}
                </Text>
                {p.track_stock ? (
                  <Text style={[styles.stock, low && styles.low]}>
                    {formatQuantity(p.stock_qty)} {p.unit} em estoque{low ? ` · mín. ${formatQuantity(p.min_stock)}` : ''}
                  </Text>
                ) : null}
              </View>
              {margin !== null ? (
                <Text style={[styles.margin, margin < 0.2 && styles.low]}>{Math.round(margin * 100)}%</Text>
              ) : null}
            </Pressable>
          );
        })}
      </Card>
      {items.some((p) => p.track_stock) ? (
        <Text style={styles.note}>Toque num item para registrar entrada, saída ou ajuste de contagem.</Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: 4, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  pressed: { backgroundColor: colors.rowPressed },
  inactive: { opacity: 0.55 },
  avatar: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.graphite, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.primary },
  flex: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  sub: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  stock: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  low: { color: colors.primaryText },
  margin: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.ink },
  note: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500, textAlign: 'center' },
});
