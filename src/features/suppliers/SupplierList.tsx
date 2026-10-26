// Busca e lista de fornecedores: tela própria e parte da aba Estoque.
import { router } from 'expo-router';
import { ChevronRight, Truck } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { QueryStates } from '@/components/ListStates';
import { SearchField } from '@/components/SearchField';
import { useOrg } from '@/features/organizations/useOrg';
import { colors, fonts } from '@/theme/tokens';

import { useSuppliers } from './api';

export function SupplierList() {
  const { orgId } = useOrg();
  const list = useSuppliers(orgId);
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();
  const digits = term.replace(/\D/g, '');
  const items = (list.data ?? []).filter(
    (s) =>
      !term ||
      s.name.toLowerCase().includes(term) ||
      Boolean(s.supplies?.toLowerCase().includes(term)) ||
      (digits.length >= 3 && Boolean(s.document?.includes(digits))),
  );

  return (
    <>
      <SearchField value={search} onChangeText={setSearch} placeholder="Buscar por nome, produto ou documento" />
      <Card style={styles.list}>
        <QueryStates
          query={list}
          isEmpty={items.length === 0}
          empty={
            term
              ? { icon: Truck, title: 'Nenhum fornecedor encontrado.' }
              : {
                  icon: Truck,
                  title: 'Nenhum fornecedor ainda',
                  description: 'Cadastre de quem você compra: contato, endereço e o que cada um vende. As compras ficam no histórico de cada fornecedor.',
                  action: { label: 'Cadastrar fornecedor', onPress: () => router.push('/fornecedores/form') },
                }
          }
        />
        {items.map((s, i) => (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/fornecedores/[id]', params: { id: s.id } })}
            style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed, !s.active && styles.inactive]}
          >
            <View style={styles.icon}>
              <Truck size={18} color={colors.primaryText} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.name} numberOfLines={1}>
                {s.name}
                {!s.active ? ' (inativo)' : ''}
              </Text>
              {s.supplies ? (
                <Text style={styles.sub} numberOfLines={1}>
                  {s.supplies}
                </Text>
              ) : null}
              {s.phone || s.contact_name ? (
                <Text style={styles.sub} numberOfLines={1}>
                  {[s.contact_name, s.phone].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
            <ChevronRight size={16} color={colors.gray400} />
          </Pressable>
        ))}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: 4, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  pressed: { backgroundColor: colors.rowPressed },
  inactive: { opacity: 0.55 },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  sub: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
});
