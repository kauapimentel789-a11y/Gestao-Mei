import { z } from 'zod';

const email = z.string().trim().min(1, 'Informe seu e-mail.').email('E-mail inválido.');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Informe sua senha.'),
});

export const signUpSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome.').max(80, 'Nome muito longo.'),
  email,
  password: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.').max(72, 'Senha muito longa.'),
});

export const resetSchema = z.object({ email });

export type LoginInput = z.infer<typeof loginSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ResetInput = z.infer<typeof resetSchema>;
