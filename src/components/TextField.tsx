import { StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';

import { colors, fonts, radius } from '@/theme/tokens';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
}

export function TextField({ label, error, hint, style, ...rest }: TextFieldProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.gray400}
        style={[styles.input, error ? styles.inputError : null, style]}
        {...rest}
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
