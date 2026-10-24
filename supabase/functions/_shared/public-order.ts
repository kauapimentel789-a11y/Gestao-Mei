// Contrato do link público de encomenda, usado pela Edge Function `encomenda`
// (Deno) e pela página /e/<slug> do app. Só depende do zod.
import { z } from 'zod';

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,46}[a-z0-9]$/;

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(SLUG_PATTERN, 'Link inválido.');

export const storefrontRequest = z.object({
  action: z.literal('storefront'),
  slug,
});

export const orderRequest = z.object({
  action: z.literal('order'),
  slug,
  idempotency_key: z.uuid(),
  name: z.string().trim().min(2, 'Informe seu nome.').max(120, 'Nome muito longo.'),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((v) => {
      const digits = v.replace(/\D/g, '').length;
      return digits >= 10 && digits <= 13;
    }, 'Informe o WhatsApp com DDD.'),
  due_date: z.iso.date().nullable(),
  notes: z.string().trim().max(1000, 'Observações muito longas.').nullable(),
  items: z
    .array(z.object({ product_id: z.uuid(), quantity: z.number().int().min(1).max(1000) }))
    .min(1, 'Escolha pelo menos um item.')
    .max(30, 'Itens demais numa encomenda.'),
});

export const publicRequest = z.discriminatedUnion('action', [storefrontRequest, orderRequest]);

export type OrderRequest = z.infer<typeof orderRequest>;

export interface StorefrontProduct {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  item_type: 'finished' | 'resale' | 'service';
  price_cents: number;
}

export interface Storefront {
  name: string;
  slug: string;
  business_type: 'production' | 'resale' | 'services';
  products: StorefrontProduct[];
}

export interface OrderResult {
  number: number;
  total_cents: number;
}

/** Erros que a função devolve, com o código HTTP e a mensagem para o cliente. */
export const PUBLIC_ERRORS: Record<string, { status: number; message: string }> = {
  not_found: { status: 404, message: 'Este link de encomenda não está disponível.' },
  rate_limited: { status: 429, message: 'Muitos envios em pouco tempo. Tente de novo mais tarde.' },
  product_not_found: { status: 409, message: 'Um dos itens não está mais disponível. Atualize a página.' },
  invalid_due_date: { status: 400, message: 'Escolha uma data a partir de hoje e dentro de um ano.' },
  invalid_phone: { status: 400, message: 'Informe o WhatsApp com DDD.' },
  invalid_name: { status: 400, message: 'Informe seu nome.' },
  invalid_quantity: { status: 400, message: 'Quantidade inválida.' },
  duplicate_input: { status: 400, message: 'O mesmo item aparece duas vezes.' },
  invalid_request: { status: 400, message: 'Confira os dados da encomenda.' },
};

export const GENERIC_ERROR = 'Não foi possível enviar agora. Tente de novo em instantes.';
