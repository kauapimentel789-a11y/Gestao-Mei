import { zodResolver } from '@hookform/resolvers/zod';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text } from 'react-native';

import { Button } from '@/components/Button';
import { FormError } from '@/components/FormError';
import { TextField } from '@/components/TextField';
import { TextLink } from '@/components/TextLink';
import { AuthShell } from '@/features/auth/AuthShell';
import { type ResetInput, resetSchema } from '@/features/auth/schemas';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme/tokens';
import { goBack } from '@/lib/navigation';

export default function ResetPasswordScreen() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<ResetInput>({
    resolver: zodResolver(resetSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setServerError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: Linking.createURL('/nova-senha'),
    });
    // Mensagem igual exista ou não a conta, para não revelar quais e-mails estão cadastrados.
    if (error && error.status !== 400) return setServerError(friendlyError(error));
    setSent(true);
  });

  if (sent) {
    return (
      <AuthShell title="Verifique seu e-mail">
        <Text style={styles.text}>
          Se houver uma conta com esse e-mail, você vai receber um link para criar uma nova senha.
        </Text>
        <Button label="Voltar para o login" onPress={() => router.replace('/entrar')} />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Recuperar senha" subtitle="Enviaremos um link para o seu e-mail.">
      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <TextField
            label="E-mail"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
        )}
      />
      <FormError message={serverError} />
      <Button label="Enviar link" onPress={onSubmit} loading={formState.isSubmitting} />
      <TextLink label="Voltar" onPress={() => goBack()} />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  text: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
});
