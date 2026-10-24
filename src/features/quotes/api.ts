import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { OrderItemInput } from '@/features/orders/api';
import { orderKeys } from '@/features/orders/api';
import { supabase } from '@/lib/supabase';

import type { QuoteStatus } from './logic';

export interface QuoteSummary {
  id: string;
  number: number;
  status: QuoteStatus;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  valid_until: string | null;
  total_cents: number;
  order_id: string | null;
  order_number: number | null;
  created_at: string;
  items_summary: string | null;
}

export interface QuoteDetail extends QuoteSummary {
  notes: string | null;
  subtotal_cents: number;
  discount_cents: number;
  status_reason: string | null;
  customer_phone_digits: string | null;
  items: { id: string; position: number; description: string; unit: string; quantity: string; unit_price_cents: number; line_total_cents: number }[];
  history: { id: number; from_status: QuoteStatus | null; to_status: QuoteStatus; reason: string | null; changed_at: string }[];
}

const SUMMARY = 'id, number, status, customer_id, customer_name, customer_phone, valid_until, total_cents, order_id, order_number, created_at, items_summary';

export const quoteKeys = {
  all: (orgId: string) => ['quotes', orgId] as const,
  list: (orgId: string) => ['quotes', orgId, 'list'] as const,
  detail: (orgId: string, id: string) => ['quotes', orgId, 'detail', id] as const,
};

export function useQuotes(orgId: string) {
  return useQuery({
    queryKey: quoteKeys.list(orgId),
    queryFn: async (): Promise<QuoteSummary[]> => {
      const { data, error } = await supabase
        .from('quote_summaries')
        .select(SUMMARY)
        .eq('organization_id', orgId)
        .order('number', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as QuoteSummary[];
    },
  });
}

export function useQuote(orgId: string, id: string) {
  return useQuery({
    queryKey: quoteKeys.detail(orgId, id),
    queryFn: async (): Promise<QuoteDetail> => {
      const [summary, extra, items, history] = await Promise.all([
        supabase.from('quote_summaries').select(SUMMARY).eq('id', id).single(),
        supabase.from('quotes').select('notes, subtotal_cents, discount_cents, status_reason, customer:customers (phone_digits)').eq('id', id).single(),
        supabase
          .from('quote_items')
          .select('id, position, description, unit, quantity, unit_price_cents, line_total_cents')
          .eq('quote_id', id)
          .order('position'),
        supabase.from('quote_status_history').select('id, from_status, to_status, reason, changed_at').eq('quote_id', id).order('id'),
      ]);
      for (const r of [summary, extra, items, history]) if (r.error) throw r.error;
      const e = extra.data as unknown as {
        notes: string | null;
        subtotal_cents: number;
        discount_cents: number;
        status_reason: string | null;
        customer: { phone_digits: string | null } | null;
      };
      return {
        ...(summary.data as QuoteSummary),
        notes: e.notes,
        subtotal_cents: e.subtotal_cents,
        discount_cents: e.discount_cents,
        status_reason: e.status_reason,
        customer_phone_digits: e.customer?.phone_digits ?? null,
        items: items.data as QuoteDetail['items'],
        history: history.data as QuoteDetail['history'],
      };
    },
  });
}

export interface CreateQuoteInput {
  idempotencyKey: string;
  customerId: string | null;
  validUntil: string | null;
  notes: string;
  discountCents: number;
  items: OrderItemInput[];
}

export function useCreateQuote(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateQuoteInput): Promise<{ id: string; number: number }> => {
      const { data, error } = await supabase.rpc('create_quote', {
        p_organization_id: orgId,
        p_items: input.items,
        p_idempotency_key: input.idempotencyKey,
        p_customer_id: input.customerId,
        p_valid_until: input.validUntil,
        p_notes: input.notes || null,
        p_discount_cents: input.discountCents,
      });
      if (error) throw error;
      return data as { id: string; number: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: quoteKeys.all(orgId) }),
  });
}

export function useSetQuoteStatus(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: QuoteStatus; reason?: string }) => {
      const { error } = await supabase.rpc('set_quote_status', { p_quote_id: id, p_status: status, p_reason: reason || null });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: quoteKeys.all(orgId) }),
  });
}

export function useConvertQuote(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dueAt }: { id: string; dueAt: Date | null }): Promise<{ id: string; number: number }> => {
      const { data, error } = await supabase.rpc('convert_quote_to_order', { p_quote_id: id, p_due_at: dueAt?.toISOString() ?? null });
      if (error) throw error;
      return data as { id: string; number: number };
    },
    onSuccess: () =>
      Promise.all([qc.invalidateQueries({ queryKey: quoteKeys.all(orgId) }), qc.invalidateQueries({ queryKey: orderKeys.all(orgId) })]),
  });
}
