import { z } from 'zod';

import { parseBirthday } from '@/lib/birthday';
import { isValidDocument } from '@/lib/document';

export const customerSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome.').max(120, 'Nome muito longo.'),
  phone: z
    .string()
    .trim()
    .max(30, 'Telefone muito longo.')
    .refine((v) => v === '' || v.replace(/\D/g, '').length >= 10, 'Informe o telefone com DDD.'),
  document: z
    .string()
    .trim()
    .refine((v) => v === '' || isValidDocument(v), 'Confira o CPF (11 números) ou CNPJ (14 números).'),
  birthday: z
    .string()
    .trim()
    .refine((v) => parseBirthday(v) !== 'invalid', 'Use dia/mês, como 12/03, ou dia/mês/ano, como 12/03/1990.'),
  address: z
    .string()
    .trim()
    .max(200, 'Endereço muito longo.')
    .refine((v) => v === '' || v.length >= 3, 'Endereço muito curto.'),
  notes: z.string().trim().max(1000, 'Observação muito longa.'),
});

export type CustomerFormInput = z.infer<typeof customerSchema>;
