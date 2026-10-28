import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export interface ServiceInvoice {
  id: string;
  order_id: string;
  number: string;
  issued_on: string;
  amount_cents: number;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  /** Chave de acesso (50 números) quando a nota saiu pelo app (migração 0031). */
  access_key: string | null;
  source: 'manual' | 'emissor';
}

const COLUMNS = 'id, order_id, number, issued_on, amount_cents, cancelled_at, cancel_reason, created_at, access_key, source';

export const invoiceKeys = {
  all: (orgId: string) => ['service-invoices', orgId] as const,
  order: (orgId: string, orderId: string) => ['service-invoices', orgId, 'order', orderId] as const,
};

/** Notas registradas do pedido, a mais nova primeiro (as canceladas também). */
export function useOrderInvoices(orgId: string, orderId: string) {
  return useQuery({
    queryKey: invoiceKeys.order(orgId, orderId),
    queryFn: async (): Promise<ServiceInvoice[]> => {
      const { data, error } = await supabase
        .from('service_invoices')
        .select(COLUMNS)
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ServiceInvoice[];
    },
    retry: false,
  });
}

export function useRegisterInvoice(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { orderId: string; number: string; issuedOn: string }) => {
      const { error } = await supabase.rpc('register_service_invoice', {
        p_order_id: input.orderId,
        p_number: input.number,
        p_issued_on: input.issuedOn,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: invoiceKeys.all(orgId) }),
  });
}

export function useCancelInvoice(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; reason: string }) => {
      const { error } = await supabase.rpc('cancel_service_invoice', { p_invoice_id: input.id, p_reason: input.reason });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: invoiceKeys.all(orgId) }),
  });
}
