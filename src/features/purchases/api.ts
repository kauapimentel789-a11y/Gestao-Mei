import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { financeKeys } from '@/features/finance/api';
import type { PaymentMethod } from '@/features/finance/logic';
import { inventoryKeys } from '@/features/inventory/api';
import { productKeys } from '@/features/products/api';
import { supabase } from '@/lib/supabase';

export interface PurchaseSummary {
  id: string;
  number: number;
  status: 'received' | 'cancelled';
  supplier_id: string | null;
  supplier_name: string | null;
  purchase_date: string;
  invoice_ref: string | null;
  total_cents: number;
  entry_id: string | null;
  paid_cents: number;
  open_cents: number;
  due_date: string | null;
  items_summary: string | null;
  created_at: string;
}

export interface PurchaseItem {
  id: string;
  position: number;
  product_id: string;
  description: string;
  unit: string;
  quantity: string;
  unit_cost_cents: number;
  line_total_cents: number;
}

export interface PurchaseDetail extends PurchaseSummary {
  notes: string | null;
  cancel_reason: string | null;
  items: PurchaseItem[];
}

const SUMMARY =
  'id, number, status, supplier_id, supplier_name, purchase_date, invoice_ref, total_cents, entry_id, paid_cents, open_cents, due_date, items_summary, created_at';

export const purchaseKeys = {
  all: (orgId: string) => ['purchases', orgId] as const,
  list: (orgId: string) => ['purchases', orgId, 'list'] as const,
  detail: (orgId: string, id: string) => ['purchases', orgId, 'detail', id] as const,
  bySupplier: (orgId: string, supplierId: string) => ['purchases', orgId, 'supplier', supplierId] as const,
};

export function usePurchases(orgId: string) {
  return useQuery({
    queryKey: purchaseKeys.list(orgId),
    queryFn: async (): Promise<PurchaseSummary[]> => {
      const { data, error } = await supabase
        .from('purchase_summaries')
        .select(SUMMARY)
        .eq('organization_id', orgId)
        .order('purchase_date', { ascending: false })
        .order('number', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as PurchaseSummary[];
    },
  });
}

/** Compras de um fornecedor, da mais recente. */
export function useSupplierPurchases(orgId: string, supplierId: string) {
  return useQuery({
    queryKey: purchaseKeys.bySupplier(orgId, supplierId),
    enabled: Boolean(supplierId),
    queryFn: async (): Promise<PurchaseSummary[]> => {
      const { data, error } = await supabase
        .from('purchase_summaries')
        .select(SUMMARY)
        .eq('organization_id', orgId)
        .eq('supplier_id', supplierId)
        .order('purchase_date', { ascending: false })
        .order('number', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as PurchaseSummary[];
    },
  });
}

export function usePurchase(orgId: string, id: string) {
  return useQuery({
    queryKey: purchaseKeys.detail(orgId, id),
    queryFn: async (): Promise<PurchaseDetail> => {
      const [summary, extra, items] = await Promise.all([
        supabase.from('purchase_summaries').select(SUMMARY).eq('id', id).single(),
        supabase.from('purchases').select('notes, cancel_reason').eq('id', id).single(),
        supabase
          .from('purchase_items')
          .select('id, position, product_id, description, unit, quantity, unit_cost_cents, line_total_cents')
          .eq('purchase_id', id)
          .order('position'),
      ]);
      if (summary.error) throw summary.error;
      if (extra.error) throw extra.error;
      if (items.error) throw items.error;
      return { ...(summary.data as PurchaseSummary), ...(extra.data as { notes: string | null; cancel_reason: string | null }), items: items.data as PurchaseItem[] };
    },
  });
}

function useInvalidatePurchase(orgId: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: purchaseKeys.all(orgId) }),
      qc.invalidateQueries({ queryKey: productKeys.all(orgId) }),
      qc.invalidateQueries({ queryKey: inventoryKeys.all(orgId) }),
      qc.invalidateQueries({ queryKey: financeKeys.all(orgId) }),
    ]);
}

export interface CreatePurchaseInput {
  idempotencyKey: string;
  supplierId: string | null;
  purchaseDate: string;
  dueDate: string;
  invoiceRef: string;
  notes: string;
  items: { product_id: string; quantity: number; unit_cost_cents: number }[];
  paid: { accountId: string; method: PaymentMethod } | null;
}

export function useCreatePurchase(orgId: string) {
  const invalidate = useInvalidatePurchase(orgId);
  return useMutation({
    mutationFn: async (input: CreatePurchaseInput): Promise<{ id: string; number: number }> => {
      const { data, error } = await supabase.rpc('create_purchase', {
        p_organization_id: orgId,
        p_items: input.items,
        p_idempotency_key: input.idempotencyKey,
        p_supplier_id: input.supplierId,
        p_purchase_date: input.purchaseDate,
        p_due_date: input.dueDate,
        p_invoice_ref: input.invoiceRef || null,
        p_notes: input.notes || null,
        p_paid_account_id: input.paid?.accountId ?? null,
        p_paid_method: input.paid?.method ?? null,
      });
      if (error) throw error;
      return data as { id: string; number: number };
    },
    onSuccess: invalidate,
  });
}

export function useCancelPurchase(orgId: string) {
  const invalidate = useInvalidatePurchase(orgId);
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc('cancel_purchase', { p_purchase_id: id, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
