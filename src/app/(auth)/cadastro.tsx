import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text } from 'react-native';

import { Button } from '@/components/Button';
import { FormError } from '@/components/FormError';
import { TextField } from '@/components/TextField';
import { TextLink } from '@/components/TextLink';
import { AuthShell } from '@/features/auth/AuthShell';
import { type SignUpInput, signUpSchema } from '@/features/auth/schemas';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme/tokens';
import { goBack } from '@/lib/navigation';

export default function SignUpScreen() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const { control, handleSubmit, formState } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const onSubmit = handleSubmit(async ({ name, email, password }) => {
    setServerError(null);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: name } },
    });
    if (error) return setServerError(friendlyError(error));
    // Com confirmação de e-mail ligada no Supabase, não há sessão ainda.
    if (!data.session) setNeedsConfirmation(true);
  });

  if (needsConfirmation) {
    return (
      <AuthShell title="Confirme seu e-mail">
        <Text style={styles.text}>
          Enviamos um link de confirmação. Depois de confirmar, volte aqui e entre com seu e-mail e senha.
        </Text>
        <Button label="Ir para o login" onPress={() => router.replace('/entrar')} />
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Criar conta" subtitle="Leva menos de um minuto.">
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState }) => (
          <TextField
            label="Seu nome"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            autoComplete="name"
            textContentType="name"
          />
        )}
      />
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
            textContentType="emailAddress"
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field, fieldState }) => (
          <TextField
            label="Senha"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            hint="Mínimo de 8 caracteres."
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
          />
        )}
      />
      <FormError message={serverError} />
      <Text style={styles.text}>
        Ao criar a conta, você concorda com os{' '}
        <Text accessibilityRole="link" style={styles.link} onPress={() => router.push('/termos')}>
          Termos de uso
        </Text>{' '}
        e a{' '}
        <Text accessibilityRole="link" style={styles.link} onPress={() => router.push('/privacidade')}>
          Política de privacidade
        </Text>
        .
      </Text>
      <Button label="Criar conta" onPress={onSubmit} loading={formState.isSubmitting} />
      <TextLink label="Já tenho conta" onPress={() => goBack()} />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  text: { fontFamily: fonts.medium, fontSize: 14, color: colors.gray600, lineHeight: 20 },
  link: { fontFamily: fonts.bold, color: colors.primaryText },
});
