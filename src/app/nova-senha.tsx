import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/Button';
import { FormError } from '@/components/FormError';
import { TextField } from '@/components/TextField';
import { AuthShell } from '@/features/auth/AuthShell';
import { signUpSchema } from '@/features/auth/schemas';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

const schema = z
  .object({ password: signUpSchema.shape.password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'As senhas não conferem.' });

export default function NewPasswordScreen() {
  const [serverError, setServerError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    setServerError(null);
    // USER_UPDATED encerra o modo de recuperação e leva ao app.
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setServerError(friendlyError(error));
  });

  return (
    <AuthShell title="Nova senha" subtitle="Escolha a senha que vai usar daqui em diante.">
      <Controller
        control={control}
        name="password"
        render={({ field, fieldState }) => (
          <TextField
            label="Nova senha"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            secureTextEntry
            autoComplete="new-password"
          />
        )}
      />
      <Controller
        control={control}
        name="confirm"
        render={({ field, fieldState }) => (
          <TextField
            label="Repita a senha"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            secureTextEntry
            autoComplete="new-password"
          />
        )}
      />
      <FormError message={serverError} />
      <Button label="Salvar senha" onPress={onSubmit} loading={formState.isSubmitting} />
    </AuthShell>
  );
}
