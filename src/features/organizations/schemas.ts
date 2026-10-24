import { z } from 'zod';

import { BUSINESS_PROFILES, PRACTICE_AREAS } from '@/config/business';
import { parseBRLToCents } from '@/lib/money';
import { SLUG_PATTERN } from '@/lib/slug';

export const createOrganizationSchema = z
  .object({
    name: z.string().trim().min(2, 'Informe o nome do negócio.').max(80, 'Nome muito longo.'),
    businessType: z.enum(BUSINESS_PROFILES, { message: 'Escolha o modelo do seu negócio.' }),
    practiceArea: z.enum(PRACTICE_AREAS).optional(),
    slug: z
      .string()
      .trim()
      .regex(SLUG_PATTERN, 'Use só letras minúsculas, números e hífen (de 2 a 48 caracteres).'),
    hourlyRate: z
      .string()
      .trim()
      .refine((v) => v === '' || parseBRLToCents(v) !== null, 'Valor inválido. Ex.: 25,00'),
  })
  .refine((v) => v.businessType !== 'appointments' || v.practiceArea !== undefined, {
    path: ['practiceArea'],
    message: 'Escolha a sua área.',
  });

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
