// Lista de seleção em tela cheia, com busca local (fornecedor, item da compra).
import { Check, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, minTouch, spacing } from '@/theme/tokens';

import { Skeleton } from './ListStates';
import { SearchField } from './SearchField';

export interface PickerOption {
  id: string;
  title: string;
  subtitle?: string;
}

interface Props {
  visible: boolean;
  title: string;
  searchPlaceholder: string;
  options: PickerOption[];
  loading?: boolean;
  selectedId: string | null;
  /** Rótulo da opção "nenhum" (ex.: "Sem fornecedor"); sem ele, a opção não aparece. */
  noneLabel?: string;
  emptyText: string;
  /** Conteúdo abaixo da busca (ex.: cadastro rápido), recebe o termo digitado. */
  header?: (search: string) => ReactNode;
  onClose: () => void;
  onSelect: (id: string | null) => void;
}

const normalize = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function PickerModal({ visible, title, searchPlaceholder, options, loading, selectedId, noneLabel, emptyText, header, onClose, onSelect }: Props) {
  const [search, setSearch] = useState('');
  const term = normalize(search.trim());
  const filtered = term ? options.filter((o) => normalize(`${o.title} ${o.subtitle ?? ''}`).includes(term)) : options;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.bar}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} style={styles.close}>
              <X size={20} color={colors.ink} />
            </Pressable>
          </View>
          <SearchField value={search} onChangeText={setSearch} placeholder={searchPlaceholder} />
          {header?.(search.trim())}
          {noneLabel ? (
            <Pressable accessibilityRole="radio" accessibilityState={{ checked: selectedId === null }} onPress={() => onSelect(null)} style={styles.row}>
              <Text style={styles.name}>{noneLabel}</Text>
              {selectedId === null ? <Check size={18} color={colors.primary} /> : null}
            </Pressable>
          ) : null}
          {loading ? <Skeleton /> : null}
          {!loading && filtered.length === 0 ? <Text style={styles.empty}>{emptyText}</Text> : null}
          {filtered.map((o) => (
            <Pressable
              key={o.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selectedId === o.id }}
              onPress={() => onSelect(o.id)}
              style={styles.row}
            >
              <View style={styles.flex}>
                <Text style={styles.name}>{o.title}</Text>
                {o.subtitle ? <Text style={styles.sub}>{o.subtitle}</Text> : null}
              </View>
              {selectedId === o.id ? <Check size={18} color={colors.primary} /> : null}
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.screen, gap: 12, paddingBottom: 40 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.extrabold, fontSize: 17, color: colors.ink },
  close: { width: minTouch, height: minTouch, borderRadius: minTouch / 2, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.surface, gap: 8 },
  name: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  sub: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
  empty: { fontFamily: fonts.medium, fontSize: 13, color: colors.gray500, textAlign: 'center', paddingVertical: 12 },
});
