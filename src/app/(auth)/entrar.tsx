import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { Button } from '@/components/Button';
import { FormError } from '@/components/FormError';
import { TextField } from '@/components/TextField';
import { TextLink } from '@/components/TextLink';
import { AuthShell } from '@/features/auth/AuthShell';
import { type LoginInput, loginSchema } from '@/features/auth/schemas';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export default function LoginScreen() {
  const [serverError, setServerError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setServerError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    // Em caso de sucesso o AuthProvider recebe a sessão e a navegação troca sozinha.
    if (error) setServerError(friendlyError(error));
  });

  return (
    <AuthShell title="Entrar" subtitle="Acesse a gestão do seu negócio.">
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
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            onSubmitEditing={() => onSubmit()}
          />
        )}
      />
      <FormError message={serverError} />
      <Button label="Entrar" onPress={onSubmit} loading={formState.isSubmitting} />
      <TextLink label="Esqueci minha senha" onPress={() => router.push('/recuperar-senha')} />
      <TextLink label="Criar conta" onPress={() => router.push('/cadastro')} />
    </AuthShell>
  );
}
