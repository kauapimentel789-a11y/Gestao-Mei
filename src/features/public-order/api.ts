import { FunctionsHttpError } from '@supabase/supabase-js';
import { useMutation, useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import {
  type BookingPage,
  type BookingResult,
  type BookingSlots,
  type BookRequest,
  GENERIC_ERROR,
  type OrderRequest,
  type OrderResult,
  type Storefront,
} from '../../../supabase/functions/_shared/public-order';

/** Erro já com a mensagem pronta para o cliente (vem da Edge Function). */
export class PublicOrderError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

async function call<T>(body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke('encomenda', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new PublicOrderError(payload?.message ?? GENERIC_ERROR, payload?.error ?? 'unknown');
    }
    throw new PublicOrderError(GENERIC_ERROR, 'network');
  }
  return data as T;
}

export function useStorefront(slug: string) {
  return useQuery({
    queryKey: ['public-storefront', slug],
    queryFn: () => call<Storefront>({ action: 'storefront', slug }),
    retry: (count, err) => !(err instanceof PublicOrderError && err.code === 'not_found') && count < 1,
  });
}

export function useSendPublicOrder() {
  return useMutation({
    mutationFn: (input: Omit<OrderRequest, 'action'>) => call<OrderResult>({ action: 'order', ...input }),
  });
}

// ---------------------------------------------------------------------------
// Agendamento pelo site (/agendar/<slug>)
// ---------------------------------------------------------------------------

export function useBookingPage(slug: string) {
  return useQuery({
    queryKey: ['public-booking', slug],
    queryFn: () => call<BookingPage>({ action: 'booking_page', slug }),
    retry: (count, err) => !(err instanceof PublicOrderError && err.code === 'not_found') && count < 1,
  });
}

export function useBookingSlots(slug: string, productId: string | null, day: string | null) {
  return useQuery({
    queryKey: ['public-booking', slug, 'slots', productId, day],
    enabled: Boolean(productId && day),
    queryFn: () => call<BookingSlots>({ action: 'booking_slots', slug, product_id: productId, day }),
    staleTime: 0,
  });
}

export function useBook() {
  return useMutation({
    mutationFn: (input: Omit<BookRequest, 'action'>) => call<BookingResult>({ action: 'book', ...input }),
  });
}
