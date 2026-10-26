// Lista de clientes (ou pacientes): tela de cadastro ou aba, em atendimentos.
import { router } from 'expo-router';
import { Cake, Plus, Users } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { CircleButton, DetailBar } from '@/components/DetailBar';
import { QueryStates } from '@/components/ListStates';
import { Screen } from '@/components/Screen';
import { SearchField } from '@/components/SearchField';
import { useOrg } from '@/features/organizations/useOrg';
import { useDebounced } from '@/lib/useDebounced';
import { colors, fonts } from '@/theme/tokens';

import { useCustomers } from './api';

export function CustomerList({ tab }: { tab?: boolean }) {
  const { orgId, config } = useOrg();
  const [search, setSearch] = useState('');
  const term = useDebounced(search, 300);
  const list = useCustomers(orgId, term);
  const noun = config.clientNoun;
  const add = (
    <View style={styles.buttons}>
      <CircleButton label="Aniversários" icon={<Cake size={20} color={colors.ink} />} onPress={() => router.push('/clientes/aniversarios')} />
      <CircleButton label={`Novo ${noun}`} icon={<Plus size={20} color={colors.ink} />} onPress={() => router.push('/clientes/form')} />
    </View>
  );

  return (
    <Screen>
      {tab ? (
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {config.clientsLabel}
          </Text>
          {add}
        </View>
      ) : (
        <DetailBar title={config.clientsLabel} right={add} />
      )}
      <SearchField value={search} onChangeText={setSearch} placeholder="Buscar por nome ou telefone" />
      <Card style={styles.list}>
        <QueryStates
          query={list}
          isEmpty={list.data?.length === 0}
          empty={
            term
              ? { icon: Users, title: `Nenhum ${noun} encontrado.` }
              : {
                  icon: Users,
                  title: `Nenhum ${noun} ainda`,
                  description: `Cadastre ${config.clientsLabel.toLowerCase()} para consultar o histórico de ${config.tabLabels.pedidos.toLowerCase()} de cada um.`,
                  action: { label: `Cadastrar ${noun}`, onPress: () => router.push('/clientes/form') },
                }
          }
        />
        {list.data?.map((c, i) => (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/clientes/[id]', params: { id: c.id } })}
            style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && styles.pressed]}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {c.name
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((w) => w[0]?.toUpperCase() ?? '')
                  .join('')}
              </Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.name}>{c.name}</Text>
              {c.phone ? <Text style={styles.sub}>{c.phone}</Text> : null}
            </View>
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  buttons: { flexDirection: 'row', gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.extrabold, fontSize: 26, letterSpacing: -0.5, color: colors.ink },
  list: { paddingVertical: 4, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: colors.divider },
  pressed: { backgroundColor: colors.rowPressed },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.graphite, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.extrabold, fontSize: 13, color: colors.primary },
  flex: { flex: 1 },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  sub: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
});
