import { router } from 'expo-router';
import { Plus, Truck } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { CircleButton, DetailBar } from '@/components/DetailBar';
import { QueryStates } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { SearchField } from '@/components/SearchField';
import { useOrg } from '@/features/organizations/useOrg';
import { useSuppliers } from '@/features/suppliers/api';
import { colors, fonts } from '@/theme/tokens';

export default function SuppliersScreen() {
  const { orgId } = useOrg();
  const list = useSuppliers(orgId);
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();
  const digits = term.replace(/\D/g, '');
  const items = (list.data ?? []).filter(
    (s) => !term || s.name.toLowerCase().includes(term) || (digits.length >= 3 && Boolean(s.document?.includes(digits))),
  );

  return (
    <Screen>
      <DetailBar
        title="Fornecedores"
        right={<CircleButton label="Novo fornecedor" icon={<Plus size={20} color={colors.ink} />} onPress={() => router.push('/fornecedores/form')} />}
      />
      <SearchField value={search} onChangeText={setSearch} placeholder="Buscar por nome ou documento" />
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
                  description: 'Cadastre de quem você compra para acompanhar compras e contas a pagar.',
                  action: { label: 'Cadastrar fornecedor', onPress: () => router.push('/fornecedores/form') },
                }
          }
        />
        {items.map((s, i) => (
          <Pressable
            key={s.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/fornecedores/form', params: { id: s.id } })}
            style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed, !s.active && styles.inactive]}
          >
            <View style={styles.flex}>
              <Text style={styles.name}>
                {s.name}
                {!s.active ? ' (inativo)' : ''}
              </Text>
              {s.phone || s.email ? <Text style={styles.sub}>{[s.phone, s.email].filter(Boolean).join(' · ')}</Text> : null}
            </View>
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: 4, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  pressed: { backgroundColor: colors.rowPressed },
  inactive: { opacity: 0.55 },
  flex: { flex: 1 },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  sub: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
});
