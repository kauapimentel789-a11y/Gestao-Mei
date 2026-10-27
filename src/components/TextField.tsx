import { StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';

import { maskDate, maskTime } from '@/lib/inputMasks';
import { colors, fonts, radius } from '@/theme/tokens';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
  /** Data (DD/MM/AAAA) ou hora (HH:MM): teclado de números e separadores automáticos. */
  mask?: 'date' | 'time';
}

const MASKS = {
  date: { format: maskDate, maxLength: 10 },
  time: { format: maskTime, maxLength: 5 },
};

export function TextField({ label, error, hint, style, mask, ...rest }: TextFieldProps) {
  const m = mask ? MASKS[mask] : null;
  const onChangeText = rest.onChangeText;
  const masked: TextInputProps | null = m
    ? {
        inputMode: 'numeric',
        keyboardType: 'number-pad',
        maxLength: m.maxLength,
        onChangeText: onChangeText ? (t: string) => onChangeText(m.format(t)) : undefined,
      }
    : null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.gray400}
        style={[styles.input, error ? styles.inputError : null, style]}
        {...rest}
        {...masked}
      />
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontFamily: fonts.bold, fontSize: 12, color: colors.gray500 },
  input: {
    minHeight: 50,
    borderRadius: radius.input,
    borderWidth: 1.5,
    borderColor: colors.gray200,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontFamily: fonts.medium,
    // 16 ou mais: o Safari do iPhone não amplia a tela ao tocar no campo.
    fontSize: 16,
    color: colors.ink,
  },
  inputError: { borderColor: colors.primaryText },
  error: { fontFamily: fonts.bold, fontSize: 13, color: colors.primaryText },
  hint: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray500 },
});
