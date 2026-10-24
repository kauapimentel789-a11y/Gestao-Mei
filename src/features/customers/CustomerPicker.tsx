// Seleção de cliente no novo pedido: busca, "sem cliente" e cadastro rápido.
import { Check, UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { DetailBar } from '@/components/DetailBar';
import { FormError } from '@/components/FormError';
import { QueryStates } from '@/components/ListStates';
import { SearchField } from '@/components/SearchField';
import { TextField } from '@/components/TextField';
import { friendlyError } from '@/lib/errors';
import { useDebounced } from '@/lib/useDebounced';
import { colors, fonts, spacing } from '@/theme/tokens';

import { type Customer, findCustomersByPhone, useCustomers, useSaveCustomer } from './api';

interface Props {
  orgId: string;
  visible: boolean;
  selectedId: string | null;
  onClose: () => void;
  onSelect: (customer: Customer | null) => void;
}

export function CustomerPicker({ orgId, visible, selectedId, onClose, onSelect }: Props) {
  const [search, setSearch] = useState('');
  const term = useDebounced(search, 250);
  const list = useCustomers(orgId, term);
  const save = useSaveCustomer(orgId);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Customer | null>(null);

  const reset = () => {
    setAdding(false);
    setName('');
    setPhone('');
    setError(null);
    setDuplicate(null);
  };

  const create = async (force = false) => {
    setError(null);
    if (!name.trim()) return setError('Informe o nome.');
    if (phone.trim() && phone.replace(/\D/g, '').length < 10) return setError('Informe o telefone com DDD.');
    try {
      if (!force && phone.trim()) {
        // Casa por telefone, nunca por nome.
        const [same] = await findCustomersByPhone(orgId, phone);
        if (same) return setDuplicate(same);
      }
      const c = await save.mutateAsync({ input: { name, phone } });
      reset();
      onSelect(c);
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <DetailBar title="Cliente" />
          {adding ? (
            <View style={styles.form}>
              <TextField label="Nome" value={name} onChangeText={setName} autoFocus />
              <TextField label="WhatsApp (opcional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
              {duplicate ? (
                <View style={styles.dup}>
                  <Text style={styles.dupText}>
                    Já existe {duplicate.name} com esse telefone.
                  </Text>
                  <Button size="medium" variant="tint" label={`Usar ${duplicate.name}`} onPress={() => { reset(); onSelect(duplicate); }} />
                  <Button size="medium" variant="outline" label="Cadastrar mesmo assim" onPress={() => create(true)} />
                </View>
              ) : null}
              <FormError message={error} />
              {!duplicate ? <Button label="Salvar cliente" onPress={() => create()} loading={save.isPending} /> : null}
              <Button variant="outline" size="medium" label="Voltar para a lista" onPress={reset} />
            </View>
          ) : (
            <>
              <SearchField value={search} onChangeText={setSearch} placeholder="Buscar por nome ou telefone" />
              <Pressable accessibilityRole="button" onPress={() => setAdding(true)} style={styles.addRow}>
                <UserPlus size={18} color={colors.primaryText} />
                <Text style={styles.addText}>Cadastrar cliente{search.trim() ? ` "${search.trim()}"` : ''}</Text>
              </Pressable>
              <Pressable accessibilityRole="radio" accessibilityState={{ checked: selectedId === null }} onPress={() => onSelect(null)} style={styles.row}>
                <Text style={styles.name}>Sem cliente</Text>
                {selectedId === null ? <Check size={18} color={colors.primary} /> : null}
              </Pressable>
              <QueryStates
                query={list}
                isEmpty={list.data?.length === 0}
                empty={{ icon: UserPlus, title: term ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.' }}
              />
              {list.data?.map((c) => (
                <Pressable
                  key={c.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selectedId === c.id }}
                  onPress={() => onSelect(c)}
                  style={styles.row}
                >
                  <View style={styles.flex}>
                    <Text style={styles.name}>{c.name}</Text>
                    {c.phone ? <Text style={styles.sub}>{c.phone}</Text> : null}
                  </View>
                  {selectedId === c.id ? <Check size={18} color={colors.primary} /> : null}
                </Pressable>
              ))}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.screen, gap: 12, paddingBottom: 40 },
  form: { gap: 12 },
  flex: { flex: 1 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  addText: { fontFamily: fonts.bold, fontSize: 14, color: colors.primaryText },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    gap: 8,
  },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  sub: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  dup: { gap: 8, padding: 14, borderRadius: 14, backgroundColor: colors.primaryTint },
  dupText: { fontFamily: fonts.bold, fontSize: 13, color: colors.primaryText },
});
