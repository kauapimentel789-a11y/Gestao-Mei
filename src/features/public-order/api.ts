import { FunctionsHttpError } from '@supabase/supabase-js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import {
  type BookingPage,
  type BookingManage,
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

export function useBookingSlots(slug: string, productId: string | null, day: string | null, professionalId: string | null = null) {
  return useQuery({
    queryKey: ['public-booking', slug, 'slots', productId, day, professionalId],
    enabled: Boolean(productId && day),
    queryFn: () =>
      call<BookingSlots>({ action: 'booking_slots', slug, product_id: productId, day, ...(professionalId ? { professional_id: professionalId } : {}) }),
    staleTime: 0,
  });
}

export function useBook() {
  return useMutation({
    mutationFn: (input: Omit<BookRequest, 'action'>) => call<BookingResult>({ action: 'book', ...input }),
  });
}

// ---------------------------------------------------------------------------
// Link do cliente (/horario/<código>)
// ---------------------------------------------------------------------------

export function useBookingManage(token: string) {
  return useQuery({
    queryKey: ['public-booking-manage', token],
    queryFn: () => call<BookingManage>({ action: 'booking_manage', token }),
    retry: (count, err) => !(err instanceof PublicOrderError && err.code === 'not_found') && count < 1,
  });
}

export function useManageSlots(token: string, day: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['public-booking-manage', token, 'slots', day],
    enabled: Boolean(day) && enabled,
    queryFn: () => call<BookingSlots>({ action: 'booking_manage_slots', token, day }),
    staleTime: 0,
  });
}

export function useReschedule(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (startsAt: string) => call<BookingManage>({ action: 'booking_reschedule', token, starts_at: startsAt }),
    onSuccess: (data) => qc.setQueryData(['public-booking-manage', token], data),
  });
}

export function useCancelBooking(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => call<BookingManage>({ action: 'booking_cancel', token }),
    onSuccess: (data) => qc.setQueryData(['public-booking-manage', token], data),
  });
}
