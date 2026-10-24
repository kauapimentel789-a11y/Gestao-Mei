// Criar empresa: nome → modelo de negócio → link e valor da hora.
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Hammer, ShoppingBag, Wrench } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { FormError } from '@/components/FormError';
import { ProgressSteps } from '@/components/ProgressSteps';
import { TextField } from '@/components/TextField';
import { TextLink } from '@/components/TextLink';
import { BUSINESS_CONFIG, BUSINESS_TYPES, type BusinessType } from '@/config/business';
import { useAuth } from '@/features/auth/AuthProvider';
import { AuthShell } from '@/features/auth/AuthShell';
import { useActiveOrganization } from '@/features/organizations/ActiveOrganizationProvider';
import { useCreateOrganization } from '@/features/organizations/api';
import { type CreateOrganizationInput, createOrganizationSchema } from '@/features/organizations/schemas';
import { friendlyError } from '@/lib/errors';
import { slugify } from '@/lib/slug';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';

const ICONS: Record<BusinessType, typeof Hammer> = { production: Hammer, resale: ShoppingBag, services: Wrench };
const STEP_FIELDS: (keyof CreateOrganizationInput)[][] = [['name'], ['businessType'], ['slug', 'hourlyRate']];

export default function CreateOrganizationScreen() {
  const { session } = useAuth();
  const { select } = useActiveOrganization();
  const create = useCreateOrganization(session?.user.id);
  const [step, setStep] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);

  const { control, handleSubmit, trigger, getValues, setValue, formState } = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: '', businessType: undefined, slug: '', hourlyRate: '' },
  });
  const businessType = useWatch({ control, name: 'businessType' });

  const next = async () => {
    if (!(await trigger(STEP_FIELDS[step]))) return;
    if (step === 0 && !getValues('slug')) setValue('slug', slugify(getValues('name')));
    setStep((s) => s + 1);
  };

  const onSubmit = handleSubmit(async (input) => {
    setServerError(null);
    try {
      const org = await create.mutateAsync(input);
      select(org.id);
    } catch (e) {
      setServerError(friendlyError(e));
    }
  });

  return (
    <AuthShell title="Sua empresa" subtitle={`Passo ${step + 1} de 3`}>
      <ProgressSteps total={3} current={step} />

      {step === 0 && (
        <Controller
          control={control}
          name="name"
          render={({ field, fieldState }) => (
            <TextField
              label="Nome do negócio"
              placeholder="Ex.: Ana Ateliê"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              autoFocus
              onSubmitEditing={() => next()}
            />
          )}
        />
      )}

      {step === 1 && (
        <View style={styles.options} accessibilityRole="radiogroup">
          <Text style={styles.question}>Qual é o modelo de negócio da sua empresa?</Text>
          {BUSINESS_TYPES.map((type) => {
            const cfg = BUSINESS_CONFIG[type];
            const Icon = ICONS[type];
            const selected = businessType === type;
            return (
              <Pressable
                key={type}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${cfg.label}. ${cfg.description}`}
                onPress={() => setValue('businessType', type, { shouldValidate: true })}
                style={[styles.option, selected && styles.optionSelected]}
              >
                <View style={[styles.optionIcon, selected && styles.optionIconSelected]}>
                  <Icon size={20} color={selected ? colors.white : colors.primaryText} />
                </View>
                <View style={styles.optionText}>
                  <Text style={styles.optionTitle}>{cfg.label}</Text>
                  <Text style={styles.optionDesc}>{cfg.description}</Text>
                  <Text style={styles.optionExamples}>{cfg.examples}</Text>
                </View>
                {selected ? <Check size={18} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
          <FormError message={formState.errors.businessType?.message} />
        </View>
      )}

      {step === 2 && (
        <>
          <Controller
            control={control}
            name="slug"
            render={({ field, fieldState }) => (
              <TextField
                label="Link de encomenda"
                value={field.value}
                onChangeText={(t) => field.onChange(t.toLowerCase())}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                hint={`gestaofacil.app/e/${field.value || 'seu-negocio'}`}
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
          />
          {businessType !== 'resale' ? (
            <Controller
              control={control}
              name="hourlyRate"
              render={({ field, fieldState }) => (
                <TextField
                  label="Valor da sua hora de trabalho (opcional)"
                  placeholder="Ex.: 25,00"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  hint="Usado para estimar o custo de mão de obra. Dá para mudar depois."
                  keyboardType="decimal-pad"
                />
              )}
            />
          ) : null}
        </>
      )}

      <FormError message={serverError} />
      {step < 2 ? (
        <Button label="Continuar" onPress={next} />
      ) : (
        <Button label="Criar empresa" onPress={onSubmit} loading={formState.isSubmitting} />
      )}
      {step > 0 ? (
        <TextLink label="Voltar" onPress={() => setStep((s) => s - 1)} />
      ) : (
        <TextLink label="Sair da conta" onPress={() => supabase.auth.signOut()} />
      )}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  options: { gap: 10 },
  question: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.input,
    borderWidth: 1.5,
    borderColor: colors.gray200,
    minHeight: 72,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconSelected: { backgroundColor: colors.primary },
  optionText: { flex: 1, gap: 2 },
  optionTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  optionDesc: { fontFamily: fonts.medium, fontSize: 12, color: colors.gray600 },
  optionExamples: { fontFamily: fonts.medium, fontSize: 11, color: colors.gray500 },
});
