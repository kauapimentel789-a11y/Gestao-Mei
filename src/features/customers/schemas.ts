import { z } from 'zod';

export const customerSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome.').max(120, 'Nome muito longo.'),
  phone: z
    .string()
    .trim()
    .max(30, 'Telefone muito longo.')
    .refine((v) => v === '' || v.replace(/\D/g, '').length >= 10, 'Informe o telefone com DDD.'),
  notes: z.string().trim().max(1000, 'Observação muito longa.'),
});

export type CustomerFormInput = z.infer<typeof customerSchema>;
