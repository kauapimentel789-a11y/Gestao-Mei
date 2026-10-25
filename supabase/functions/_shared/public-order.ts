// Contrato das páginas públicas, usado pela Edge Function `encomenda` (Deno) e
// pelas páginas /e/<slug> (encomenda) e /agendar/<slug> (agendamento, plano
// Pro Max) do app. Só depende do zod.
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

// ---------------------------------------------------------------------------
// Agendamento pelo site
// ---------------------------------------------------------------------------

export const bookingPageRequest = z.object({
  action: z.literal('booking_page'),
  slug,
});

export const bookingSlotsRequest = z.object({
  action: z.literal('booking_slots'),
  slug,
  product_id: z.uuid(),
  day: z.iso.date(),
});

export const bookRequest = z.object({
  action: z.literal('book'),
  slug,
  idempotency_key: z.uuid(),
  product_id: z.uuid('Escolha o serviço.'),
  starts_at: z.iso.datetime({ offset: true, message: 'Escolha o horário.' }),
  name: z.string().trim().min(2, 'Informe seu nome.').max(120, 'Nome muito longo.'),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((v) => {
      const digits = v.replace(/\D/g, '').length;
      return digits >= 10 && digits <= 13;
    }, 'Informe o WhatsApp com DDD.'),
  notes: z.string().trim().max(1000, 'Observações muito longas.').nullable(),
});

export type BookRequest = z.infer<typeof bookRequest>;

// Link do cliente para ver, remarcar ou cancelar (/horario/<código>).
const manageToken = z.string().regex(/^[0-9a-f]{64}$/, 'Link inválido.');

export const bookingManageRequest = z.object({
  action: z.literal('booking_manage'),
  token: manageToken,
});

export const bookingManageSlotsRequest = z.object({
  action: z.literal('booking_manage_slots'),
  token: manageToken,
  day: z.iso.date(),
});

export const bookingRescheduleRequest = z.object({
  action: z.literal('booking_reschedule'),
  token: manageToken,
  starts_at: z.iso.datetime({ offset: true, message: 'Escolha o horário.' }),
});

export const bookingCancelRequest = z.object({
  action: z.literal('booking_cancel'),
  token: manageToken,
});

export interface BookingService {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  duration_minutes: number;
}

export interface BookingPage {
  name: string;
  slug: string;
  practice_area?: 'health' | 'professional' | 'beauty' | 'other' | null;
  /** Dados que o dono divulga na página (migração 0017); vazio não aparece. */
  tagline?: string | null;
  about?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  instagram?: string | null;
  /** Turnos de cada dia (HH:MM). */
  hours?: { weekday: number; opens_at: string; closes_at: string }[];
  /** Hoje e o último dia aceito, no fuso de Brasília (aaaa-mm-dd). */
  today: string;
  last_day: string;
  /** Dias da semana com atendimento (0 = domingo). */
  weekdays: number[];
  services: BookingService[];
}

export interface BookingSlots {
  day: string;
  slots: { at: string; label: string }[];
}

export interface BookingResult {
  number: number;
  total_cents: number;
  starts_at: string;
  /** Ex.: "10/11 às 14:00". */
  label: string;
  service: string;
  /** Código do link do cliente (migração 0018). */
  manage_token?: string;
}

export interface BookingManage {
  business: {
    name: string;
    slug: string;
    practice_area: 'health' | 'professional' | 'beauty' | 'other' | null;
    whatsapp: string | null;
    address: string | null;
  };
  number: number;
  service: string;
  total_cents: number;
  starts_at: string | null;
  minutes: number;
  label: string | null;
  /** past = já passou, foi concluído ou ficou sem horário. */
  status: 'active' | 'cancelled' | 'past';
  /** Dá para remarcar ou cancelar (até 2 horas antes). */
  can_change: boolean;
  today: string;
  last_day: string;
  weekdays: number[];
}

export const publicRequest = z.discriminatedUnion('action', [
  storefrontRequest,
  orderRequest,
  bookingPageRequest,
  bookingSlotsRequest,
  bookRequest,
  bookingManageRequest,
  bookingManageSlotsRequest,
  bookingRescheduleRequest,
  bookingCancelRequest,
]);

/** Erros que a função devolve, com o código HTTP e a mensagem para o cliente. */
export const PUBLIC_ERRORS: Record<string, { status: number; message: string }> = {
  not_found: { status: 404, message: 'Este link não está disponível.' },
  rate_limited: { status: 429, message: 'Muitos envios em pouco tempo. Tente de novo mais tarde.' },
  product_not_found: { status: 409, message: 'Um dos itens não está mais disponível. Atualize a página.' },
  invalid_due_date: { status: 400, message: 'Escolha uma data a partir de hoje e dentro de um ano.' },
  invalid_phone: { status: 400, message: 'Informe o WhatsApp com DDD.' },
  invalid_name: { status: 400, message: 'Informe seu nome.' },
  invalid_quantity: { status: 400, message: 'Quantidade inválida.' },
  duplicate_input: { status: 400, message: 'O mesmo item aparece duas vezes.' },
  slot_unavailable: { status: 409, message: 'Esse horário acabou de ser ocupado. Escolha outro.' },
  booking_locked: { status: 409, message: 'Este horário não pode mais ser mudado por aqui. Fale com a empresa.' },
  order_has_payments: { status: 409, message: 'Este horário já tem pagamento registrado. Para cancelar, fale com a empresa.' },
  invalid_request: { status: 400, message: 'Confira os dados e tente de novo.' },
};

export const GENERIC_ERROR = 'Não foi possível enviar agora. Tente de novo em instantes.';
