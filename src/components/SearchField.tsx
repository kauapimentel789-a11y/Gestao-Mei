import { Search } from 'lucide-react-native';
import { StyleSheet, TextInput, View } from 'react-native';

import { colors, fonts, radius } from '@/theme/tokens';

export function SearchField({ value, onChangeText, placeholder }: { value: string; onChangeText: (t: string) => void; placeholder: string }) {
  return (
    <View style={styles.wrap}>
      <Search size={18} color={colors.gray500} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.gray400}
        accessibilityLabel={placeholder}
        style={styles.input}
        returnKeyType="search"
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.gray200,
  },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.ink, paddingVertical: 10 },
});
